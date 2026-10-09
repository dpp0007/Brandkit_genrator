import { store } from "@/lib/db";
import { describeDbError, redact } from "@/lib/mongo-uri";
export const dynamic = "force-dynamic";
// Returns a safe, secret-free reason when the database is unreachable, so a bad deployment setup is easy to diagnose.
export const GET = async () => {
  try { await store.ping(); return Response.json({ ok: true, database: "connected" }); }
  catch (e: any) {
    const d = describeDbError(e);
    console.error("[health]", d.code, redact(String(e?.message ?? "")).slice(0, 300));
    return Response.json({ ok: false, database: d.code, hint: d.hint }, { status: 503 });
  }
};
