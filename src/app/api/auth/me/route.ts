import { currentUser } from "@/lib/auth";
import { credentialStatus } from "@/lib/credentials";
import { handle, json } from "@/lib/http";
export const GET = () => handle(async () => {
  const u = await currentUser();
  return json({ user: u, credentials: u ? credentialStatus(u.id) : null });
});
