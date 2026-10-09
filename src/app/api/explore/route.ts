import { after } from "next/server";
import { startJob } from "@/lib/pipeline/run";
import { handle, json, body, requireUser, rateLimit } from "@/lib/http";

export const maxDuration = 300; // seconds; on serverless hosts this is how long the background exploration may run
export const POST = (req: Request) => handle(async () => {
  const u = await requireUser();
  rateLimit("explore:" + u.id, 30, 3_600_000);
  const b = await body(req);
  const { id, done } = await startJob(u.id, String(b.url ?? ""), !!b.refresh);
  after(() => done); // keeps the function alive after the response until the exploration finishes
  return json({ jobId: id });
});
