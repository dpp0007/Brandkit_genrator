import { store } from "@/lib/db";
import { assertSecret } from "@/lib/crypto";
import { describeDbError, redact } from "@/lib/mongo-uri";
export const dynamic = "force-dynamic";
// Returns a safe, secret-free reason when the database is unreachable, so a bad deployment setup is easy to diagnose.
export const GET = async () => {
  let secret = "configured";
  try { assertSecret(); } catch { secret = "missing"; }
  try { await store.ping(); return Response.json({ ok: secret === "configured", database: "connected", secret, ...(secret === "missing" ? { hint: "Set BRANDMELD_SECRET in the environment variables and redeploy." } : {}) }, { status: secret === "configured" ? 200 : 503 }); }
  catch (e: any) {
    const d = describeDbError(e);
    console.error("[health]", d.code, redact(String(e?.message ?? "")).slice(0, 300));
    return Response.json({ ok: false, database: d.code, secret, hint: d.hint }, { status: 503 });
  }
};
