import { db, uid, now } from "../db";
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

function latest(userId: string, origin: string) {
  const b = db.prepare("SELECT * FROM brands WHERE user_id=? AND url=?").get(userId, origin);
  if (!b) return null;
  const x = db.prepare("SELECT * FROM brand_extractions WHERE brand_id=? AND status='complete' ORDER BY version DESC LIMIT 2").all(b.id);
  return { brand: b, rows: x };
}

export async function runExtraction(userId: string, input: string, emit: Emit, opts: { refresh?: boolean } = {}): Promise<Result> {
  const cleaned = cleanInput(input);
  if ("error" in cleaned) throw new AppError("INVALID_URL", cleaned.error);
  input = cleaned.value;
  const { tinyfish: key, gemini } = getKeys(userId); // throws NO_KEY (428, with provider) if either is missing
  emit("resolve", "active", cleaned.note ?? "Finding the website");
  let matched = "";
  const origin = await resolveTarget(key, input, (m) => (matched = m));
  emit("resolve", "done", [cleaned.note, matched].filter(Boolean).join(". ") || `Using ${new URL(origin).hostname}`);
  const prior = latest(userId, origin);
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

  const t = now();
  let brandId = prior?.brand.id as string | undefined;
  if (!brandId) { brandId = uid(); db.prepare("INSERT INTO brands VALUES(?,?,?,?,?,?,?)").run(brandId, userId, dna.brand.name, origin, dna.brand.favicon, t, t); }
  else db.prepare("UPDATE brands SET name=?,favicon=?,updated_at=? WHERE id=?").run(dna.brand.name, dna.brand.favicon, t, brandId);
  const ver = (db.prepare("SELECT MAX(version) v FROM brand_extractions WHERE brand_id=?").get(brandId).v ?? 0) + 1;
  const extractionId = uid();
  db.prepare("INSERT INTO brand_extractions VALUES(?,?,?,?,?,?)").run(extractionId, brandId, ver, JSON.stringify(dna), "complete", t);
  const ins = db.prepare("INSERT INTO brand_evidence VALUES(?,?,?,?,?,?,?)");
  for (const f of dna.evidence.findings) ins.run(uid(), extractionId, f.evidence[0]?.url ?? origin, f.property, f.value, f.confidence, JSON.stringify(f.evidence));
  emit("compile", "done", partialNote(dna));
  const diff = prior?.rows[0] ? diffDna(JSON.parse(prior.rows[0].brand_dna), dna) : null;
  return { brandId, extractionId, dna, cached: false, diff };
}
const partialNote = (d: BrandDNA) => (d.meta.partial ? "Brand DNA ready (partial: some sources unavailable)" : "Brand DNA ready");

// ---------- background jobs (progress is persisted so the UI reflects real stages) ----------
export function startJob(userId: string, input: string, refresh: boolean) {
  const cleaned = cleanInput(input); // fast feedback for typos and gibberish, before any key prompt or job
  if ("error" in cleaned) throw new AppError("INVALID_URL", cleaned.error);
  const raw = input; // runExtraction re-cleans it so the progress page can show what was corrected
  input = cleaned.value;
  getKeys(userId); // fail fast with NO_KEY before creating a job
  const id = uid();
  db.prepare("INSERT INTO jobs VALUES(?,?,?,?,?,?,?,?)").run(id, userId, input, "running", "[]", null, null, now());
  const events: any[] = [];
  const emit: Emit = (stage, status, label, detail) => {
    events.push({ stage, status, label, detail, at: now() });
    db.prepare("UPDATE jobs SET events=? WHERE id=?").run(JSON.stringify(events), id);
  };
  runExtraction(userId, raw, emit, { refresh })
    .then((r) => db.prepare("UPDATE jobs SET status='done',brand_id=?,error=? WHERE id=?").run(r.brandId, r.diff ? JSON.stringify({ diff: r.diff }) : null, id))
    .catch((e) => {
      const err = e instanceof AppError ? { code: e.code, message: e.message, ...e.extra } : { code: "EXTRACTION_FAILED", message: "Extraction failed unexpectedly. Please try again." };
      if (!(e instanceof AppError)) console.error("[job]", e?.name);
      db.prepare("UPDATE jobs SET status='error',error=? WHERE id=?").run(JSON.stringify(err), id);
    });
  return id;
}
export function getJob(userId: string, id: string) {
  const j = db.prepare("SELECT * FROM jobs WHERE id=? AND user_id=?").get(id, userId);
  if (!j) throw new AppError("NOT_FOUND", "Exploration not found.", 404);
  // A restart kills in-process jobs. Flag stale ones by age (not at startup: dev servers and build workers open the DB many times).
  if (j.status === "running" && Date.now() - new Date(j.created_at).getTime() > 10 * 60_000) {
    j.status = "error"; j.error = JSON.stringify({ code: "INTERRUPTED", message: "This exploration didn't finish, probably because the server restarted. Please run it again." });
    db.prepare("UPDATE jobs SET status='error',error=? WHERE id=?").run(j.error, id);
  }
  const extra = j.error ? JSON.parse(j.error) : null;
  return { id: j.id, url: j.url, status: j.status, events: JSON.parse(j.events), brandId: j.brand_id, error: j.status === "error" ? extra : null, diff: j.status === "done" ? extra?.diff ?? null : null };
}
