import * as cheerio from "cheerio";
import type { Evidence, Finding, ScoutOutput, Visual } from "./types";

// ---------- colour helpers ----------
export type RGB = [number, number, number];
export const hex = ([r, g, b]: RGB) => "#" + [r, g, b].map((v) => Math.round(v).toString(16).padStart(2, "0")).join("").toUpperCase();
export const parseHex = (h: string): RGB => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16)) as RGB;
export function hsl([r, g, b]: RGB) {
  r /= 255; g /= 255; b /= 255;
  const mx = Math.max(r, g, b), mn = Math.min(r, g, b), l = (mx + mn) / 2, d = mx - mn;
  const s = d === 0 ? 0 : d / (1 - Math.abs(2 * l - 1));
  let h = 0;
  if (d) h = mx === r ? ((g - b) / d) % 6 : mx === g ? (b - r) / d + 2 : (r - g) / d + 4;
  return { h: (h * 60 + 360) % 360, s, l };
}
export const dist = (a: RGB, b: RGB) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
function hslToRgb(h: number, s: number, l: number): RGB {
  const k = (n: number) => (n + h / 30) % 12, a = s * Math.min(l, 1 - l);
  const f = (n: number) => l - a * Math.max(-1, Math.min(k(n) - 3, Math.min(9 - k(n), 1)));
  return [f(0) * 255, f(8) * 255, f(4) * 255];
}
const COLOR_RE = /#([0-9a-f]{8}|[0-9a-f]{6}|[0-9a-f]{3})\b|rgba?\(\s*([\d.]+)[\s,]+([\d.]+)[\s,]+([\d.]+)(?:\s*[,/]\s*([\d.]+%?))?\s*\)|hsla?\(\s*([\d.]+)(?:deg)?[\s,]+([\d.]+)%[\s,]+([\d.]+)%(?:\s*[,/]\s*([\d.]+%?))?\s*\)/gi;
const alphaOf = (a?: string) => (a === undefined ? 1 : a.endsWith("%") ? parseFloat(a) / 100 : parseFloat(a));
export function extractColors(value: string): string[] {
  const out: string[] = [];
  for (const m of value.matchAll(COLOR_RE)) {
    if (m[1]) {
      let h = m[1];
      if (h.length === 3) h = h.split("").map((c) => c + c).join("");
      if (h.length === 8 && parseInt(h.slice(6), 16) < 128) continue;
      out.push("#" + h.slice(0, 6).toUpperCase());
    } else if (m[2] !== undefined) {
      if (alphaOf(m[5]) < 0.5) continue;
      out.push(hex([+m[2], +m[3], +m[4]]));
    } else if (m[6] !== undefined) {
      if (alphaOf(m[9]) < 0.5) continue;
      out.push(hex(hslToRgb(+m[6], +m[7] / 100, +m[8] / 100)));
    }
  }
  return out;
}

// ---------- source collection ----------
type Source = { url: string; css: string; kind: string };
function sources(s: ScoutOutput): Source[] {
  const out: Source[] = s.stylesheets.map((x) => ({ url: x.url, css: x.css, kind: "stylesheet" }));
  for (const p of s.pages) {
    const $ = cheerio.load(p.html);
    const inlineBlocks = $("style").map((_, e) => $(e).text()).get().join("\n");
    const attrs = $("[style]").map((_, e) => `x{${$(e).attr("style")}}`).get().join("\n");
    out.push({ url: p.url, css: (inlineBlocks + "\n" + attrs).slice(0, 400_000), kind: "page" });
  }
  return out;
}

type Rule = { sel: string; decls: [string, string][]; src: Source };
function rules(srcs: Source[]): Rule[] {
  const out: Rule[] = [];
  for (const src of srcs) {
    const css = src.css.replace(/\/\*[\s\S]*?\*\//g, "");
    for (const m of css.matchAll(/([^{}@][^{}]*)\{([^{}]*)\}/g)) {
      const decls: [string, string][] = [];
      for (const d of m[2].matchAll(/([a-z-]+)\s*:\s*([^;]+)/gi)) decls.push([d[1].toLowerCase(), d[2].trim()]);
      out.push({ sel: m[1].trim().toLowerCase(), decls, src });
    }
    for (const m of css.matchAll(/@font-face\s*\{([^}]*)\}/gi)) {
      const fam = /font-family\s*:\s*([^;]+)/i.exec(m[1]);
      if (fam) out.push({ sel: "@font-face", decls: [["font-family", fam[1].trim()]], src });
    }
  }
  return out;
}

const bump = <K>(m: Map<K, Map<string, number>>, k: K, url: string, n = 1) => {
  const inner = m.get(k) ?? m.set(k, new Map()).get(k)!;
  inner.set(url, (inner.get(url) ?? 0) + n);
};
const total = (m?: Map<string, number>) => [...(m?.values() ?? [])].reduce((a, b) => a + b, 0);
const topUrls = (m: Map<string, number>, n = 3) => [...m.entries()].sort((a, b) => b[1] - a[1]).slice(0, n).map(([u]) => u);

const GENERIC = /^(serif|sans-serif|monospace|cursive|fantasy|system-ui|ui-[a-z-]+|-apple-system|blinkmacsystemfont|inherit|initial|unset|emoji|math|var\(.*|segoe ui|helvetica neue|helvetica|arial|apple color emoji|segoe ui emoji|segoe ui symbol|noto color emoji|courier new|times new roman)$/i;
export function cleanFont(raw: string): string | null {
  let f = raw.split(",")[0].replace(/["']/g, "").trim();
  f = f.replace(/^__/, "").replace(/_[a-f0-9]{5,}$/i, "").replace(/_/g, " ").trim();
  if (!f || GENERIC.test(f) || /fallback$/i.test(f) || f.length > 40 || /^-?[\d.]+(px|rem|em|%)?$/.test(f) || /^(normal|bold|italic|oblique|lighter|bolder)$/i.test(f) || /[:;\\(){}]/.test(f) || /[^ -~]/.test(f)) return null;
  return f;
}

// ---------- extractor ----------
export function extractVisual(s: ScoutOutput): Visual {
  const srcs = sources(s);
  const all = rules(srcs);
  const pageCount = s.pages.length;
  const home = s.pages[0];

  // custom-property table so font-family: var(--x) can be resolved
  const vars = new Map<string, string>();
  for (const r of all) for (const [p, val] of r.decls) if (p.startsWith("--") && !vars.has(p)) vars.set(p, val);
  const resolve = (val: string, depth = 0): string => {
    const m = /^var\(\s*(--[\w-]+)\s*(?:,\s*(.*))?\)$/.exec(val.trim());
    if (!m || depth > 4) return val;
    return resolve(vars.get(m[1]) ?? m[2] ?? val, depth + 1);
  };

  const colorRole = new Map<string, Record<string, number>>();
  const colorUrls = new Map<string, Map<string, number>>();
  const roleNote = new Map<string, Set<string>>();
  const gradients = new Map<string, Map<string, number>>();
  const addColor = (c: string, role: string, url: string, weight: number, note?: string) => {
    const r = colorRole.get(c) ?? colorRole.set(c, { bg: 0, text: 0, other: 0, brand: 0 }).get(c)!;
    r[role] += weight;
    bump(colorUrls, c, url, weight);
    if (note) (roleNote.get(c) ?? roleNote.set(c, new Set()).get(c)!).add(note);
  };

  const fontRole = new Map<string, Record<string, number>>();
  const fontUrls = new Map<string, Map<string, number>>();
  const weights = new Map<number, number>();
  const radii = new Map<string, number>();
  let shadows = 0, uppercase = 0, tracking = 0, decls = 0;
  const hierarchy: Record<string, { size: string; weight: string; font: string }> = {};

  for (const r of all) {
    const brandSel = /btn|button|cta|primary|brand|accent|hero|link/.test(r.sel);
    const role = /(^|[\s,.#>])h[1-3]\b|heading|title|display|hero/.test(r.sel) ? "heading" : /code|pre\b|mono|kbd/.test(r.sel) ? "mono" : /body|html|^p\b|\.p\b|text|prose|:root|\*/.test(r.sel) ? "body" : "other";
    for (const [prop, val] of r.decls) {
      decls++;
      if (/gradient\(/i.test(val) && /^(background|background-image)$/.test(prop)) {
        const g = val.match(/(linear|radial|conic)-gradient\([^;]*?\)(?=\s*(?:,|$))/i)?.[0] ?? val.slice(0, 120);
        if (extractColors(g).length >= 2) bump(gradients, g.slice(0, 160), r.src.url);
        continue;
      }
      if (prop.startsWith("--")) {
        const brandVar = /primary|brand|accent|cta|highlight/.test(prop);
        const vrole = brandVar ? "brand" : /(^|-)(text|fg|foreground|content)(-|$)/.test(prop) ? "text" : /(^|-)(bg|background|surface|canvas)(-|$)/.test(prop) ? "bg" : "other";
        for (const c of extractColors(val)) addColor(c, vrole, r.src.url, brandVar ? 6 : vrole === "other" ? 1 : 2, brandVar ? `defined as design token ${prop}` : undefined);
        if (/font|family|sans|serif|mono/.test(prop)) { const f = cleanFont(val); if (f) { bump(fontUrls, f, r.src.url); const x = fontRole.get(f) ?? fontRole.set(f, { heading: 0, body: 0, mono: 0, other: 0 }).get(f)!; x[/mono|code/.test(prop) ? "mono" : /head|display|title/.test(prop) ? "heading" : /body|sans|text/.test(prop) ? "body" : "other"] += 3; } }
        continue;
      }
      if (/^(background|background-color)$/.test(prop)) for (const c of extractColors(val)) addColor(c, "bg", r.src.url, brandSel ? 5 : 1, brandSel ? "used as a button/CTA background" : undefined);
      else if (prop === "color") for (const c of extractColors(val)) addColor(c, "text", r.src.url, 1);
      else if (/^(border(-[a-z]+)?-color|border|fill|stroke|outline-color|accent-color)$/.test(prop)) for (const c of extractColors(val)) addColor(c, "other", r.src.url, 0.5);
      else if (prop === "font-family") {
        const f = cleanFont(resolve(val));
        if (f) {
          bump(fontUrls, f, r.src.url);
          const x = fontRole.get(f) ?? fontRole.set(f, { heading: 0, body: 0, mono: 0, other: 0 }).get(f)!;
          x[r.sel === "@font-face" ? "other" : /mono|courier|consolas|menlo/i.test(val) && role !== "heading" ? "mono" : role] += r.sel === "@font-face" ? 1 : 2;
        }
      } else if (prop === "font" && /\d(px|rem|em|%)(\/[\d.a-z%]+)?\s+\S/.test(val)) {
        const f = cleanFont(val.replace(/^.*?\d(?:px|rem|em|%)(?:\/[\d.a-z%]+)?\s+/, ""));
        if (f) { bump(fontUrls, f, r.src.url); (fontRole.get(f) ?? fontRole.set(f, { heading: 0, body: 0, mono: 0, other: 0 }).get(f)!)[role] += 1; }
      } else if (prop === "font-weight") {
        const w = val === "bold" ? 700 : val === "normal" ? 400 : parseInt(val, 10);
        if (w >= 100 && w <= 900) weights.set(w, (weights.get(w) ?? 0) + 1);
      } else if (prop === "border-radius") { const v = val.split(/\s+/)[0]; radii.set(v, (radii.get(v) ?? 0) + 1); }
      else if (prop === "box-shadow" && val !== "none") shadows++;
      else if (prop === "text-transform" && val === "uppercase") uppercase++;
      else if (prop === "letter-spacing" && /^-/.test(val)) tracking++;
    }
    for (const lvl of ["h1", "h2", "h3", "body", "p"]) {
      if (!hierarchy[lvl] && r.sel.split(",").some((x) => x.trim() === lvl) && r.decls.some(([p]) => p === "font-size")) {
        const d = Object.fromEntries(r.decls);
        hierarchy[lvl] = { size: d["font-size"] ?? "", weight: d["font-weight"] ?? "", font: cleanFont(d["font-family"] ?? "") ?? "" };
      }
    }
  }

  // theme-color is an explicit brand signal
  for (const p of s.pages) {
    const tc = cheerio.load(p.html)('meta[name="theme-color"]').attr("content");
    for (const c of extractColors(tc ?? "")) addColor(c, "brand", p.url, 8, "declared as the site's theme-color");
  }
  // Google Fonts links name fonts explicitly
  for (const p of s.pages) {
    for (const m of p.html.matchAll(/fonts\.googleapis\.com\/css2?\?family=([^&"'\s]+)/g)) {
      for (const fam of decodeURIComponent(m[1]).split("|").concat(m[1].split("&family="))) {
        const f = cleanFont(fam.split(":")[0].replace(/\+/g, " "));
        if (f) { bump(fontUrls, f, p.url, 2); (fontRole.get(f) ?? fontRole.set(f, { heading: 0, body: 0, mono: 0, other: 0 }).get(f)!).other += 2; }
      }
    }
  }

  const spread = (c: string) => colorUrls.get(c)?.size ?? 0;
  const conf = (c: string) => Math.min(0.97, 0.4 + 0.25 * Math.min(1, spread(c) / Math.max(1, Math.min(pageCount + s.stylesheets.length, 4))) + 0.32 * Math.min(1, total(colorUrls.get(c)) / 25));
  const ev = (c: string, why: string): Evidence[] =>
    topUrls(colorUrls.get(c) ?? new Map()).map((u) => ({ url: u, reason: `${why} (${colorUrls.get(c)!.get(u)} weighted occurrences in ${u.endsWith(".css") || u.includes(".css?") ? "stylesheet" : "page styles"}).` }));
  const mk = (c: string, why: string): Finding => ({ value: c, confidence: +conf(c).toFixed(2), evidence: ev(c, why) });

  const entries = [...colorRole.entries()].map(([c, r]) => {
    const rgb = parseHex(c), h = hsl(rgb);
    return { c, rgb, ...h, r, score: r.bg * 1.5 + r.other + r.text * 0.8 + r.brand * 3, chroma: h.s > 0.28 && h.l > 0.1 && h.l < 0.93 };
  });
  const chromatic = entries.filter((e) => e.chroma).sort((a, b) => b.score - a.score);
  const neutral = entries.filter((e) => !e.chroma).sort((a, b) => b.score - a.score);
  const picked: RGB[] = [];
  const pick = (list: typeof entries, n: number) => {
    const out: typeof entries = [];
    for (const e of list) { if (out.length >= n) break; if (picked.every((p) => dist(p, e.rgb) > 55)) { picked.push(e.rgb); out.push(e); } }
    return out;
  };
  let primary: Finding | null = null;
  const pe = pick(chromatic, 1)[0] ?? pick(neutral.filter((e) => e.l < 0.3), 1)[0] ?? pick(neutral, 1)[0];
  if (pe) primary = mk(pe.c, pe.chroma ? `Highest-weighted brand colour${[...(roleNote.get(pe.c) ?? [])].map((n) => `, ${n}`).join("")}` : "No saturated brand colour found; the dominant dark neutral carries the identity");
  const secondary = pick(chromatic, 2).map((e) => mk(e.c, "Recurring supporting colour"));
  const accent = pick(chromatic.filter((e) => e.s > 0.55), 2).map((e) => mk(e.c, "Vivid colour used for emphasis"));
  const bgs = [...entries].filter((e) => e.r.bg > 0).sort((a, b) => b.r.bg - a.r.bg).filter((e) => !primary || e.c !== primary.value).slice(0, 3).map((e) => mk(e.c, "Used as a surface/background colour"));
  const texts = [...entries].filter((e) => e.r.text > 0).sort((a, b) => b.r.text - a.r.text).filter((e) => !primary || e.c !== primary.value).slice(0, 3).map((e) => mk(e.c, "Used as a text colour"));
  const grads: Finding[] = [...gradients.entries()].sort((a, b) => total(b[1]) - total(a[1])).slice(0, 2).map(([g, m]) => ({ value: g, confidence: 0.7, evidence: topUrls(m, 2).map((u) => ({ url: u, reason: "Gradient declared in CSS." })) }));

  // ---------- typography ----------
  const fonts = [...fontRole.entries()].map(([f, r]) => ({ f, r, n: total(fontUrls.get(f)) })).sort((a, b) => b.n - a.n);
  const fconf = (f: string, strong: boolean) => +Math.min(0.95, 0.45 + (strong ? 0.2 : 0) + 0.3 * Math.min(1, total(fontUrls.get(f)) / 8)).toFixed(2);
  const fev = (f: string): Evidence[] => topUrls(fontUrls.get(f) ?? new Map(), 2).map((u) => ({ url: u, reason: `font-family "${f}" declared in CSS.` }));
  const nonMono = fonts.filter((x) => !(x.r.mono > x.r.heading + x.r.body));
  const headFont = [...nonMono].sort((a, b) => b.r.heading - a.r.heading)[0];
  const bodyFont = [...nonMono].sort((a, b) => b.r.body - a.r.body)[0] ?? nonMono[0];
  const monoFont = fonts.find((x) => x.r.mono > x.r.heading + x.r.body);
  const heading = headFont ? { value: headFont.f, confidence: fconf(headFont.f, headFont.r.heading > 0), evidence: fev(headFont.f) } : null;
  const body = bodyFont ? { value: bodyFont.f, confidence: fconf(bodyFont.f, bodyFont.r.body > 0), evidence: fev(bodyFont.f) } : null;
  const wsorted = [...weights.entries()].sort((a, b) => b[1] - a[1]).slice(0, 4).map(([w]) => w).sort((a, b) => a - b);
  const wFinding = wsorted.length ? { value: wsorted, confidence: 0.75, evidence: [{ url: srcs[0]?.url ?? home.url, reason: `font-weight values declared across ${[...weights.values()].reduce((a, b) => a + b, 0)} rules.` }] } : null;

  // ---------- logo / favicon ----------
  const logos: Finding[] = [];
  const seen = new Set<string>();
  const addLogo = (value: string, conf: number, url: string, why: string) => { if (value && !seen.has(value)) { seen.add(value); logos.push({ value, confidence: conf, evidence: [{ url, reason: why }] }); } };
  for (const p of s.pages.slice(0, 3)) {
    const $ = cheerio.load(p.html);
    $("header, nav, [class*=logo i], [class*=brand i], a[href='/']").find("img, svg").addBack("img, svg").each((_, el) => {
      const $el = $(el);
      const sig = [$el.attr("class"), $el.attr("alt"), $el.attr("src"), $el.parent().attr("class"), $el.attr("id")].join(" ").toLowerCase();
      const isLogo = /logo|brand|wordmark/.test(sig);
      const inHeader = $el.closest("header,nav").length > 0;
      if (!isLogo && !inHeader) return;
      if (/icon-|arrow|chevron|menu|search|avatar|sprite/.test(sig) && !isLogo) return;
      const why = `${isLogo ? "Marked as logo" : "Image"} in the ${inHeader ? "site header" : "page"}.`;
      const c = isLogo && inHeader ? 0.9 : isLogo ? 0.75 : 0.5;
      if ((el as any).tagName === "img") { const src = $el.attr("src") || $el.attr("data-src"); if (src && !src.startsWith("data:image/gif")) { try { addLogo(new URL(src, p.url).href, c, p.url, why); } catch {} } }
      else { const svg = $.html($el); if (svg.length < 30_000 && svg.includes("<path")) addLogo("data:image/svg+xml;base64," + Buffer.from(svg.includes("xmlns") ? svg : svg.replace("<svg", '<svg xmlns="http://www.w3.org/2000/svg"')).toString("base64"), c, p.url, why.replace("Image", "Inline SVG")); }
    });
    $('link[rel="apple-touch-icon"][href]').each((_, l) => { try { addLogo(new URL($(l).attr("href")!, p.url).href, 0.6, p.url, "Declared as the app/touch icon."); } catch {} });
  }
  let favicon: Finding | null = null;
  { const $ = cheerio.load(home.html);
    const l = $('link[rel~="icon"][href]').toArray().map((e) => $(e)).sort((a, b) => parseInt(b.attr("sizes") || "0") - parseInt(a.attr("sizes") || "0"))[0];
    try { const href = l ? new URL(l.attr("href")!, home.url).href : new URL("/favicon.ico", s.origin).href; favicon = { value: href, confidence: l ? 0.95 : 0.4, evidence: [{ url: home.url, reason: l ? "Declared via <link rel=icon>." : "Default /favicon.ico location (not declared)." }] }; } catch {} }

  // ---------- visual patterns ----------
  const patterns: Finding[] = [];
  const e0 = (reason: string) => [{ url: srcs[0]?.url ?? home.url, reason }];
  const topRadius = [...radii.entries()].sort((a, b) => b[1] - a[1])[0];
  if (topRadius) patterns.push({ value: /9999|999|50%|full/.test(topRadius[0]) ? "Pill-shaped controls (fully rounded corners)" : parseFloat(topRadius[0]) === 0 ? "Square corners" : `Rounded corners (most common radius ${topRadius[0]})`, confidence: 0.7, evidence: e0(`border-radius ${topRadius[0]} appears ${topRadius[1]} times.`) });
  if (decls > 50) patterns.push({ value: shadows / decls > 0.01 ? "Soft shadows are used for depth" : "Flat surfaces with little or no shadow", confidence: 0.6, evidence: e0(`${shadows} box-shadow declarations among ${decls} declarations.`) });
  if (bgs[0]) { const l = hsl(parseHex(bgs[0].value)).l; patterns.push({ value: l < 0.25 ? "Dark-leaning canvas" : l > 0.85 ? "Light, paper-like canvas" : "Mid-tone canvas", confidence: 0.6, evidence: bgs[0].evidence.slice(0, 1) }); }
  if (uppercase > 2) patterns.push({ value: "Uppercase labels for small headings", confidence: 0.6, evidence: e0(`text-transform: uppercase declared ${uppercase} times.`) });
  if (tracking > 2) patterns.push({ value: "Tight negative letter-spacing on display text", confidence: 0.6, evidence: e0(`Negative letter-spacing declared ${tracking} times.`) });
  if (grads.length) patterns.push({ value: "Gradients are part of the visual language", confidence: 0.6, evidence: grads[0].evidence });

  return {
    colors: { primary, secondary, accent, background: bgs, text: texts, gradients: grads },
    typography: { heading, body, mono: monoFont ? { value: monoFont.f, confidence: fconf(monoFont.f, true), evidence: fev(monoFont.f) } : null, weights: wFinding, hierarchy: Object.entries(hierarchy).map(([level, v]) => ({ level, ...v })), sources: srcs.map((x) => x.url) },
    logo: { primary: logos[0] ?? null, variants: logos.slice(1).filter((l) => l.confidence >= 0.6).slice(0, 3), favicon },
    patterns,
  };
}
