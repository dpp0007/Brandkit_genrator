import * as cheerio from "cheerio";
import { geminiJSON } from "../gemini";
import { AppError } from "../http";
import type { Computed, Counted, Evidence, Finding, Page, ScoutOutput, Voice } from "./types";

const STOP = new Set("com updated days ago hours minutes min read a about above after all also am an and any are as at be because been before being below between both but by can could did do does doing down during each few for from further had has have having he her here hers him his how i if in into is it its just me more most my no nor not now of off on once only or other our out over own same she should so some such than that the their them then there these they this those through to too under until up us very was we were what when where which while who why will with would you your yours get new learn see start use one all more".split(" "));
const norm = (s: string) => s.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, " ").trim();
const clean = (s: string) => s.replace(/\s+/g, " ").trim();
export const supported = (claim: string, pages: Page[]) => { const n = norm(claim); return n.length > 3 && pages.some((p) => norm(p.text + " " + p.title + " " + p.description).includes(n)); };

type Cands = {
  headings: { text: string; level: number; page: Page }[];
  ctas: Map<string, { n: number; pages: Set<string> }>;
  sentences: string[];
  all: string;
};
function gather(pages: Page[], computed: Computed | null): Cands {
  const headings: Cands["headings"] = [];
  const ctas: Cands["ctas"] = new Map();
  const sentences: string[] = [];
  for (const p of pages) {
    const $ = cheerio.load(p.html);
    $("script,style,noscript,svg,template,footer nav").remove();
    $("h1,h2,h3").each((_, e) => { const t = clean($(e).text()); if (t.length >= 3 && t.length <= 140) headings.push({ text: t, level: +e.tagName[1], page: p }); });
    $("a,button,[role=button]").each((_, e) => {
      const t = clean($(e).text());
      const sig = ($(e).attr("class") || "") + " " + ($(e).attr("data-variant") || "") + " " + (e.tagName === "button" ? "button" : "");
      if (t.length < 2 || t.length > 32 || t.split(" ").length > 5) return;
      if (!/btn|button|cta|primary|action/i.test(sig) && !/^(get|try|start|book|request|contact|talk|sign|join|learn|see|view|explore|download|buy|shop|subscribe|schedule|watch|read)\b/i.test(t)) return;
      const k = t.toLowerCase();
      const c = ctas.get(k) ?? ctas.set(k, { n: 0, pages: new Set() }).get(k)!;
      c.n++; c.pages.add(p.url);
    });
    $("p,li,h1,h2,h3,h4,blockquote").each((_, e) => { const t = clean($(e).text()); if (t.length > 25 && t.length < 400) sentences.push(t); });
  }
  // Buttons measured on the rendered page (computed style has a filled background) are the most reliable CTAs.
  for (const x of computed?.ctas ?? []) {
    const k = x.text.toLowerCase();
    if (k.length < 2 || /\d/.test(k)) continue;
    const c = ctas.get(k) ?? ctas.set(k, { n: 0, pages: new Set() }).get(k)!;
    c.n += 2; c.pages.add(pages[0].url);
  }
  return { headings, ctas, sentences, all: sentences.join(" ") };
}

const ev = (url: string, reason: string): Evidence => ({ url, reason });
const mk = <T,>(value: T, confidence: number, evidence: Evidence[]): Finding<T> => ({ value, confidence: +confidence.toFixed(2), evidence });

function terms(c: Cands, brand: string): Counted[] {
  const counts = new Map<string, number>();
  const b = norm(brand);
  for (const s of c.sentences) {
    const w = norm(s).split(" ").filter((x) => x.length > 2);
    for (let i = 0; i < w.length; i++) {
      if (!STOP.has(w[i]) && !/^\d+$/.test(w[i]) && w[i] !== b) counts.set(w[i], (counts.get(w[i]) ?? 0) + 1);
      if (i < w.length - 1 && !STOP.has(w[i]) && !STOP.has(w[i + 1]) && w[i] !== b && w[i + 1] !== b) { const bg = w[i] + " " + w[i + 1]; counts.set(bg, (counts.get(bg) ?? 0) + 2); }
    }
  }
  const out: Counted[] = [];
  for (const [t, n] of [...counts.entries()].sort((a, b) => b[1] - a[1])) {
    if (n < 4) break;
    if (out.some((o) => o.value.includes(t) || t.includes(o.value))) continue;
    out.push({ ...mk(t, Math.min(0.9, 0.4 + n / 30), []), count: n });
    if (out.length >= 10) break;
  }
  return out;
}

function heuristic(pages: Page[], c: Cands, brand: string): Voice {
  const home = pages[0];
  const h1 = c.headings.find((h) => h.level === 1 && h.page === home) ?? c.headings.find((h) => h.level === 1);
  const titleSeg = home.title.split(/\s[|–—·-]\s/)[0];
  const titleTail = home.title.split(/\s[|–—·]\s|\s-\s/).slice(1).join(" ").trim();
  const taglineSrc = titleTail.split(" ").length >= 3 && titleTail.split(" ").length <= 14 ? { t: titleTail, u: home.url, why: "Descriptor in the homepage <title>." }
    : h1 && h1.text.split(" ").length >= 3 && h1.text.split(" ").length <= 14 ? { t: h1.text, u: h1.page.url, why: "Primary H1 headline on the homepage." } : home.description ? { t: home.description.split(/(?<=[.!?])\s/)[0], u: home.url, why: "Opening sentence of the homepage meta description." } : { t: titleSeg, u: home.url, why: "Homepage title." };
  const tagline = taglineSrc.t ? mk(taglineSrc.t, h1 ? 0.8 : 0.6, [ev(taglineSrc.u, taglineSrc.why)]) : null;
  const tl = tagline ? norm(tagline.value) : "";
  // Positioning must say something the tagline doesn't: skip a description that merely repeats it.
  const posSrc = (home.description && norm(home.description) !== tl ? home.description : c.sentences.find((x) => x.length > 60 && norm(x) !== tl)) || "";
  const positioning = posSrc ? mk(posSrc, posSrc === home.description ? 0.78 : 0.55, [ev(home.url, posSrc === home.description ? "Homepage meta description." : "First substantive paragraph on the homepage.")]) : null;

  const seenH = new Set<string>();
  const subs = c.headings.filter((h) => h.level >= 2 && h.text.split(" ").length >= 3 && h.text.split(" ").length <= 14 && !/^(faq|footer|pricing|get started)/i.test(h.text)).filter((h) => { const k = norm(h.text); if (seenH.has(k)) return false; seenH.add(k); return true; });
  const value_propositions = subs.filter((h) => h.level === 2).slice(0, 4).map((h) => mk(h.text, 0.65, [ev(h.page.url, `H2 on the ${h.page.kind} page.`)]));
  const pillars = subs.filter((h) => h.level === 3 && h.text.split(" ").length <= 7).slice(0, 4).map((h) => mk(h.text, 0.6, [ev(h.page.url, `H3 on the ${h.page.kind} page.`)]));

  const ctaList: Counted[] = [...c.ctas.entries()].sort((a, b) => b[1].n - a[1].n).slice(0, 6).map(([t, v]) => ({ ...mk(t, Math.min(0.92, 0.5 + v.n / 12 + v.pages.size / 10), [...v.pages].slice(0, 2).map((u) => ev(u, `Appears ${v.n}× as a button/link label.`))), count: v.n }));

  const words = c.all.split(/\s+/).length || 1;
  const cnt = (re: RegExp) => (c.all.match(re) ?? []).length;
  const sents = c.sentences.flatMap((s) => s.split(/(?<=[.!?])\s+/));
  const avg = sents.reduce((a, s) => a + s.split(/\s+/).length, 0) / Math.max(1, sents.length);
  const you = cnt(/\b(you|your|you're)\b/gi) / words, we = cnt(/\b(we|our|we're|us)\b/gi) / words;
  const excl = cnt(/!/g), superl = cnt(/\b(best|leading|world-class|revolutionary|unmatched|ultimate|#1|number one)\b/gi);
  const tech = cnt(/\b(api|platform|infrastructure|developers?|deploy|data|workflow|integrat\w+|scal\w+|secure|security|code)\b/gi) / words;
  const q = cnt(/\?/g);
  const toneEv = [ev(home.url, `Across ${pages.length} pages: avg sentence ${avg.toFixed(1)} words, "you" ${(you * 100).toFixed(1)}% vs "we" ${(we * 100).toFixed(1)}% of words, ${excl} exclamation marks, ${superl} superlatives.`)];
  const tone: string[] = [];
  if (avg <= 14) tone.push("Direct"); else if (avg >= 22) tone.push("Expansive");
  if (excl === 0 && superl <= 1) tone.push("Understated"); else if (excl > 3) tone.push("Enthusiastic");
  if (superl > 3) tone.push("Confident");
  if (tech > 0.012) tone.push("Technical");
  if (you > we && you > 0.01) tone.push("Customer-focused"); else if (we > you && we > 0.012) tone.push("Company-voiced");
  if (q > 3) tone.push("Conversational");
  if (!tone.length) tone.push("Neutral");

  const heads = c.headings.map((h) => h.text);
  const lower = heads.filter((h) => h === h.toLowerCase()).length / Math.max(1, heads.length);
  const titleCase = heads.filter((h) => h.split(" ").length > 2 && h.split(" ").filter((w) => /^[A-Z]/.test(w)).length / h.split(" ").length > 0.7).length / Math.max(1, heads.length);
  const style: Finding[] = [
    mk(`Sentences average ${avg.toFixed(0)} words`, 0.75, toneEv),
    mk(lower > 0.5 ? "Headlines are set in lowercase" : titleCase > 0.5 ? "Headlines use Title Case" : "Headlines use sentence case", 0.7, [ev(home.url, `${heads.length} headings inspected.`)]),
    mk(you > we ? 'Addresses the reader directly ("you")' : 'Speaks as the company ("we")', 0.7, toneEv),
  ];

  const dos: Finding[] = [mk(`Keep sentences short; the site averages ${avg.toFixed(0)} words.`, 0.7, toneEv)];
  if (you > we && you > 0.008) dos.push(mk('Address the reader as "you".', 0.7, toneEv));
  if (ctaList[0]) dos.push(mk(`Use action-led CTAs such as "${ctaList[0].value}".`, ctaList[0].confidence, ctaList[0].evidence));
  const tt = terms(c, brand).slice(0, 4);
  if (tt.length) dos.push(mk(`Favour the brand's own vocabulary: ${tt.map((t) => t.value).join(", ")}.`, 0.6, [ev(home.url, "Most frequent non-generic terms across explored pages.")]));
  const donts: Finding[] = [];
  if (excl === 0) donts.push(mk("Don't use exclamation marks; none appear on the explored pages.", 0.7, toneEv));
  if (superl <= 1) donts.push(mk('Don\'t lean on superlatives ("best", "world-class", "revolutionary").', 0.65, toneEv));
  if (lower <= 0.5) donts.push(mk("Don't write headlines in all caps.", 0.5, [ev(home.url, "Headlines on the site are not all-caps.")]));
  if (avg < 18) donts.push(mk("Don't write long, multi-clause sentences.", 0.6, toneEv));

  return { tagline, positioning, value_propositions, pillars, terminology: terms(c, brand), ctas: ctaList, tone: mk(tone.slice(0, 5), 0.6, toneEv), writing_style: style, dos, donts, interpreter: "heuristic" };
}

// ---------- Gemini interpretation (strict response schema; claims are re-validated against page text) ----------
async function llm(geminiKey: string, pages: Page[], c: Cands, base: Voice, brand: string): Promise<Voice | null> {
  const pack = pages.map((p) => [`### ${p.url} (${p.kind})`, `TITLE: ${p.title}`, `DESC: ${p.description}`, `HEADINGS: ${c.headings.filter((h) => h.page === p).map((h) => h.text).slice(0, 25).join(" | ")}`, `TEXT: ${p.text.slice(0, 2500)}`].join(String.fromCharCode(10))).join(String.fromCharCode(10, 10));
  const item = { type: "OBJECT", properties: { text: { type: "STRING" }, source_url: { type: "STRING" }, why: { type: "STRING" } }, required: ["text", "source_url", "why"] };
  const arr = { type: "ARRAY", items: item };
  const schema = { type: "OBJECT", properties: { tagline: item, positioning: item, value_propositions: arr, pillars: arr, tone: arr, writing_style: arr, dos: arr, donts: arr }, required: ["tagline", "positioning", "value_propositions", "pillars", "tone", "writing_style", "dos", "donts"] };
  const system = "You analyse website evidence to describe a brand's verbal identity. Use ONLY the supplied page content. tagline, positioning and value_propositions must be exact verbatim quotes from the pages; set source_url to the page they came from. Tone items (max 5): text = a one-word trait, why = the observed evidence. dos/donts must be actionable rules grounded in observed writing patterns. Never invent facts.";
  let o: any;
  try { o = await geminiJSON(geminiKey, system, "Brand: " + brand + String.fromCharCode(10, 10) + pack, schema); }
  catch (e) { if (e instanceof AppError && (e.code === "INVALID_KEY" || e.code === "RATE_LIMITED")) throw e; return null; }
  const f = (x: any, conf = 0.8): Finding | null => (x?.text ? mk(String(x.text), conf, [ev(pages.find((p) => p.url === x.source_url)?.url ?? pages[0].url, x.why || "Interpreted from page content.")]) : null);
  const list = (a: any[], conf = 0.75) => (Array.isArray(a) ? a.map((x) => f(x, conf)).filter(Boolean) as Finding[] : []);
  const tone = (Array.isArray(o.tone) ? o.tone : []).slice(0, 5);
  return { ...base, tagline: f(o.tagline) ?? base.tagline, positioning: f(o.positioning) ?? base.positioning, value_propositions: list(o.value_propositions), pillars: list(o.pillars, 0.7),
    tone: tone.length ? mk(tone.map((t: any) => String(t.text)), 0.75, tone.map((t: any) => ev(pages[0].url, `${t.text}: ${t.why}`))) : base.tone, writing_style: list(o.writing_style), dos: list(o.dos, 0.7), donts: list(o.donts, 0.7), interpreter: "llm" };
}

export async function extractVoice(s: ScoutOutput, brand: string, geminiKey: string): Promise<Voice> {
  const c = gather(s.pages, s.computed);
  const base = heuristic(s.pages, c, brand);
  return (await llm(geminiKey, s.pages, c, base, brand)) ?? base;
}
