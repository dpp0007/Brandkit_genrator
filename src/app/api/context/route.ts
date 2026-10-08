import { runExtraction } from "@/lib/pipeline/run";
import { handle, json, body, requireUser } from "@/lib/http";
import { toContext } from "@/lib/pipeline/outputs";
export const maxDuration = 300;
// Body: { url, refresh? }. Reuses the saved extraction unless refresh is true.
export const POST = (req: Request) => handle(async () => {
  const u = await requireUser();
  const b = await body(req);
  const r = await runExtraction(u.id, String(b.url ?? ""), () => {}, { refresh: !!b.refresh });
  return json(toContext(r.dna));
});
