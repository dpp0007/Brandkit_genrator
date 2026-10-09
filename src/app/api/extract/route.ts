import { runExtraction } from "@/lib/pipeline/run";
import { handle, json, body, requireUser, rateLimit } from "@/lib/http";

export const maxDuration = 300;
// Body: { url, refresh? }. Reuses the saved extraction unless refresh is true.
export const POST = (req: Request) => handle(async () => {
  const u = await requireUser();
  rateLimit("extract:" + u.id, 60, 3_600_000);
  const b = await body(req);
  const r = await runExtraction(u.id, String(b.url ?? ""), () => {}, { refresh: !!b.refresh });
  return json({ ...r.dna, _meta: { cached: r.cached, brand_id: r.brandId } });
});
