import { store, uid, now } from "../db";
import { AppError } from "../http";
import { getKeys } from "../credentials";
import { resolveTarget, siteScout } from "./scout";
import { extractVisual } from "./visual";
import { visualFromComputed } from "./visualComputed";
import { measurePages } from "./computed";
import { extractVoice } from "./voice";
import { validate, compile, BrandDNA } from "./compile";
import { diffDna } from "./outputs";
import type { Emit } from "./types";
import { cleanInput } from "../input";

// Yield so the event loop can serve progress polls between CPU-heavy stages.
const tick = () => new Promise<void>((r) => setImmediate(r));
export type Result = { brandId: string; extractionId: string; dna: BrandDNA; cached: boolean; diff: ReturnType<typeof diffDna> | null };

async function latest(userId: string, origin: string) {
  const b = await store.brandByUrl(userId, origin);
  if (!b) return null;
  return { brand: b, rows: await store.extractions(b.id, 2) };
}

export async function runExtraction(userId: string, input: string, emit: Emit, opts: { refresh?: boolean } = {}): Promise<Result> {
  const cleaned = cleanInput(input);
  if ("error" in cleaned) throw new AppError("INVALID_URL", cleaned.error);
  input = cleaned.value;
  const { tinyfish: key, gemini } = await getKeys(userId); // throws NO_KEY (428, with provider) if either is missing
  emit("resolve", "active", cleaned.note ?? "Finding the website");
  let matched = "";
  const origin = await resolveTarget(key, input, (m) => (matched = m));
  emit("resolve", "done", [cleaned.note, matched].filter(Boolean).join(". ") || `Using ${new URL(origin).hostname}`);
  const prior = await latest(userId, origin);
  if (prior?.rows[0] && !opts.refresh) {
    return { brandId: prior.brand.id, extractionId: prior.rows[0].id, dna: JSON.parse(prior.rows[0].brand_dna), cached: true, diff: null };
  }

  const scout = await siteScout(key, origin, emit);

  emit("render", "active", "Rendering the live page in a TinyFish browser", "Measuring real computed styles");
  const order = ["pricing", "product", "about", "customers"];
  const extra = order.map((k) => scout.pages.find((p) => p.kind === k)).filter(Boolean).slice(0, 2).map((p) => p!.url);
  scout.computed = await measurePages(key, [scout.pages[0].url, ...extra]);
  if (scout.computed) emit("render", "done", `Measured ${scout.computed.elements} rendered elements on ${scout.computed.pages.length} page${scout.computed.pages.length > 1 ? "s" : ""}`);
  else { emit("render", "warn", "Browser rendering unavailable; visual identity will be limited"); scout.warnings.push("TinyFish Browser could not render the page (it may not be enabled for this account), and Fetch does not return styles, so colours, typography and logo could not be measured."); }

  emit("visual", "active", "Analysing visual system", "Colours, gradients, logo");
  await tick();
  const visual = scout.computed ? visualFromComputed(scout) : extractVisual(scout);
  emit("visual", "done", visual.colors.primary ? `Primary colour ${visual.colors.primary.value}` : "Colour system mapped");
  emit("typography", "done", visual.typography.heading || visual.typography.body ? `Typography: ${[visual.typography.heading?.value, visual.typography.body?.value].filter(Boolean).filter((v, i, a) => a.indexOf(v) === i).join(" / ")}` : "No custom fonts declared", undefined);

  emit("voice", "active", "Reconstructing brand voice");
  const brandGuess = new URL(scout.origin).hostname.replace(/^www\./, "").split(".")[0];
  await tick();
  const voice = await extractVoice(scout, brandGuess, gemini);
  await tick();
  emit("voice", "done", `Voice and messaging read (${voice.interpreter === "llm" ? "Gemini-assisted" : "evidence-based"})`);

  emit("validate", "active", "Validating findings against evidence");
  const val = validate(scout, visual, voice);
  const removed = val.checks.filter((c) => c.status === "removed").length;
  emit("validate", "done", removed ? `Validated; removed ${removed} unsupported finding${removed > 1 ? "s" : ""}` : "All findings supported by evidence");

  emit("compile", "active", "Compiling Brand DNA");
  const dna = compile(scout, visual, voice, val);
  if (!dna.colors.primary && !dna.typography.body && !dna.messaging.tagline) throw new AppError("EXTRACTION_FAILED", "We reached the site but couldn't extract enough brand signal from it. Try another public URL.", 422);

  let brandId = prior?.brand.id as string | undefined;
  if (!brandId) { brandId = uid(); await store.createBrand({ id: brandId, user_id: userId, name: dna.brand.name, url: origin, favicon: dna.brand.favicon }); }
  else await store.updateBrand(brandId, dna.brand.name, dna.brand.favicon);
  const extractionId = uid();
  await store.addExtraction({ id: extractionId, brand_id: brandId, version: await store.nextVersion(brandId), brand_dna: JSON.stringify(dna) });
  await store.addEvidence(dna.evidence.findings.map((f) => ({ extraction_id: extractionId, url: f.evidence[0]?.url ?? origin, property: f.property, value: String(f.value), confidence: f.confidence, evidence: JSON.stringify(f.evidence) })));
  emit("compile", "done", partialNote(dna));
  const diff = prior?.rows[0] ? diffDna(JSON.parse(prior.rows[0].brand_dna), dna) : null;
  return { brandId, extractionId, dna, cached: false, diff };
}
const partialNote = (d: BrandDNA) => (d.meta.partial ? "Brand DNA ready (partial: some sources unavailable)" : "Brand DNA ready");

// ---------- background jobs (progress is persisted so the UI reflects real stages) ----------
// startJob creates the job row and returns { id, done }. The caller keeps the process alive until `done` settles
// (the explore route hands it to Next's after(), which holds a serverless function open until it finishes).
export async function startJob(userId: string, input: string, refresh: boolean) {
  const cleaned = cleanInput(input); // fast feedback for typos and gibberish, before any key prompt or job
  if ("error" in cleaned) throw new AppError("INVALID_URL", cleaned.error);
  const raw = input; // runExtraction re-cleans it so the progress page can show what was corrected
  input = cleaned.value;
  await getKeys(userId); // fail fast with NO_KEY before creating a job
  const id = uid();
  await store.createJob({ id, user_id: userId, url: input });
  const events: any[] = [];
  let chain: Promise<unknown> = Promise.resolve(); // keep progress writes in order
  const emit: Emit = (stage, status, label, detail) => {
    events.push({ stage, status, label, detail, at: now() });
    const snap = JSON.stringify(events);
    chain = chain.then(() => store.setJobEvents(id, snap)).catch(() => {});
  };
  const done = runExtraction(userId, raw, emit, { refresh })
    .then(async (r) => { await chain; await store.finishJob(id, "done", r.brandId, r.diff ? JSON.stringify({ diff: r.diff }) : null); })
    .catch(async (e) => {
      const err = e instanceof AppError ? { code: e.code, message: e.message, ...e.extra } : { code: "EXTRACTION_FAILED", message: "Extraction failed unexpectedly. Please try again." };
      if (!(e instanceof AppError)) console.error("[job]", e?.name);
      await chain;
      await store.finishJob(id, "error", null, JSON.stringify(err));
    })
    .catch(() => {});
  return { id, done };
}
export async function getJob(userId: string, id: string) {
  const j = await store.job(id, userId);
  if (!j) throw new AppError("NOT_FOUND", "Exploration not found.", 404);
  // A restart or timeout kills in-flight jobs. Flag stale ones by age (not at startup: dev servers open the DB many times).
  if (j.status === "running" && Date.now() - new Date(j.created_at).getTime() > 10 * 60_000) {
    j.status = "error"; j.error = JSON.stringify({ code: "INTERRUPTED", message: "This exploration didn't finish, probably because the server restarted or timed out. Please run it again." });
    await store.finishJob(id, "error", null, j.error);
  }
  const extra = j.error ? JSON.parse(j.error) : null;
  return { id: j.id, url: j.url, status: j.status, events: JSON.parse(j.events), brandId: j.brand_id, error: j.status === "error" ? extra : null, diff: j.status === "done" ? extra?.diff ?? null : null };
}
