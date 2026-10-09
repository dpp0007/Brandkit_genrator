import { store } from "@/lib/db";
export const dynamic = "force-dynamic";
export const GET = async () => { await store.ping(); return Response.json({ ok: true }); };
