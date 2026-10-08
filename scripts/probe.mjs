// Shows what TinyFish Fetch actually returns for a URL, so extraction assumptions can be checked.
// Usage: TINYFISH_API_KEY=... node scripts/probe.mjs https://example.com
const url = process.argv[2];
const key = process.env.TINYFISH_API_KEY;
if (!url || !key) { console.error("usage: TINYFISH_API_KEY=... node scripts/probe.mjs <url>"); process.exit(1); }
const count = (s, re) => (s.match(re) ?? []).length;
async function go(label, body) {
  const r = await fetch(process.env.TINYFISH_FETCH_URL || "https://api.fetch.tinyfish.ai", { method: "POST", headers: { "X-API-Key": key, "Content-Type": "application/json" }, body: JSON.stringify({ urls: [url], ttl: 0, ...body }) });
  const j = await r.json().catch(() => ({}));
  const t = j.results?.[0]?.text ?? "";
  console.log(`\n--- ${label}  (HTTP ${r.status}) len=${t.length}`);
  console.log({ a_href: count(t, /<a\s[^>]*href/gi), md_links: count(t, /\]\(http/g), link_tag: count(t, /<link\b/gi), style_tag: count(t, /<style\b/gi), style_attr: count(t, /style="/gi), img: count(t, /<img\b/gi), svg: count(t, /<svg\b/gi), header: count(t, /<header\b/gi), errors: j.errors });
  console.log(t.slice(0, 300).replace(/\s+/g, " "));
}
await go("html + links + image_links + page_metadata", { format: "html", links: true, image_links: true, page_metadata: true });
// Browser API availability (needed for measuring real colours/fonts):
const b = await fetch(process.env.TINYFISH_BROWSER_URL || "https://api.browser.tinyfish.ai", { method: "POST", headers: { "X-API-Key": key, "Content-Type": "application/json" }, body: JSON.stringify({ url }) });
const bj = await b.json().catch(() => ({}));
console.log("
--- browser session", b.status, b.status === 201 ? "OK (cdp_url received)" : JSON.stringify(bj).slice(0, 300));
if (bj.session_id) await fetch((process.env.TINYFISH_BROWSER_URL || "https://api.browser.tinyfish.ai") + "/" + bj.session_id, { method: "DELETE", headers: { "X-API-Key": key } });
