import { store } from "@/lib/db";
import { handle, json, requireUser } from "@/lib/http";
export const GET = () => handle(async () => {
  const u = await requireUser();
  const rows = await store.listBrands(u.id);
  return json({ brands: rows.map((r) => { const d = r.dna ? JSON.parse(r.dna) : null; return { id: r.id, name: r.name, url: r.url, favicon: r.favicon, updatedAt: r.updated_at, versions: r.versions, primary: d?.colors?.primary?.hex ?? null, tagline: d?.brand?.tagline ?? null }; }) });
});
