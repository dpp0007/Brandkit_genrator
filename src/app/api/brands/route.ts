import { db } from "@/lib/db";
import { handle, json, requireUser } from "@/lib/http";
export const GET = () => handle(async () => {
  const u = await requireUser();
  const rows = db.prepare(`SELECT b.id,b.name,b.url,b.favicon,b.updated_at,
    (SELECT COUNT(*) FROM brand_extractions e WHERE e.brand_id=b.id) versions,
    (SELECT brand_dna FROM brand_extractions e WHERE e.brand_id=b.id AND status='complete' ORDER BY version DESC LIMIT 1) dna
    FROM brands b WHERE b.user_id=? ORDER BY b.updated_at DESC`).all(u.id);
  return json({ brands: rows.map((r: any) => { const d = r.dna ? JSON.parse(r.dna) : null; return { id: r.id, name: r.name, url: r.url, favicon: r.favicon, updatedAt: r.updated_at, versions: r.versions, primary: d?.colors?.primary?.hex ?? null, tagline: d?.brand?.tagline ?? null }; }) });
});
