import { credentialStatus, saveKey, deleteKey, provider } from "@/lib/credentials";
import { handle, json, body, requireUser, rateLimit } from "@/lib/http";
export const GET = () => handle(async () => json(await credentialStatus((await requireUser()).id)));
export const POST = (req: Request) => handle(async () => {
  const u = await requireUser();
  rateLimit("cred:" + u.id, 10, 60_000); // each attempt calls the provider to verify the key
  const b = await body(req);
  await saveKey(u.id, provider(b.provider), String(b.key ?? "")); // key is never echoed back
  return json(await credentialStatus(u.id));
});
export const DELETE = (req: Request) => handle(async () => { const u = await requireUser(); await deleteKey(u.id, provider(new URL(req.url).searchParams.get("provider"))); return json(await credentialStatus(u.id)); });
