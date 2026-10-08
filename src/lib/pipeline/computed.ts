import { createBrowserSession, endBrowserSession } from "../tinyfish";
import type { Computed } from "./types";

// Runs inside the live page (rendered by a TinyFish Browser session). Plain string on purpose: no bundler transforms.
const PROBE = String.raw`(() => {
  const cv = document.createElement("canvas"); cv.width = cv.height = 1;
  const cx = cv.getContext("2d", { willReadFrequently: true });
  const norm = (c) => {
    if (!c || c === "transparent") return null;
    try { cx.clearRect(0, 0, 1, 1); cx.fillStyle = "#000"; cx.fillStyle = c; cx.fillRect(0, 0, 1, 1);
      const d = cx.getImageData(0, 0, 1, 1).data; if (d[3] < 128) return null;
      return "#" + [d[0], d[1], d[2]].map((v) => v.toString(16).padStart(2, "0")).join("").toUpperCase(); } catch (e) { return null; }
  };
  const add = (m, k, n) => { if (k) m[k] = (m[k] || 0) + n; };
  const GENERIC = /^(serif|sans-serif|monospace|cursive|fantasy|system-ui|ui-[a-z-]+|-apple-system|blinkmacsystemfont|emoji|math|segoe ui|helvetica neue|helvetica|arial|roboto|apple color emoji|segoe ui emoji|noto color emoji|times new roman|courier new|menlo|consolas|monaco|sfmono-regular|sf mono)$/i;
  const family = (ff) => { const parts = (ff || "").split(","); for (const p of parts) { let f = p.replace(/["']/g, "").trim(); f = f.replace(/^__/, "").replace(/_[a-f0-9]{5,}$/i, "").replace(/_/g, " ").trim(); if (f && !GENERIC.test(f) && !/fallback$/i.test(f)) return f; } return null; };
  const isMono = (ff) => /mono|code|courier|consolas|menlo/i.test(ff || "");
  const out = { elements: 0, bgArea: {}, textLen: {}, buttonBg: {}, buttonText: {}, brandVars: [], themeColor: null,
    fonts: { heading: {}, body: {}, mono: {}, loaded: [] }, weights: {}, hierarchy: [], radii: {}, shadows: 0, uppercase: 0, tightTracking: 0, styled: 0,
    gradients: [], ctas: [], logos: [], favicon: null };
  const docW = Math.max(document.documentElement.scrollWidth, innerWidth);
  const els = Array.from(document.body.querySelectorAll("*")).slice(0, 4000);
  const seenLevels = {}; const bodyTally = {};
  const isBtnLike = (el) => !!el.closest("button, a, [role=button], nav, header, footer");
  const grad = {};
  for (const el of els) {
    const tag = el.tagName.toLowerCase();
    if (/^(script|style|noscript|svg|path|link|meta|br|template)$/.test(tag)) continue;
    const cs = getComputedStyle(el);
    if (cs.display === "none" || cs.visibility === "hidden" || parseFloat(cs.opacity) < 0.1) continue;
    const r = el.getBoundingClientRect();
    if (r.width < 1 || r.height < 1) continue;
    out.elements++;
    const area = Math.min(r.width, docW) * Math.min(r.height, 1600);
    const bg = norm(cs.backgroundColor);
    if (bg && area > 1500) add(out.bgArea, bg, area);
    if (cs.backgroundImage && cs.backgroundImage.indexOf("gradient(") >= 0 && area > 1500) add(grad, cs.backgroundImage.slice(0, 220), area);
    let len = 0;
    for (const n of el.childNodes) if (n.nodeType === 3) len += n.textContent.trim().length;
    if (len > 0) {
      out.styled++;
      const col = norm(cs.color); if (col) add(out.textLen, col, len);
      const fam = family(cs.fontFamily);
      const bucket = /^h[1-4]$/.test(tag) ? out.fonts.heading : isMono(cs.fontFamily) ? out.fonts.mono : out.fonts.body;
      if (fam) add(bucket, fam, len);
      add(out.weights, String(parseInt(cs.fontWeight, 10) || 400), len);
      if (cs.textTransform === "uppercase") out.uppercase++;
      if (/^h[1-3]$/.test(tag) && parseFloat(cs.letterSpacing) < 0) out.tightTracking++;
      if (/^h[1-3]$/.test(tag)) { if (!seenLevels[tag]) { seenLevels[tag] = 1; out.hierarchy.push({ level: tag, size: cs.fontSize, weight: cs.fontWeight, font: family(cs.fontFamily) || "", letterSpacing: cs.letterSpacing, lineHeight: cs.lineHeight }); } }
      else if (!/^h[4-6]$/.test(tag) && !isBtnLike(el)) { const k = cs.fontSize + "|" + cs.fontWeight; const e = bodyTally[k] || (bodyTally[k] = { n: 0, font: family(cs.fontFamily) || "", ls: cs.letterSpacing, lh: cs.lineHeight }); e.n += len; }
    }
    if (bg || parseFloat(cs.borderTopWidth) > 0) { const rad = cs.borderTopLeftRadius; if (rad && rad !== "0px") add(out.radii, rad, 1); }
    if (cs.boxShadow && cs.boxShadow !== "none") out.shadows++;
    const isBtn = tag === "button" || el.getAttribute("role") === "button" || (tag === "a" && /(^|[-_ ])(btn|button|cta)([-_ ]|$)/i.test(el.className || ""));
    const text = (el.innerText || "").trim();
    if ((isBtn || (tag === "a" && bg && parseFloat(cs.paddingLeft) >= 10)) && text.length >= 2 && text.length <= 32 && r.width < 420 && bg) {
      add(out.buttonBg, bg, 1); add(out.buttonText, norm(cs.color), 1);
      if (out.ctas.length < 24) out.ctas.push({ text: text.replace(/\s+/g, " "), bg: bg, color: norm(cs.color) || "" });
    }
  }
  const bt = Object.entries(bodyTally).sort((a, b) => b[1].n - a[1].n)[0];
  if (bt) { const kv = bt[0].split("|"); out.hierarchy.push({ level: "p", size: kv[0], weight: kv[1], font: bt[1].font, letterSpacing: bt[1].ls, lineHeight: bt[1].lh }); }
  out.gradients = Object.entries(grad).sort((a, b) => b[1] - a[1]).slice(0, 3).map((e) => ({ css: e[0], area: e[1] }));
  try { out.fonts.loaded = Array.from(document.fonts).filter((f) => f.status === "loaded").map((f) => f.family.replace(/["']/g, "")).filter((v, i, a) => a.indexOf(v) === i).slice(0, 12); } catch (e) {}
  try {
    for (const sh of Array.from(document.styleSheets)) { let rules; try { rules = sh.cssRules; } catch (e) { continue; }
      for (const rule of Array.from(rules)) { if (rule.style && /^(:root|html|body)$/.test(rule.selectorText || "")) {
        for (const name of Array.from(rule.style)) { if (name.indexOf("--") === 0 && /brand|primary|accent|cta|highlight/i.test(name)) { const hex = norm(rule.style.getPropertyValue(name).trim()); if (hex && out.brandVars.length < 12) out.brandVars.push({ name: name, hex: hex }); } } } } }
  } catch (e) {}
  const tc = document.querySelector('meta[name="theme-color"]'); if (tc) out.themeColor = norm(tc.content);
  const ic = Array.from(document.querySelectorAll('link[rel~="icon"]')).sort((a, b) => parseInt((b.sizes && b.sizes.value) || "0") - parseInt((a.sizes && a.sizes.value) || "0"))[0];
  out.favicon = ic ? ic.href : null;
  // Logos: only marks that belong to THIS site. Partner / customer / integration logos live in page sections, so we require
  // the mark to sit in the header or footer, or inside a link that points home, or to carry the brand's own name.
  const stem = location.hostname.replace(/^www\./, "").split(".")[0].toLowerCase();
  const isHomeLink = (a) => { try { const u = new URL(a.href, location.href); return u.origin === location.origin && (u.pathname === "/" || u.pathname === ""); } catch (e) { return false; } };
  const cands = Array.from(document.querySelectorAll("header img, header svg, nav img, nav svg, footer img, footer svg, a img, a svg, img[alt*='logo' i], img[src*='logo' i]"));
  const seen = new Set();
  for (const el of cands) {
    if (el.closest("main section, [class*='customer' i], [class*='partner' i], [class*='integration' i], [class*='testimonial' i], [class*='trusted' i], [class*='marquee' i], [class*='carousel' i]") && !el.closest("header, nav, footer")) continue;
    const r = el.getBoundingClientRect(); if (r.width < 16 || r.width > 420 || r.height < 10 || r.height > 140) continue;
    const a = el.closest("a");
    const sig = [el.getAttribute("class"), el.getAttribute("alt"), el.getAttribute("src"), el.getAttribute("aria-label"), el.parentElement && el.parentElement.className, a && a.getAttribute("aria-label")].join(" ").toLowerCase();
    if (/arrow|chevron|menu|search|avatar|sprite|close|caret|icon-/.test(sig) && !/logo/.test(sig)) continue;
    const where = el.closest("header, nav") ? "header" : el.closest("footer") ? "footer" : "page";
    const home = !!(a && isHomeLink(a));
    const named = sig.indexOf(stem) >= 0;
    const marked = /logo|brand|wordmark/.test(sig);
    if (!(home || named || (marked && where !== "page"))) continue;
    let kind = home && where === "header" ? "home link in the header" : home ? "home link in the " + where : named ? "carries the brand name" : "marked as logo in the " + where;
    let value = null;
    if (el.tagName.toLowerCase() === "img") value = el.currentSrc || el.src;
    else { const html = el.outerHTML; if (html.length < 30000) { value = "data:image/svg+xml;base64," + btoa(unescape(encodeURIComponent(html.indexOf("xmlns") > 0 ? html : html.replace("<svg", '<svg xmlns="http://www.w3.org/2000/svg"')))); } }
    if (value && !seen.has(value)) { seen.add(value); out.logos.push({ value: value, signal: kind, inHeader: where === "header" }); }
    if (out.logos.length >= 4) break;
  }
  return JSON.stringify(out);
})()`;

// ---- minimal CDP client over the WebSocket built into Node 22 ----
class CDP {
  private ws: WebSocket; private id = 0; private pending = new Map<number, { res: (v: any) => void; rej: (e: Error) => void }>();
  private constructor(ws: WebSocket) {
    this.ws = ws;
    ws.addEventListener("message", (m: MessageEvent) => {
      const d = JSON.parse(String(m.data));
      const p = d.id !== undefined ? this.pending.get(d.id) : undefined;
      if (p) { this.pending.delete(d.id); d.error ? p.rej(new Error(d.error.message)) : p.res(d.result); }
    });
  }
  static open(url: string) {
    return new Promise<CDP>((res, rej) => {
      const ws = new WebSocket(url);
      const t = setTimeout(() => rej(new Error("cdp connect timeout")), 30_000);
      ws.addEventListener("open", () => { clearTimeout(t); res(new CDP(ws)); });
      ws.addEventListener("error", () => { clearTimeout(t); rej(new Error("cdp connect failed")); });
    });
  }
  send(method: string, params: object = {}, sessionId?: string, timeout = 30_000): Promise<any> {
    const id = ++this.id;
    return new Promise((res, rej) => {
      const t = setTimeout(() => { this.pending.delete(id); rej(new Error(`cdp timeout ${method}`)); }, timeout);
      this.pending.set(id, { res: (v) => { clearTimeout(t); res(v); }, rej: (e) => { clearTimeout(t); rej(e); } });
      this.ws.send(JSON.stringify({ id, method, params, ...(sessionId ? { sessionId } : {}) }));
    });
  }
  close() { try { this.ws.close(); } catch {} }
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function waitReady(cdp: CDP, sid: string) {
  for (let i = 0; i < 40; i++) {
    try { const r = await cdp.send("Runtime.evaluate", { expression: "document.readyState", returnByValue: true }, sid, 10_000); if (r.result?.value === "complete") break; } catch {}
    await sleep(500);
  }
  await sleep(1800); // let client-rendered content and web fonts settle
}

const merge = (a: Record<string, number>, b: Record<string, number>) => { for (const [k, v] of Object.entries(b)) a[k] = (a[k] ?? 0) + v; };

// Opens a TinyFish Browser session, renders the given pages and measures real computed styles. null if unavailable.
export async function measurePages(key: string, urls: string[]): Promise<Computed | null> {
  const session = await createBrowserSession(key, urls[0]);
  if (!session) return null;
  let cdp: CDP | null = null;
  try {
    cdp = await CDP.open(session.cdp_url);
    const { targetInfos } = await cdp.send("Target.getTargets");
    let targetId = targetInfos?.find((t: any) => t.type === "page")?.targetId;
    if (!targetId) targetId = (await cdp.send("Target.createTarget", { url: "about:blank" })).targetId;
    const { sessionId } = await cdp.send("Target.attachToTarget", { targetId, flatten: true });
    await cdp.send("Page.enable", {}, sessionId);
    await cdp.send("Emulation.setDeviceMetricsOverride", { width: 1440, height: 900, deviceScaleFactor: 1, mobile: false }, sessionId).catch(() => {});

    const acc: Computed = { pages: [], elements: 0, bgArea: {}, textLen: {}, buttonBg: {}, buttonText: {}, brandVars: [], themeColor: null, fonts: { heading: {}, body: {}, mono: {}, loaded: [] }, weights: {}, hierarchy: [], radii: {}, shadows: 0, uppercase: 0, tightTracking: 0, styled: 0, gradients: [], ctas: [], logos: [], favicon: null };
    for (const [i, url] of urls.entries()) {
      try {
        await cdp.send("Page.navigate", { url }, sessionId, 30_000);
        await waitReady(cdp, sessionId);
        const r = await cdp.send("Runtime.evaluate", { expression: PROBE, returnByValue: true }, sessionId, 45_000);
        const d = JSON.parse(r.result?.value ?? "null");
        if (!d || d.elements < 5) continue;
        acc.pages.push(url); acc.elements += d.elements; acc.shadows += d.shadows; acc.uppercase += d.uppercase; acc.tightTracking += d.tightTracking; acc.styled += d.styled;
        for (const k of ["bgArea", "textLen", "buttonBg", "buttonText", "weights", "radii"] as const) merge(acc[k], d[k]);
        for (const k of ["heading", "body", "mono"] as const) merge(acc.fonts[k], d.fonts[k]);
        acc.fonts.loaded = [...new Set([...acc.fonts.loaded, ...d.fonts.loaded])];
        acc.brandVars.push(...d.brandVars.filter((v: any) => !acc.brandVars.some((x) => x.hex === v.hex && x.name === v.name)));
        acc.themeColor ??= d.themeColor; acc.favicon ??= d.favicon;
        if (!acc.hierarchy.length) acc.hierarchy = d.hierarchy;
        acc.gradients.push(...d.gradients); acc.ctas.push(...d.ctas);
        if (i === 0) acc.logos = d.logos;
      } catch { /* a page that fails to render is skipped */ }
    }
    return acc.pages.length ? acc : null;
  } catch {
    return null;
  } finally {
    cdp?.close();
    await endBrowserSession(key, session.session_id);
  }
}
