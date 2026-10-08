// Dev check for typo and gibberish handling against a running server (use the mocks). Usage: BASE=http://localhost:3100 node scripts/names-check.mjs
const B = process.env.BASE || "http://localhost:3000"; let cookie = "";
const call = async (p, b, m = "POST") => { const r = await fetch(B + p, { method: m, headers: { "content-type": "application/json", cookie }, body: b ? JSON.stringify(b) : undefined }); const s = r.headers.get("set-cookie"); if (s) cookie = s.split(";")[0]; return { status: r.status, ...(await r.json()) }; };
await call("/api/auth/signup", { email: `n${Date.now()}@example.com`, password: "password123" });
await call("/api/credentials", { provider: "tinyfish", key: "tf-mock-key-0000000000" });
await call("/api/credentials", { provider: "gemini", key: "AIzaMockKey0000000000" });
for (const input of process.argv.slice(2).length ? process.argv.slice(2) : ["stripe.con", "htp://stripe.com", "strpe", "notoin", "patagonai", "asdfghjkl", "qwertyuiop", "zzzzzz", "stripee payments", "xqzvbn corp", "🙂🙂", "stripe . com"]) {
  const r = await call("/api/explore", { url: input });
  if (r.error) { console.log(`${JSON.stringify(input).padEnd(22)} REJECTED  ${r.error.message}`); continue; }
  let j; do { await new Promise((x) => setTimeout(x, 700)); j = await call(`/api/jobs/${r.jobId}`, null, "GET"); } while (j.status === "running" && !(j.events || []).some((e) => e.stage === "discover"));
  const ev = (j.events || []).find((e) => e.stage === "resolve" && e.status === "done");
  console.log(`${JSON.stringify(input).padEnd(22)} ${j.status === "error" ? "ERROR     " + j.error.message + (j.error.suggestion ? "  [suggest " + j.error.suggestion + "]" : "") : "RESOLVED  " + (ev ? ev.label : "?")}`);
}
