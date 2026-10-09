import { credentialStatus, testKey, provider } from "@/lib/credentials";
import { handle, json, body, requireUser, rateLimit } from "@/lib/http";
export const POST = (req: Request) => handle(async () => { const u = await requireUser(); rateLimit("cred:" + u.id, 10, 60_000); await testKey(u.id, provider((await body(req)).provider)); return json(await credentialStatus(u.id)); });
