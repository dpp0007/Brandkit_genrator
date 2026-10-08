import type { Evidence, Finding, ScoutOutput, Visual } from "./types";
import { dist, hsl, parseHex, RGB } from "./visual";

const sum = (m: Record<string, number>) => Object.values(m).reduce((a, b) => a + b, 0);
const top = (m: Record<string, number>, n: number) => Object.entries(m).sort((a, b) => b[1] - a[1]).slice(0, n);
const pctOf = (v: number, total: number) => (total ? Math.round((v / total) * 100) : 0);

// Builds the Visual model from styles measured on the live rendered page (see computed.ts).
export function visualFromComputed(s: ScoutOutput): Visual {
  const c = s.computed!;
  const home = s.pages[0];
  const where = c.pages[0] ?? home.url;
  const ev = (reason: string): Evidence[] => [{ url: where, reason }];
  const n = c.pages.length;
  const bgTotal = sum(c.bgArea), txtTotal = sum(c.textLen), btnTotal = sum(c.buttonBg);

  type E = { hex: string; rgb: RGB; s: number; l: number; chroma: boolean; score: number; notes: string[] };
  const all = new Map<string, E>();
  const get = (h: string): E => {
    let e = all.get(h);
    if (!e) { const rgb = parseHex(h), x = hsl(rgb); e = { hex: h, rgb, s: x.s, l: x.l, chroma: x.s > 0.28 && x.l > 0.1 && x.l < 0.93, score: 0, notes: [] }; all.set(h, e); }
    return e;
  };
  // large chromatic areas are often illustrations rather than brand, so their weight is capped
  for (const [h, v] of Object.entries(c.bgArea)) { const e = get(h); { const share = (v / (bgTotal || 1)) * 4; e.score += e.chroma ? Math.min(1.5, share) : share; } e.notes.push(`covers ${pctOf(v, bgTotal)}% of painted background area`); }
  for (const [h, v] of Object.entries(c.textLen)) { const e = get(h); e.score += (v / (txtTotal || 1)) * 3; e.notes.push(`${pctOf(v, txtTotal)}% of text`); }
  for (const [h, v] of Object.entries(c.buttonBg)) { const e = get(h); e.score += 6 + v; e.notes.push(`background of ${v} button${v > 1 ? "s" : ""}/CTA${v > 1 ? "s" : ""}`); }
  for (const v of c.brandVars) { const e = get(v.hex); e.score += 8; e.notes.push(`defined as design token ${v.name}`); }
  if (c.themeColor) { const e = get(c.themeColor); e.score += 6; e.notes.push("declared as the site's theme-color"); }

  const conf = (e: E, bonus = 0) => +Math.min(0.97, 0.55 + 0.1 * Math.min(1, n / 2) + Math.min(0.25, e.score / 12) + bonus).toFixed(2);
  const mk = (e: E, role: string, bonus = 0): Finding => ({ value: e.hex, confidence: conf(e, bonus), evidence: ev(`${role}: ${e.notes.join("; ")}. Measured from computed styles of ${c.elements} rendered elements.`) });

  const list = [...all.values()];
  const chromatic = list.filter((e) => e.chroma).sort((a, b) => b.score - a.score);
  const neutral = list.filter((e) => !e.chroma).sort((a, b) => b.score - a.score);
  const picked: RGB[] = [];
  const pick = (src: E[], k: number) => { const out: E[] = []; for (const e of src) { if (out.length >= k) break; if (picked.every((p) => dist(p, e.rgb) > 55)) { picked.push(e.rgb); out.push(e); } } return out; };

  const pe = pick(chromatic, 1)[0] ?? pick(neutral.filter((e) => e.l < 0.3), 1)[0] ?? pick(neutral, 1)[0];
  const primary = pe ? mk(pe, pe.chroma ? "Primary brand colour" : "No saturated brand colour; dominant dark neutral", pe.notes.some((x) => /button|token|theme/.test(x)) ? 0.08 : 0) : null;
  const secondary = pick(chromatic, 2).map((e) => mk(e, "Supporting colour"));
  const accent = pick(chromatic.filter((e) => e.s > 0.55), 2).map((e) => mk(e, "Accent colour"));
  const bgs = top(c.bgArea, 4).map(([h]) => get(h)).filter((e) => !primary || e.hex !== primary.value).slice(0, 3).map((e) => mk(e, "Surface colour"));
  const texts = top(c.textLen, 4).map(([h]) => get(h)).filter((e) => !primary || e.hex !== primary.value).slice(0, 3).map((e) => mk(e, "Text colour"));
  const gradients: Finding[] = c.gradients.slice(0, 2).map((g) => ({ value: g.css, confidence: 0.75, evidence: ev("Gradient painted on the rendered page.") }));

  // ---- typography ----
  const fontEv = (f: string, role: string): Evidence[] => ev(`"${f}" ${role}${c.fonts.loaded.some((l) => l.toLowerCase() === f.toLowerCase()) ? ", and loaded as a web font" : ""}. Measured from computed styles.`);
  const hf = top(c.fonts.heading, 1)[0], bf = top(c.fonts.body, 1)[0], mf = top(c.fonts.mono, 1)[0];
  const fconf = (f: string, v: number, t: number) => +Math.min(0.97, 0.7 + 0.2 * Math.min(1, v / (t || 1) * 2) + (c.fonts.loaded.some((l) => l.toLowerCase() === f.toLowerCase()) ? 0.07 : 0)).toFixed(2);
  const heading = hf ? { value: hf[0], confidence: fconf(hf[0], hf[1], sum(c.fonts.heading)), evidence: fontEv(hf[0], "is the font of rendered headings (h1-h4)") } : null;
  const body = bf ? { value: bf[0], confidence: fconf(bf[0], bf[1], sum(c.fonts.body)), evidence: fontEv(bf[0], "is the font of rendered body text") } : null;
  const mono = mf ? { value: mf[0], confidence: 0.8, evidence: fontEv(mf[0], "is used for code-like text") } : null;
  const ws = top(c.weights, 4).map(([w]) => +w).sort((a, b) => a - b);
  const weights = ws.length ? { value: ws, confidence: 0.85, evidence: ev(`font-weight measured across ${c.styled} text elements.`) } : null;

  // ---- logo / favicon ----
  const rank = (sig: string) => (sig.startsWith("home link in the header") ? 0.93 : sig.startsWith("home link") ? 0.8 : sig.startsWith("carries") ? 0.75 : 0.6);
  const logos: Finding[] = c.logos.map((l) => ({ value: l.value, confidence: rank(l.signal), evidence: [{ url: home.url, reason: `Mark that is a ${l.signal}, measured on the rendered page.` }] })).sort((a, b) => b.confidence - a.confidence);
  // Fetch's own image_links as a backup when nothing was found in the header.
  if (!logos.length) { const l = home.imageLinks.find((u) => /logo|wordmark|brand/i.test(u)); if (l) logos.push({ value: l, confidence: 0.55, evidence: [{ url: home.url, reason: "Image URL containing 'logo', returned by TinyFish Fetch image_links." }] }); }
  const fav = c.favicon ?? home.meta?.favicon ?? null;
  const favicon: Finding | null = fav ? { value: fav, confidence: 0.95, evidence: [{ url: home.url, reason: "Declared favicon." }] } : null;

  // ---- visual patterns ----
  const patterns: Finding[] = [];
  const radius = top(c.radii, 1)[0];
  if (radius) { const px = parseFloat(radius[0]); patterns.push({ value: px >= 999 || radius[0].includes("%") ? "Pill-shaped controls (fully rounded corners)" : `Rounded corners (most common radius ${radius[0]})`, confidence: 0.8, evidence: ev(`border-radius ${radius[0]} on ${radius[1]} rendered elements.`) }); }
  if (c.elements > 40) patterns.push({ value: c.shadows / c.elements > 0.03 ? "Soft shadows are used for depth" : "Flat surfaces with little or no shadow", confidence: 0.75, evidence: ev(`${c.shadows} of ${c.elements} elements have a box-shadow.`) });
  const canvas = bgs[0] ?? (top(c.bgArea, 1)[0] ? mk(get(top(c.bgArea, 1)[0][0]), "Surface") : null);
  if (canvas) { const l = hsl(parseHex(canvas.value)).l; patterns.push({ value: l < 0.25 ? "Dark-leaning canvas" : l > 0.85 ? "Light, paper-like canvas" : "Mid-tone canvas", confidence: 0.8, evidence: canvas.evidence }); }
  if (c.uppercase > 2) patterns.push({ value: "Uppercase labels for small headings", confidence: 0.75, evidence: ev(`${c.uppercase} text elements use text-transform: uppercase.`) });
  if (c.tightTracking > 1) patterns.push({ value: "Tight negative letter-spacing on display headings", confidence: 0.75, evidence: ev(`${c.tightTracking} headings have negative letter-spacing.`) });
  if (gradients.length) patterns.push({ value: "Gradients are part of the visual language", confidence: 0.7, evidence: gradients[0].evidence });

  void btnTotal;
  return {
    colors: { primary, secondary, accent, background: bgs, text: texts, gradients },
    typography: { heading, body, mono, weights, hierarchy: [...c.hierarchy].sort((a, b) => ["h1", "h2", "h3", "p"].indexOf(a.level) - ["h1", "h2", "h3", "p"].indexOf(b.level)).map((h) => ({ level: h.level, size: h.size, weight: h.weight, font: h.font })), sources: c.pages },
    logo: { primary: logos[0] ?? null, variants: logos.slice(1).filter((l) => l.confidence >= 0.75).slice(0, 2), favicon },
    patterns,
  };
}
