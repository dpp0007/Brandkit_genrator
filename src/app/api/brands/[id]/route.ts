import { store } from "@/lib/db";
import { AppError, handle, json, requireUser } from "@/lib/http";
import { toGuide, toContext } from "@/lib/pipeline/outputs";
export const GET = (_: Request, { params }: { params: Promise<{ id: string }> }) => handle(async () => {
  const u = await requireUser();
  const b = await store.brandById((await params).id, u.id);
  if (!b) throw new AppError("NOT_FOUND", "Brand not found.", 404);
  const e = (await store.extractions(b.id, 1))[0];
  if (!e) throw new AppError("NOT_FOUND", "No completed extraction for this brand yet.", 404);
  const dna = JSON.parse(e.brand_dna);
  return json({ brand: { id: b.id, name: b.name, url: b.url, updatedAt: b.updated_at }, version: e.version, dna, guide: toGuide(dna), context: toContext(dna) });
});
export const DELETE = (_: Request, { params }: { params: Promise<{ id: string }> }) => handle(async () => {
  const u = await requireUser();
  await store.deleteBrand((await params).id, u.id);
  return json({ ok: true });
});
