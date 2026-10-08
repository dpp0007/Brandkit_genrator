import { signIn, startSession } from "@/lib/auth";
import { handle, json, body, AppError, rateLimit, clientIp } from "@/lib/http";
export const POST = (req: Request) => handle(async () => {
  rateLimit("signin:" + clientIp(req), 10, 60_000);
  const b = await body(req);
  let u; try { u = signIn(String(b.email ?? ""), String(b.password ?? "")); } catch (e: any) { throw new AppError("AUTH", e.message, 401); }
  await startSession(u.id);
  return json({ user: u });
});
