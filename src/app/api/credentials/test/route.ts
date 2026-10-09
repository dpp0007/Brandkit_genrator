import { credentialStatus, testKey, provider } from "@/lib/credentials";
import { handle, json, body, requireUser } from "@/lib/http";
export const POST = (req: Request) => handle(async () => { const u = await requireUser(); await testKey(u.id, provider((await body(req)).provider)); return json(await credentialStatus(u.id)); });
