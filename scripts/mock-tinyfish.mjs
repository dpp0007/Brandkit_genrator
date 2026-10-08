// DEV-ONLY stand-ins for the TinyFish APIs, so BrandMeld can be tested without spending a real key.
//   :4010  Fetch   - mimics the documented behaviour: "semantic HTML" main content (no head/styles/nav) plus links, image_links, page_metadata.
//   :4011  Browser - hands out a CDP URL for a local headless Chrome/Edge (set CHROME_PATH if it is not found).
//   Search + Gemini endpoints are also faked on :4010.
// Run: npm run mock. Then start the app with:
//   TINYFISH_FETCH_URL=http://localhost:4010 TINYFISH_BROWSER_URL=http://localhost:4011 GEMINI_API_BASE=http://localhost:4010/v1beta
// Keys: TinyFish tf-mock-key-0000000000, Gemini AIzaMockKey0000000000. Never used unless those env vars are set.
import http from "node:http";
import { spawn } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import * as cheerio from "cheerio";

const KEY = "tf-mock-key-0000000000", GKEY = "AIzaMockKey0000000000";
const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/124 Safari/537.36";
const json = (res, c, o) => { res.writeHead(c, { "content-type": "application/json" }); res.end(JSON.stringify(o)); };
const readBody = async (req) => { let raw = ""; for await (const c of req) raw += c; return JSON.parse(raw || "{}"); };

async function fetchOne(url) {
  const r = await fetch(url, { redirect: "follow", headers: { "user-agent": UA, accept: "text/html,*/*" }, signal: AbortSignal.timeout(30000) });
  if (!r.ok) return { error: r.status === 404 ? "page_not_found" : "target_http_error", url, status: r.status };
  const $ = cheerio.load(await r.text());
  const abs = (h) => { try { return new URL(h, r.url).href; } catch { return null; } };
  const links = [...new Set($("a[href]").map((_, a) => abs($(a).attr("href"))).get().filter((h) => h && /^https?:/.test(h)))];
  const image_links = [...new Set($("img[src]").map((_, i) => abs($(i).attr("src"))).get().filter(Boolean))];
  const meta = (n) => $(`meta[name="${n}"]`).attr("content") ?? null;
  const icon = $('link[rel~="icon"]').attr("href");
  const page_metadata = { favicon: icon ? abs(icon) : null, og: { image: $('meta[property="og:image"]').attr("content") ?? null }, other: { "theme-color": meta("theme-color") } };
  const title = $('meta[property="og:title"]').attr("content") || $("title").text() || null;
  const description = $('meta[property="og:description"]').attr("content") || meta("description");
  $("head,script,style,noscript,svg,template,header,nav,footer,iframe").remove(); // "semantic" main content only
  return { result: { url, final_url: r.url, title, description, language: "en", format: "html", text: $("body").html() ?? "", links, image_links, page_metadata } };
}

http.createServer(async (req, res) => {
  try {
    if (req.url.startsWith("/v1beta/")) { // Gemini: validates the key; generateContent left unimplemented so BrandMeld falls back
      if (req.headers["x-goog-api-key"] !== GKEY) return json(res, 400, { error: { status: "INVALID_ARGUMENT", message: "API key not valid.", details: [{ reason: "API_KEY_INVALID" }] } });
      return req.url.includes("generateContent") ? json(res, 500, { error: "mock" }) : json(res, 200, { models: [] });
    }
    if (req.headers["x-api-key"] !== KEY) return json(res, 401, { error: { code: "INVALID_API_KEY" } });
    if (req.method === "GET") { // tiny typo-tolerant "search index" so name resolution can be tested
      const q = (new URL(req.url, "http://x").searchParams.get("query") || "").toLowerCase().replace(/ official (website|site)$/, "");
      const first = q.split(" ")[0].replace(/[^a-z0-9]/g, "");
      const lev = (a, b) => { const d = Array.from({ length: a.length + 1 }, (_, i) => [i, ...Array(b.length).fill(0)]); for (let j = 1; j <= b.length; j++) d[0][j] = j; for (let i = 1; i <= a.length; i++) for (let j = 1; j <= b.length; j++) d[i][j] = Math.min(d[i-1][j] + 1, d[i][j-1] + 1, d[i-1][j-1] + (a[i-1] === b[j-1] ? 0 : 1)); return d[a.length][b.length]; };
      const index = ["stripe.com", "linear.app", "notion.so", "patagonia.com", "vercel.com", "figma.com"];
      const hits = first.length < 3 ? [] : index.filter((d) => lev(d.split(".")[0], first) <= 2).map((d, i) => ({ position: i + 1, title: d, snippet: "", url: "https://" + d + "/" }));
      return json(res, 200, { query: q, results: hits.length ? [{ position: 0, title: "wiki", snippet: "", url: "https://en.wikipedia.org/wiki/" + first }, ...hits] : [], total_results: hits.length, page: 0 });
    }
    const { urls = [] } = await readBody(req);
    const results = [], errors = [];
    await Promise.all(urls.map(async (u) => { try { const o = await fetchOne(u); o.result ? results.push(o.result) : errors.push(o); } catch (e) { errors.push({ url: u, error: "target_unreachable" }); } }));
    json(res, 200, { results, errors });
  } catch { json(res, 500, { error: "mock" }); }
}).listen(4010, () => console.log("mock tinyfish fetch/search/gemini on :4010"));

// ---- Browser API stand-in ----
const exe = process.env.CHROME_PATH || [
  "C:/Program Files/Google/Chrome/Application/chrome.exe", "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe",
  "/usr/bin/google-chrome", "/usr/bin/chromium", "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
].find((p) => fs.existsSync(p));
if (exe) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "bm-chrome-"));
  spawn(exe, ["--headless=new", "--remote-debugging-port=9333", `--user-data-dir=${dir}`, "--no-first-run", "--disable-gpu", "about:blank"], { stdio: "ignore" });
}
http.createServer(async (req, res) => {
  if (req.headers["x-api-key"] !== KEY) return json(res, 401, { error: { code: "INVALID_API_KEY" } });
  if (req.method === "DELETE") { res.writeHead(204); return res.end(); }
  try {
    const v = await (await fetch("http://127.0.0.1:9333/json/version")).json();
    json(res, 201, { session_id: "mock-" + Date.now(), cdp_url: v.webSocketDebuggerUrl, base_url: "http://localhost:4011" });
  } catch { json(res, 503, { error: { code: "SERVICE_BUSY" } }); }
}).listen(4011, () => console.log(exe ? "mock tinyfish browser on :4011 (local headless Chrome)" : "mock browser: no Chrome/Edge found; sessions will 503"));
