import { store } from "./db";
import { toGuide, toContext } from "./pipeline/outputs";

export async function brandPayload(userId: string, id: string) {
  const b = await store.brandById(id, userId);
  if (!b) return null;
  const e = (await store.extractions(b.id, 1))[0];
  if (!e) return null;
  const dna = JSON.parse(e.brand_dna);
  return { brand: { id: b.id, name: b.name, url: b.url, updatedAt: b.updated_at }, version: e.version, dna, guide: toGuide(dna), context: toContext(dna) };
}

export async function brandList(userId: string) {
  const rows = await store.listBrands(userId);
  return rows.map((r) => { const d = r.dna ? JSON.parse(r.dna) : null; return { id: r.id, name: r.name, url: r.url, favicon: r.favicon, updatedAt: r.updated_at, versions: r.versions, primary: (d?.colors?.primary?.hex ?? null) as string | null, tagline: (d?.brand?.tagline ?? null) as string | null }; });
}
