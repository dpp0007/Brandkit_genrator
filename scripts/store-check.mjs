// Dev check for the data layer through the API: duplicate sign-up, history, delete, sign out. BASE=... node scripts/store-check.mjs
const B = process.env.BASE || "http://localhost:3000"; let cookie = "";
const call = async (p, b, m = "POST") => { const r = await fetch(B + p, { method: m, headers: { "content-type": "application/json", cookie }, body: b ? JSON.stringify(b) : undefined }); const s = r.headers.get("set-cookie"); if (s) cookie = s.split(";")[0]; return { status: r.status, ...(await r.json().catch(() => ({}))) }; };
const email = `s${Date.now()}@example.com`;
console.log("signup", (await call("/api/auth/signup", { email, password: "password123" })).status);
console.log("duplicate signup ->", (await call("/api/auth/signup", { email, password: "password123" })).error?.message);
console.log("wrong password ->", (await call("/api/auth/signin", { email, password: "nope-nope-1" })).error?.message);
await call("/api/credentials", { provider: "tinyfish", key: "tf-mock-key-0000000000" }); await call("/api/credentials", { provider: "gemini", key: "AIzaMockKey0000000000" });
console.log("credentials ->", JSON.stringify((await call("/api/credentials", null, "GET")).tinyfish));
const r = await call("/api/extract", { url: "https://linear.app" });
const list1 = (await call("/api/brands", null, "GET")).brands;
console.log("history ->", list1.map((b) => `${b.name} v${b.versions}`).join(", "));
await call("/api/extract", { url: "https://linear.app", refresh: true });
const list2 = (await call("/api/brands", null, "GET")).brands;
console.log("after re-analyse ->", list2.map((b) => `${b.name} v${b.versions}`).join(", "));
console.log("delete ->", (await call(`/api/brands/${list2[0].id}`, null, "DELETE")).status, "| remaining:", (await call("/api/brands", null, "GET")).brands.length);
console.log("replace key ->", (await call("/api/credentials", { provider: "gemini", key: "AIzaMockKey0000000000" })).status, "| delete key ->", (await call("/api/credentials?provider=gemini", null, "DELETE")).gemini?.connected);
await call("/api/auth/signout"); console.log("after signout /api/brands ->", (await call("/api/brands", null, "GET")).status);
