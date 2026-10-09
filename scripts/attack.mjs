// Security self-test: tries to exploit a RUNNING BrandMeld instance (use the local mock setup, never someone else's site).
// Usage: BASE=http://localhost:3100 node scripts/attack.mjs
const B = process.env.BASE || "http://localhost:3100";
let fails = 0;
const check = (name, ok, detail = "") => { console.log((ok ? "pass " : "FAIL ") + name + (detail ? "  [" + detail + "]" : "")); if (!ok) fails++; };

const jar = () => ({ cookie: "" });
async function call(who, path, { method = "POST", body, headers = {}, raw } = {}) {
  const r = await fetch(B + path, { method, headers: { "content-type": "application/json", ...(who?.cookie ? { cookie: who.cookie } : {}), ...headers }, body: raw ?? (body ? JSON.stringify(body) : undefined), redirect: "manual" });
  const sc = r.headers.get("set-cookie"); if (sc && who) who.cookie = sc.split(";")[0];
  let j = {}; try { j = await r.json(); } catch {}
  return { status: r.status, headers: r.headers, ...j };
}
const signup = async (tag) => { const u = jar(); const email = `${tag}${Date.now()}@example.com`; await call(u, "/api/auth/signup", { body: { email, password: "password123" } }); u.email = email; return u; };
const keys = async (u) => { await call(u, "/api/credentials", { body: { provider: "tinyfish", key: "tf-mock-key-0000000000" } }); await call(u, "/api/credentials", { body: { provider: "gemini", key: "AIzaMockKey0000000000" } }); };

const alice = await signup("alice"), mallory = await signup("mallory");
await keys(alice);
const ex = await call(alice, "/api/extract", { body: { url: "https://linear.app" } });
const brandId = ex._meta?.brand_id;
check("setup: alice has a brand", !!brandId);

// 1. NoSQL operator injection through every string input
for (const payload of [{ $ne: null }, { $gt: "" }, { $regex: ".*" }]) {
  const r = await call(null, "/api/auth/signin", { body: { email: payload, password: payload } });
  check("login with operator object " + JSON.stringify(payload), r.status === 401 && !r.headers.get("set-cookie"));
}
check("login email = {$ne:null}, password real", (await call(null, "/api/auth/signin", { body: { email: { $ne: null }, password: "password123" } })).status === 401);
const inj = await call(mallory, "/api/brands/" + encodeURIComponent('{"$ne":null}'), { method: "GET" });
check("brand id = operator string -> not found", inj.status === 404);
check("explore url as object is coerced, not executed", [200, 400, 422, 428].includes((await call(mallory, "/api/explore", { body: { url: { $ne: 1 }, refresh: { $ne: 1 } } })).status));

// 2. Other users' data (IDOR)
check("mallory cannot read alice's brand", (await call(mallory, `/api/brands/${brandId}`, { method: "GET" })).status === 404);
check("mallory cannot delete alice's brand", ((await call(mallory, `/api/brands/${brandId}`, { method: "DELETE" })), (await call(alice, `/api/brands/${brandId}`, { method: "GET" })).status === 200));
check("mallory's history is empty", ((await call(mallory, "/api/brands", { method: "GET" })).brands ?? []).length === 0);
const job = await call(alice, "/api/explore", { body: { url: "https://stripe.com" } });
check("mallory cannot read alice's job", (await call(mallory, `/api/jobs/${job.jobId}`, { method: "GET" })).status === 404);
check("api keys are never returned", !JSON.stringify(await call(alice, "/api/credentials", { method: "GET" })).includes("tf-mock-key"));

// 3. Authentication
for (const [m, p] of [["GET", "/api/brands"], ["GET", "/api/credentials"], ["POST", "/api/extract"], ["POST", "/api/explore"], ["POST", "/api/guide"], ["POST", "/api/context"], ["DELETE", "/api/credentials?provider=gemini"], ["GET", "/api/brands/x"]])
  check(`${m} ${p} without a session -> 401`, (await call(null, p, { method: m, body: m === "POST" ? { url: "https://linear.app" } : undefined })).status === 401);
const tampered = { cookie: alice.cookie.slice(0, -2) + (alice.cookie.endsWith("AA") ? "BB" : "AA") };
check("tampered session cookie rejected", (await call(tampered, "/api/brands", { method: "GET" })).status === 401);
const [v] = alice.cookie.split("=")[1].split(".");
check("unsigned cookie body rejected", (await call({ cookie: `${alice.cookie.split("=")[0]}=${v}.` }, "/api/brands", { method: "GET" })).status === 401);
const forgedBody = Buffer.from(JSON.stringify({ u: "someone-else", e: "x@y.z", x: Date.now() + 1e9 })).toString("base64url");
check("forged session for another user rejected", (await call({ cookie: `${alice.cookie.split("=")[0]}=${forgedBody}.AAAA` }, "/api/brands", { method: "GET" })).status === 401);

// 4. Cross-site requests
check("cross-site POST blocked (Origin: evil)", (await call(alice, "/api/credentials", { method: "DELETE", headers: { origin: "https://evil.example" } })).status === 403);
check("same-site POST allowed", (await call(alice, "/api/auth/me", { method: "GET", headers: { origin: new URL(B).origin } })).status === 200);

// 4b. Account enumeration (before the brute-force step uses up the IP limit)
const miss = await call(null, "/api/auth/signin", { body: { email: "nobody@example.com", password: "password123" } });
const wrong = await call(null, "/api/auth/signin", { body: { email: alice.email, password: "not-the-password" } }).catch(() => ({}));
check("unknown email and wrong password look the same", miss.error?.message === "Email or password is incorrect." && (wrong.status === 429 || wrong.error?.message === miss.error?.message));

// 5. Abuse and limits
check("oversized body refused", (await call(alice, "/api/explore", { body: { url: "x".repeat(40000) } })).status === 413);
check("non-object JSON body tolerated", [400, 422].includes((await call(alice, "/api/explore", { raw: "[1,2,3]" })).status));
check("garbage JSON -> 400", (await call(alice, "/api/explore", { raw: "{nope" })).status === 400);
check("1 MB password rejected without hashing", (await call(null, "/api/auth/signup", { body: { email: "big@example.com", password: "p".repeat(5000) } })).status === 400);
let limited = 0; for (let i = 0; i < 12; i++) if ((await call(null, "/api/auth/signin", { body: { email: alice.email, password: "wrong-" + i } })).status === 429) limited++;
check("brute force on one account gets rate limited", limited > 0, limited + " blocked");

// 6. Input that should never reach a provider
for (const bad of ["http://169.254.169.254/latest/meta-data", "http://localhost:3000", "https://127.0.0.1", "ftp://example.com", "file:///etc/passwd", "javascript:alert(1)", "<script>alert(1)</script>"]) {
  const r = await call(alice, "/api/explore", { body: { url: bad } });
  let blocked = r.status >= 400;
  if (!blocked && r.jobId) { let j; do { await new Promise((x) => setTimeout(x, 400)); j = await call(alice, `/api/jobs/${r.jobId}`, { method: "GET" }); } while (j.status === "running"); blocked = j.status === "error"; }
  check("refuses " + bad.slice(0, 40), blocked);
}

// 7. Response headers and error hygiene
const h = (await call(null, "/api/health", { method: "GET" })).headers;
check("security headers set", h.get("x-frame-options") === "DENY" && h.get("x-content-type-options") === "nosniff" && !!h.get("content-security-policy") && !h.get("x-powered-by"));
const e = await call(alice, "/api/brands/..%2F..%2Fetc%2Fpasswd", { method: "GET" });
check("errors don't leak internals", !JSON.stringify(e).match(/at .*\(|node_modules|mongodb:\/\//i), JSON.stringify(e).slice(0, 80));
console.log(fails ? `\n${fails} FAILED` : "\nall checks passed");
process.exit(fails ? 1 : 0);
