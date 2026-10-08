import * as cheerio from "cheerio";
import type { Finding, ScoutOutput, Visual, Voice } from "./types";
import { hex, parseHex } from "./visual";
import { supported } from "./voice";

type Check = { check: string; status: "pass" | "removed" | "warning"; detail: string };
const CONFLICTS: [string, string][] = [["Direct", "Expansive"], ["Understated", "Enthusiastic"], ["Understated", "Confident"], ["Customer-focused", "Company-voiced"]];

// ---------- Brand Validator ----------
export function validate(s: ScoutOutput, v: Visual, voice: Voice) {
  const checks: Check[] = [];
  const hay = (s.stylesheets.map((x) => x.css).join(" ") + s.pages.map((p) => p.html).join(" ")).toLowerCase();
  const keepColor = (f: Finding, role: string) => {
    if (f.confidence < 0.45) { checks.push({ check: "colour-evidence", status: "removed", detail: `${role} ${f.value} removed: too little usage evidence (${f.confidence}).` }); return false; }
    return true;
  };
  v.colors.secondary = v.colors.secondary.filter((f) => keepColor(f, "Secondary"));
  v.colors.accent = v.colors.accent.filter((f) => keepColor(f, "Accent"));
  v.colors.background = v.colors.background.filter((f) => keepColor(f, "Background"));
  v.colors.text = v.colors.text.filter((f) => keepColor(f, "Text"));
  if (v.colors.primary) {
    checks.push({ check: "colour-evidence", status: v.colors.primary.confidence >= 0.5 ? "pass" : "warning", detail: `Primary ${v.colors.primary.value} backed by ${v.colors.primary.evidence.length} source(s), confidence ${v.colors.primary.confidence}.` });
    if (v.colors.background[0]?.value === v.colors.primary.value) checks.push({ check: "contradiction", status: "warning", detail: "Primary colour is also the dominant background; treated as a neutral-led brand." });
  } else checks.push({ check: "colour-evidence", status: "warning", detail: "No brand colour could be established from the explored pages." });

  for (const k of ["heading", "body", "mono"] as const) {
    const f = v.typography[k];
    if (f && s.computed) checks.push({ check: "font-evidence", status: "pass", detail: `"${f.value}" measured from computed styles on the rendered page.` });
    else if (f && !hay.includes(f.value.toLowerCase().replace(/ /g, "")) && !hay.includes(f.value.toLowerCase())) { checks.push({ check: "font-evidence", status: "removed", detail: `Font "${f.value}" not found in fetched CSS/HTML.` }); v.typography[k] = null; }
    else if (f) checks.push({ check: "font-evidence", status: "pass", detail: `"${f.value}" is declared in fetched CSS/HTML.` });
  }

  const claim = (name: string, f: Finding | null) => {
    if (!f) return null;
    if (supported(f.value, s.pages)) { checks.push({ check: "message-support", status: "pass", detail: `${name} appears verbatim on the site.` }); return f; }
    if (voice.interpreter === "llm") { checks.push({ check: "message-support", status: "removed", detail: `${name} "${f.value.slice(0, 60)}" not found on any explored page; removed.` }); return null; }
    return f;
  };
  voice.tagline = claim("Tagline", voice.tagline);
  voice.positioning = claim("Positioning", voice.positioning);
  voice.value_propositions = voice.value_propositions.filter((f) => claim("Value proposition", f));
  voice.pillars = voice.pillars.filter((f) => voice.interpreter !== "llm" || claim("Pillar", f));
  if (voice.interpreter === "llm") for (const f of [...voice.dos, ...voice.donts]) f.confidence = Math.min(f.confidence, 0.6); // rules are interpretation, not quotes

  for (const [a, b] of CONFLICTS) if (voice.tone.value.includes(a) && voice.tone.value.includes(b)) {
    voice.tone.value = voice.tone.value.filter((t) => t !== b);
    checks.push({ check: "contradiction", status: "removed", detail: `Tone traits "${a}" and "${b}" conflict; kept "${a}".` });
  }
  return { checks, warnings: s.warnings };
}

// ---------- Brand Compiler ----------
const USAGE: Record<string, string> = { primary: "Primary actions and the main brand moments", secondary: "Supporting interface and secondary emphasis", accent: "Highlights and small points of emphasis", background: "Page and section surfaces", text: "Headings and body copy" };
const colorObj = (f: Finding, role: string) => { const rgb = parseHex(f.value); return { hex: f.value, rgb: `rgb(${rgb.join(", ")})`, usage: USAGE[role], confidence: f.confidence, evidence: f.evidence }; };
const avg = (a: number[]) => (a.length ? +(a.reduce((x, y) => x + y, 0) / a.length).toFixed(2) : 0);

function brandName(s: ScoutOutput) {
  const home = s.pages[0], $ = cheerio.load(home.html);
  const host = new URL(s.origin).hostname.replace(/^www\./, "");
  const stem = host.split(".")[0].toLowerCase();
  const og = $('meta[property="og:site_name"]').attr("content")?.trim() || $('meta[name="application-name"]').attr("content")?.trim();
  if (og && og.length < 40) return og;
  const seg = home.title.split(/\s[|–—·:-]\s|\s-\s/).map((x) => x.trim()).filter(Boolean);
  const hit = seg.find((x) => x.toLowerCase().replace(/[^a-z0-9]/g, "").includes(stem));
  if (hit && hit.split(/\s+/).length <= 3) return hit;
  const word = hit?.match(new RegExp("[\\p{L}\\d]*" + stem + "[\\p{L}\\d]*", "iu"))?.[0];
  return word ?? seg.find((x) => x.length < 25) ?? stem[0].toUpperCase() + stem.slice(1);
}

export function compile(s: ScoutOutput, v: Visual, voice: Voice, val: ReturnType<typeof validate>) {
  const name = brandName(s);
  const c = v.colors;
  const colors = {
    primary: c.primary && colorObj(c.primary, "primary"),
    secondary: c.secondary.map((f) => colorObj(f, "secondary")),
    accent: c.accent.map((f) => colorObj(f, "accent")),
    background: c.background.map((f) => colorObj(f, "background")),
    text: c.text.map((f) => colorObj(f, "text")),
    gradients: c.gradients.map((g) => ({ css: g.value, confidence: g.confidence, evidence: g.evidence })),
  };
  const ty = v.typography;
  const typography = {
    heading: ty.heading, body: ty.body, mono: ty.mono, weights: ty.weights, hierarchy: ty.hierarchy,
  };
  const tokens: Record<string, string> = {};
  if (colors.primary) tokens["color.primary"] = colors.primary.hex;
  colors.secondary.forEach((x, i) => (tokens[`color.secondary.${i + 1}`] = x.hex));
  colors.accent.forEach((x, i) => (tokens[`color.accent.${i + 1}`] = x.hex));
  if (colors.background[0]) tokens["color.background"] = colors.background[0].hex;
  if (colors.text[0]) tokens["color.text"] = colors.text[0].hex;
  if (ty.heading) tokens["font.heading"] = ty.heading.value;
  if (ty.body) tokens["font.body"] = ty.body.value;
  if (ty.mono) tokens["font.mono"] = ty.mono.value;
  if (ty.weights) tokens["font.weights"] = ty.weights.value.join(",");

  // Flat evidence list (also persisted to brand_evidence)
  const findings: { property: string; value: string; confidence: number; evidence: { url: string; reason: string }[] }[] = [];
  const add = (property: string, f: Finding | null) => f && findings.push({ property, value: f.value, confidence: f.confidence, evidence: f.evidence });
  add("primary_color", c.primary); c.secondary.forEach((f, i) => add(`secondary_color_${i + 1}`, f)); c.accent.forEach((f, i) => add(`accent_color_${i + 1}`, f));
  c.background.forEach((f, i) => add(`background_color_${i + 1}`, f)); c.text.forEach((f, i) => add(`text_color_${i + 1}`, f));
  add("heading_font", ty.heading); add("body_font", ty.body); add("mono_font", ty.mono);
  add("logo", v.logo.primary); add("favicon", v.logo.favicon);
  add("tagline", voice.tagline); add("positioning", voice.positioning);
  voice.value_propositions.forEach((f, i) => add(`value_proposition_${i + 1}`, f)); voice.pillars.forEach((f, i) => add(`messaging_pillar_${i + 1}`, f));
  voice.ctas.forEach((f, i) => add(`cta_${i + 1}`, f)); add("tone", { ...voice.tone, value: voice.tone.value.join(", ") });
  voice.dos.forEach((f, i) => add(`do_${i + 1}`, f)); voice.donts.forEach((f, i) => add(`dont_${i + 1}`, f));
  v.patterns.forEach((f, i) => add(`visual_pattern_${i + 1}`, f));

  const section = {
    colors: avg([c.primary?.confidence, ...c.secondary.map((f) => f.confidence)].filter((x): x is number => x !== undefined)),
    typography: avg([ty.heading?.confidence, ty.body?.confidence].filter((x): x is number => x !== undefined)),
    logo: v.logo.primary?.confidence ?? 0,
    voice: avg([voice.tone.confidence, ...voice.dos.map((f) => f.confidence)]),
    messaging: avg([voice.tagline?.confidence, voice.positioning?.confidence, ...voice.value_propositions.map((f) => f.confidence)].filter((x): x is number => x !== undefined)),
  };
  const overall = avg(Object.values(section).filter((x) => x > 0));

  return {
    schema_version: "1.0",
    brand: { name, url: s.origin, domain: new URL(s.origin).hostname, positioning: voice.positioning?.value ?? null, tagline: voice.tagline?.value ?? null, favicon: v.logo.favicon?.value ?? null },
    visual_identity: { patterns: v.patterns },
    colors,
    typography,
    logo: { primary: v.logo.primary, variants: v.logo.variants, favicon: v.logo.favicon },
    voice: { tone: voice.tone, writing_style: voice.writing_style, dos: voice.dos, donts: voice.donts, terminology: voice.terminology, interpreter: voice.interpreter },
    messaging: { tagline: voice.tagline, positioning: voice.positioning, value_propositions: voice.value_propositions, pillars: voice.pillars, ctas: voice.ctas },
    design_tokens: tokens,
    evidence: { pages: s.pages.map((p) => ({ url: p.url, kind: p.kind, title: p.title })), stylesheets: s.stylesheets.map((x) => x.url), findings },
    confidence: { overall, by_section: section },
    validation: { checks: val.checks, warnings: val.warnings },
    meta: { extracted_at: new Date().toISOString(), source: "tinyfish-fetch", pages_explored: s.pages.length, partial: val.warnings.length > 0 || (!c.primary && !ty.heading && !ty.body) },
  };
}
export type BrandDNA = ReturnType<typeof compile>;
export { hex };
