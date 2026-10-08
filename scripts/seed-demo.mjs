// Dev helper: signs in as the local demo user, saves the mock keys, and explores the given URLs.
const B = "http://localhost:3000"; let cookie = "";
const call = async (p, b, m = "POST") => { const r = await fetch(B + p, { method: m, headers: { "content-type": "application/json", cookie }, body: b ? JSON.stringify(b) : undefined }); const s = r.headers.get("set-cookie"); if (s) cookie = s.split(";")[0]; return r.json(); };
await call("/api/auth/signin", { email: "demo@brandmeld.test", password: "demo-password-1" });
await call("/api/credentials", { provider: "tinyfish", key: "tf-mock-key-0000000000" });
await call("/api/credentials", { provider: "gemini", key: "AIzaMockKey0000000000" });
for (const u of process.argv.slice(2)) {
  const { jobId, error } = await call("/api/explore", { url: u, refresh: true });
  if (error) { console.log(u, error.message); continue; }
  let j; do { await new Promise((r) => setTimeout(r, 1000)); j = await call(`/api/jobs/${jobId}`, null, "GET"); } while (j.status === "running");
  console.log(u, j.status, j.brandId ?? j.error?.message);
}
