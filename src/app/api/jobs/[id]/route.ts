import { getJob } from "@/lib/pipeline/run";
import { handle, json, requireUser } from "@/lib/http";
export const GET = (_: Request, { params }: { params: Promise<{ id: string }> }) => handle(async () => json(await getJob((await requireUser()).id, (await params).id)));
