import * as cheerio from "cheerio";
import { AppError } from "../http";
import { tfFetch, tfSearch, TFResult } from "../tinyfish";
import type { Emit, Page, ScoutOutput } from "./types";

const PRIORITY: [RegExp, string, number][] = [
  [/^\/(about|company|story|mission|why)/i, "about", 10],
  [/^\/(products?|platform|features?|solutions?|product)/i, "product", 9],
  [/^\/(pricing|plans)/i, "pricing", 8],
  [/^\/(customers?|case-stud)/i, "customers", 6],
  [/^\/(blog|news|stories|resources|changelog)/i, "blog", 5],
  [/^\/(careers?|jobs|culture|values)/i, "careers", 5],
  [/^\/(contact|brand|press|design)/i, "contact", 4],
];
const SKIP = /\.(pdf|png|jpe?g|gif|svg|zip|webp|mp4|xml|json|ico|css|js)$|\/(login|signin|sign-in|signup|auth|cart|checkout|legal|privacy|terms|cookie)/i;
const bare = (h: string) => h.replace(/^www\./, "");

const NOT_OFFICIAL = /(wikipedia|linkedin|facebook|twitter|x\.com|instagram|youtube|crunchbase|reddit|bloomberg|glassdoor|g2\.com|capterra|trustpilot|medium\.com|quora|pinterest|tiktok|forbes|techcrunch|producthunt|apps\.apple|play\.google|github\.com|yelp|indeed|zoominfo|pitchbook|owler|similarweb|alternativeto|softwareadvice|sourceforge|wikidata|imdb|amazon\.)/i;
// Optimal string alignment distance (counts a swap of two neighbouring letters as one typo).
function dl(a: string, b: string) {
  const d = Array.from({ length: a.length + 1 }, (_, i) => [i, ...Array(b.length).fill(0)]);
  for (let j = 1; j <= b.length; j++) d[0][j] = j;
  for (let i = 1; i <= a.length; i++) for (let j = 1; j <= b.length; j++) {
    d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) d[i][j] = Math.min(d[i][j], d[i - 2][j - 2] + 1);
  }
  return d[a.length][b.length];
}
const compact = (x: string) => x.toLowerCase().replace(/[^a-z0-9]/g, "");

// Accepts a URL, a bare domain, or a company name. Names are resolved with TinyFish Search, scored for how well the
// result's domain matches the name, and finally probed with common domain guesses. `note` reports what was chosen.
export async function resolveTarget(key: string, input: string, note?: (msg: string) => void): Promise<string> {
  const s = input.trim().replace(/\s+/g, " ");
  if (!s) throw new AppError("INVALID_URL", "Enter a website URL or a company name.");
  const looksLikeUrl = /^https?:\/\//i.test(s) || /^[a-z0-9-]+(\.[a-z0-9-]+)+(\/\S*)?$/i.test(s);
  if (looksLikeUrl) {
    let u: URL;
    try { u = new URL(/^https?:/i.test(s) ? s : "https://" + s); } catch { throw new AppError("INVALID_URL", "That doesn't look like a valid URL."); }
    if (!/^https?:$/.test(u.protocol) || !u.hostname.includes(".") || /^(localhost|\d+\.\d+\.\d+\.\d+)$/.test(u.hostname) || u.hostname.endsWith(".local"))
      throw new AppError("INVALID_URL", "Enter a public website, for example https://company.com.");
    return u.origin;
  }
  if (s.length < 2 || s.length > 80 || /[<>{}|\\]/.test(s)) throw new AppError("INVALID_URL", "Enter a website URL or a company name.");

  // 1. TinyFish Search, two phrasings, scored by how well the domain matches the name.
  const name = compact(s), words = s.toLowerCase().split(" ").map(compact).filter((w) => w.length > 1);
  const seen = new Map<string, number>();
  const typo = new Map<string, string>(), near = new Map<string, number>();
  for (const q of [`${s} official website`, s]) {
    const hits = await tfSearch(key, q);
    hits.forEach((h, i) => {
      try {
        const u = new URL(h.url);
        if (NOT_OFFICIAL.test(u.hostname)) return;
        const stem = compact(bare(u.hostname).split(".").slice(0, -1).join("") || bare(u.hostname));
        let score = Math.max(0, 6 - i) * 0.5;
        const allow = name.length <= 3 ? 0 : name.length <= 6 ? 1 : 2; // typos tolerated, by name length
        const dist = dl(stem, name);
        if (stem === name) score += 6; else if (name.length >= 3 && (stem.startsWith(name) || stem.endsWith(name))) score += 4; else if (name.length >= 4 && stem.includes(name)) score += 2.5;
        else if (words.length > 1 && words.every((w) => stem.includes(w))) score += 3;
        else if (allow && dist <= allow) { score += 4.5; typo.set(u.origin, stem); } // "strpe" -> stripe, "notoin" -> notion
        if (dist <= Math.max(2, Math.floor(name.length / 3))) near.set(u.origin, Math.min(near.get(u.origin) ?? 9, dist));
        if (u.pathname === "/" || u.pathname === "") score += 1;
        seen.set(u.origin, (seen.get(u.origin) ?? 0) + score);
      } catch {}
    });
    if ([...seen.values()].some((v) => v >= 6)) break;
  }
  const best = [...seen.entries()].sort((a, b) => b[1] - a[1])[0];
  if (best && best[1] >= 2) { note?.(typo.has(best[0]) ? `Matched "${s}" to ${new URL(best[0]).hostname} (assuming a small typo)` : `Matched "${s}" to ${new URL(best[0]).hostname}`); return best[0]; }

  // 2. Search found nothing convincing: probe likely domains through TinyFish Fetch.
  const slug = compact(s);
  if (slug.length >= 2) {
    const guesses = ["com", "io", "ai", "app", "co", "so", "dev"].map((tld) => `https://${slug}.${tld}`);
    const r = await tfFetch(key, guesses.slice(0, 7), { format: "markdown" });
    const ok = guesses.map((g) => r.results.find((x) => x.url === g)).find((x) => x && (x.text?.length ?? 0) > 200);
    if (ok) { const o = new URL(ok.final_url || ok.url).origin; note?.(`Matched "${s}" to ${new URL(o).hostname}`); return o; }
  }
  // Nothing convincing. If a result is only loosely similar, offer it as a suggestion instead of guessing.
  const close = [...near.entries()].sort((a, b) => a[1] - b[1] || (seen.get(b[0]) ?? 0) - (seen.get(a[0]) ?? 0))[0];
  if (close) throw new AppError("INVALID_URL", `We couldn't find "${s}". Did you mean ${new URL(close[0]).hostname.replace(/^www\./, "")}?`, 422, { suggestion: close[0] });
  throw new AppError("INVALID_URL", `We couldn't find a website for "${s}". Check the spelling, or enter its web address, for example ${slug || "company"}.com.`);
}

function classify(path: string) {
  if (path === "/" || path === "") return "home";
  return PRIORITY.find(([re]) => re.test(path))?.[1] ?? "other";
}

// Score same-site links (from TinyFish Fetch `links`) by how much they say about the brand.
function discover(origin: string, links: string[], base: string) {
  const host = bare(new URL(origin).hostname);
  const found = new Map<string, number>();
  for (const l of links) {
    try {
      const u = new URL(l, base);
      if (bare(u.hostname) !== host || SKIP.test(u.pathname)) continue;
      const p = u.pathname.replace(/\/$/, "") || "/";
      if (p === "/" || /^\/[a-z]{2}(-[a-z]{2})?$/i.test(p)) continue; // home, locale switchers
      const hit = PRIORITY.find(([re]) => re.test(p));
      const depth = p.split("/").filter(Boolean).length;
      const score = hit ? hit[2] - (depth - 1) * 2 : depth === 1 && p.length <= 20 ? 1 : 0;
      if (score > 0) found.set(u.origin + p, Math.max(found.get(u.origin + p) ?? 0, score));
    } catch {}
  }
  return [...found.entries()].sort((a, b) => b[1] - a[1]).map(([u]) => u);
}

function toPage(r: TFResult): Page {
  const $ = cheerio.load(r.text || "");
  const meta = r.page_metadata ?? null;
  const title = (r.title || $("title").first().text() || "").trim();
  const description = (r.description || $('meta[name="description"]').attr("content") || "").trim();
  $("script,style,noscript,svg,template").remove();
  const text = $("body").text().replace(/\s+/g, " ").trim() || $.root().text().replace(/\s+/g, " ").trim();
  const final = r.final_url || r.url;
  return { url: final, kind: classify(new URL(final).pathname.replace(/\/$/, "")), title, description, html: r.text || "", text, links: r.links ?? [], imageLinks: r.image_links ?? [], meta };
}

const OPTS = { format: "html", links: true, imageLinks: true, pageMetadata: true } as const;

function blocked(err: { error?: string } | undefined) {
  const e = err?.error ?? "";
  if (e === "bot_blocked") return new AppError("BLOCKED", "We couldn't access this website. It may be blocking automated access. Try another public URL.", 422);
  if (e === "login_required") return new AppError("UNSUPPORTED", "This website sends visitors to a login page, so there is no public brand content to read.", 422);
  if (e === "empty_content") return new AppError("UNSUPPORTED", "This website returned no readable content. It may need a login or be built without public pages.", 422);
  return new AppError("UNAVAILABLE", "This website didn't respond. Check the address, or try again later.", 422);
}

export async function siteScout(key: string, origin: string, emit: Emit): Promise<ScoutOutput> {
  const warnings: string[] = [];
  const evidence: ScoutOutput["evidence"] = [];

  emit("connect", "active", `Connecting to ${new URL(origin).hostname} through TinyFish`);
  const home = await tfFetch(key, [origin], OPTS);
  if (!home.results.length) throw blocked(home.errors[0]);
  const homePage = toPage(home.results[0]);
  if (homePage.text.length < 80) throw blocked({ error: "empty_content" });
  homePage.kind = "home"; // the entry page is the homepage even if it redirects (e.g. /in)
  emit("connect", "done", "Connected to website");
  emit("homepage", "done", "Found homepage", homePage.title || undefined);
  evidence.push({ url: homePage.url, kind: "home", note: `Homepage fetched live: ${homePage.links.length} links, ${homePage.imageLinks.length} images` });

  emit("discover", "active", "Looking for pages that define the brand");
  const host = bare(new URL(origin).hostname);
  let candidates = discover(origin, homePage.links, homePage.url).slice(0, 6);
  let guessed = false;
  if (candidates.length < 3) {
    // Few usable links: ask TinyFish Search for pages on this site, and probe common brand paths.
    guessed = true;
    const hits = (await tfSearch(key, `site:${host}`)).map((h) => {
      try { const u = new URL(h.url); return bare(u.hostname) === host && !SKIP.test(u.pathname) && u.pathname !== "/" ? u.origin + u.pathname.replace(/\/$/, "") : ""; } catch { return ""; }
    }).filter(Boolean);
    const common = ["/about", "/pricing", "/product", "/features", "/solutions", "/blog", "/careers", "/company"].map((p) => origin + p);
    candidates = [...new Set([...candidates, ...hits, ...common])].slice(0, 6);
  }
  emit("discover", "done", `Selected ${candidates.length} brand-relevant pages`, candidates.map((c) => new URL(c).pathname).join("  "));

  const pages: Page[] = [homePage];
  emit("pages", "active", `Reading ${candidates.length} more pages`);
  const r = await tfFetch(key, candidates, OPTS);
  for (const x of r.results) { const p = toPage(x); if (p.text.length > 100 && !pages.some((q) => q.url === p.url)) pages.push(p); }
  if (!guessed) for (const e of r.errors) warnings.push(`Could not read ${e.url} (${e.error})`);
  emit("pages", pages.length > 1 ? "done" : "warn", `Read ${pages.length} page${pages.length > 1 ? "s" : ""}`, pages.map((p) => p.kind).join(", "));
  for (const p of pages) evidence.push({ url: p.url, kind: p.kind, note: `${p.text.length} chars of text` });
  if (pages.length < 2) warnings.push("Only the homepage could be read, so messaging evidence comes from a single page.");

  return { origin, pages, stylesheets: [], computed: null, evidence, warnings };
}
