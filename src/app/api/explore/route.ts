import { startJob } from "@/lib/pipeline/run";
import { handle, json, body, requireUser, rateLimit } from "@/lib/http";
export const POST = (req: Request) => handle(async () => {
  const u = await requireUser();
  rateLimit("explore:" + u.id, 30, 3_600_000);
  const b = await body(req);
  return json({ jobId: startJob(u.id, String(b.url ?? ""), !!b.refresh) });
});
