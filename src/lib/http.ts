import { NextResponse } from "next/server";
import { currentUser } from "./auth";
import { redact } from "./mongo-uri";

export class AppError extends Error {
  constructor(public code: string, message: string, public status = 400, public extra: Record<string, string> = {}) { super(message); }
}
export const json = (d: unknown, status = 200) => NextResponse.json(d, { status });
export async function requireUser() {
  const u = await currentUser();
  if (!u) throw new AppError("UNAUTHENTICATED", "Please sign in to continue.", 401);
  return u;
}
// Never leaks stack traces or secrets: unknown errors become a generic message.
export function handle(fn: () => Promise<Response>) {
  return fn().catch((e) => {
    if (e instanceof AppError) return json({ error: { code: e.code, message: e.message, ...e.extra } }, e.status);
    console.error("[api]", e instanceof Error ? `${e.name}${(e as any).code ? " " + (e as any).code : ""}: ${redact(String(e.message)).slice(0, 300)}` : "error"); // never logs connection strings
    return json({ error: { code: "INTERNAL", message: "Something went wrong on our side. Please try again." } }, 500);
  });
}
// Small in-memory limiter (single instance). ponytail: swap for Redis/Upstash if you scale beyond one instance.
const hits = new Map<string, number[]>();
export function rateLimit(key: string, max: number, windowMs: number) {
  const now = Date.now(), arr = (hits.get(key) ?? []).filter((t) => now - t < windowMs);
  if (arr.length >= max) throw new AppError("RATE_LIMITED", "Too many attempts. Please wait a minute and try again.", 429);
  arr.push(now); hits.set(key, arr);
  if (hits.size > 5000) for (const [k, v] of hits) if (!v.some((t) => now - t < windowMs)) hits.delete(k);
}
export const clientIp = (req: Request) => req.headers.get("x-forwarded-for")?.split(",")[0].trim() || "local";

export async function body(req: Request): Promise<any> {
  if (Number(req.headers.get("content-length") ?? 0) > 32_768) throw new AppError("TOO_LARGE", "That request is too large.", 413);
  try { const j = await req.json(); return j && typeof j === "object" && !Array.isArray(j) ? j : {}; } catch { throw new AppError("BAD_REQUEST", "Invalid request body.", 400); }
}
