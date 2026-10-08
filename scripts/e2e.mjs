// End-to-end API check against a running dev server. Usage: node scripts/e2e.mjs <tinyfishKey> <geminiKey> <url...>
const [key, gkey, ...urls] = process.argv.slice(2);
const B = process.env.BASE || "http://localhost:3000";
let cookie = "";
const call = async (path, body, method = "POST") => {
  const r = await fetch(B + path, { method, headers: { "content-type": "application/json", cookie }, body: body ? JSON.stringify(body) : undefined });
  const sc = r.headers.get("set-cookie"); if (sc) cookie = sc.split(";")[0];
  return { status: r.status, json: await r.json() };
};
const email = `t${Date.now()}@example.com`;
console.log("signup", (await call("/api/auth/signup", { email, password: "password123" })).status);
console.log("explore w/o key ->", (await call("/api/explore", { url: urls[0] })).json.error?.code);
console.log("bad key ->", (await call("/api/credentials", { provider: "tinyfish", key: "tf-wrong-key-123456" })).json.error?.code);
const ok = await call("/api/credentials", { provider: "tinyfish", key });
console.log("tinyfish key ->", ok.status);
console.log("explore w/o gemini ->", JSON.stringify((await call("/api/explore", { url: urls[0] })).json.error));
console.log("bad gemini ->", (await call("/api/credentials", { provider: "gemini", key: "AIzaBadKey000000000" })).json.error?.code);
console.log("gemini key ->", (await call("/api/credentials", { provider: "gemini", key: gkey })).status);
for (const u of urls) {
  const { json: j } = await call("/api/explore", { url: u });
  let job; const t0 = Date.now();
  do { await new Promise((r) => setTimeout(r, 800)); try { job = (await call(`/api/jobs/${j.jobId}`, null, "GET")).json; } catch { job = { status: "running" }; } } while (job.status === "running");
  console.log(`\n== ${u} -> ${job.status} in ${((Date.now() - t0) / 1000).toFixed(1)}s`, job.error ?? "");
  console.log(job.events.map((e) => `  ${e.status} ${e.stage}: ${e.label}${e.detail ? " [" + e.detail.slice(0, 80) + "]" : ""}`).join("\n"));
  if (job.brandId) {
    const b = (await call(`/api/brands/${job.brandId}`, null, "GET")).json, d = b.dna;
    console.log(JSON.stringify({ name: d.brand.name, tagline: d.brand.tagline, primary: d.colors.primary?.hex, sec: d.colors.secondary.map((c) => c.hex), bg: d.colors.background.map((c) => c.hex), text: d.colors.text.map((c) => c.hex), fonts: [d.typography.heading?.value, d.typography.body?.value, d.typography.mono?.value], weights: d.typography.weights?.value, logo: !!d.logo.primary, favicon: d.logo.favicon?.value, tone: d.voice.tone.value, ctas: d.messaging.ctas.map((c) => c.value), vps: d.messaging.value_propositions.length, terms: d.voice.terminology.slice(0, 5).map((t) => t.value), conf: d.confidence, pages: d.evidence.pages.map((p) => p.kind), warn: d.validation.warnings }, null, 1));
  }
}
const ex = await call("/api/extract", { url: urls[0] });
console.log("\n/api/extract cached:", ex.json._meta?.cached, " /api/guide:", Object.keys((await call("/api/guide", { url: urls[0] })).json).length, "keys", " /api/context:", (await call("/api/context", { url: urls[0] })).json.text?.length, "chars");
console.log("invalid url ->", (await call("/api/extract", { url: "not a url" })).json.error?.message);
