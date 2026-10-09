import { store } from "@/lib/db";
import { AppError, handle, json, requireUser } from "@/lib/http";
import { brandPayload } from "@/lib/views";
export const GET = (_: Request, { params }: { params: Promise<{ id: string }> }) => handle(async () => {
  const p = await brandPayload((await requireUser()).id, (await params).id);
  if (!p) throw new AppError("NOT_FOUND", "Brand not found.", 404);
  return json(p);
});
export const DELETE = (_: Request, { params }: { params: Promise<{ id: string }> }) => handle(async () => {
  const u = await requireUser();
  await store.deleteBrand((await params).id, u.id);
  return json({ ok: true });
});
