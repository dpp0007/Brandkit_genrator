import { signUp, startSession } from "@/lib/auth";
import { handle, json, body, AppError, rateLimit, clientIp } from "@/lib/http";
export const POST = (req: Request) => handle(async () => {
  rateLimit("signup:" + clientIp(req), 5, 600_000);
  const b = await body(req);
  let u; try { u = await signUp(String(b.email ?? ""), String(b.password ?? "")); } catch (e: any) { throw new AppError("AUTH", e.message, 400); }
  await startSession(u.id);
  return json({ user: u });
});
