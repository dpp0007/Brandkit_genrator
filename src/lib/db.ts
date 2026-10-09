import crypto from "node:crypto";
import { MongoClient, Db } from "mongodb";

// MongoDB Atlas storage. Collections: users, sessions, api_credentials, brands, brand_extractions, brand_evidence, jobs.
// Brand DNA is stored as a JSON string (its design-token keys contain dots, which Mongo field names dislike).
export const uid = () => crypto.randomUUID();
export const now = () => new Date().toISOString();

const g = globalThis as any;
function connect(): Promise<Db> {
  const uri = process.env.MONGODB_URI;
  if (!uri) return Promise.reject(new Error("MONGODB_URI is not set. Add your MongoDB Atlas connection string to the environment."));
  const client = new MongoClient(uri, { maxPoolSize: 5, serverSelectionTimeoutMS: 10_000, appName: "brandmeld" });
  return client.connect().then(async () => {
    const d = client.db(process.env.MONGODB_DB || undefined); // database name from the URI, or MONGODB_DB, or "test"
    await Promise.all([
      d.collection("users").createIndex({ email: 1 }, { unique: true }),
      d.collection("sessions").createIndex({ expires_at: 1 }, { expireAfterSeconds: 0 }), // expired sessions are removed by Mongo itself
      d.collection("api_credentials").createIndex({ user_id: 1, provider: 1 }, { unique: true }),
      d.collection("brands").createIndex({ user_id: 1, url: 1 }, { unique: true }),
      d.collection("brands").createIndex({ user_id: 1, updated_at: -1 }),
      d.collection("brand_extractions").createIndex({ brand_id: 1, version: -1 }),
      d.collection("brand_evidence").createIndex({ extraction_id: 1 }),
      d.collection("jobs").createIndex({ user_id: 1, created_at: -1 }),
    ]);
    return d;
  });
}
// Cached across hot reloads and warm serverless invocations; a failed connection is retried next time.
const database = async (): Promise<Db> => {
  g.__bmmongo ??= connect().catch((e) => { g.__bmmongo = undefined; throw e; });
  return g.__bmmongo;
};
const col = async (n: string) => (await database()).collection<any>(n);
const strip = <T extends Record<string, any> | null>(d: T): T => (d ? ({ ...d, id: d._id } as any) : d);

export const store = {
  async ping() { await (await database()).command({ ping: 1 }); },

  // users and sessions
  async userByEmail(email: string) { return strip(await (await col("users")).findOne({ email })); },
  async createUser(u: { id: string; email: string; password_hash: string }) { await (await col("users")).insertOne({ _id: u.id, email: u.email, password_hash: u.password_hash, created_at: now() }); },
  async createSession(token_hash: string, user_id: string, expiresMs: number) { await (await col("sessions")).insertOne({ _id: token_hash, user_id, expires_at: new Date(expiresMs) }); },
  async deleteSession(token_hash: string) { await (await col("sessions")).deleteOne({ _id: token_hash }); },
  async userBySession(token_hash: string) {
    const s = await (await col("sessions")).findOne({ _id: token_hash, expires_at: { $gt: new Date() } });
    const u = s && (await (await col("users")).findOne({ _id: s.user_id }));
    return u ? { id: u._id as string, email: u.email as string } : null;
  },

  // provider keys (encrypted)
  async cred(user_id: string, provider: string) { return await (await col("api_credentials")).findOne({ user_id, provider }); },
  async saveCred(c: { user_id: string; provider: string; encrypted_key: string; last4: string; prefix: string; at: string }) {
    await (await col("api_credentials")).updateOne({ user_id: c.user_id, provider: c.provider },
      { $set: { encrypted_key: c.encrypted_key, last4: c.last4, prefix: c.prefix, last_verified_at: c.at, updated_at: c.at }, $setOnInsert: { _id: uid(), created_at: c.at } }, { upsert: true });
  },
  async touchCred(user_id: string, provider: string, at: string) { await (await col("api_credentials")).updateOne({ user_id, provider }, { $set: { last_verified_at: at } }); },
  async deleteCred(user_id: string, provider: string) { await (await col("api_credentials")).deleteOne({ user_id, provider }); },

  // brands, extractions, evidence
  async brandByUrl(user_id: string, url: string) { return strip(await (await col("brands")).findOne({ user_id, url })); },
  async brandById(id: string, user_id: string) { return strip(await (await col("brands")).findOne({ _id: id, user_id })); },
  async createBrand(b: { id: string; user_id: string; name: string; url: string; favicon: string | null }) { const t = now(); await (await col("brands")).insertOne({ _id: b.id, user_id: b.user_id, name: b.name, url: b.url, favicon: b.favicon, created_at: t, updated_at: t }); },
  async updateBrand(id: string, name: string, favicon: string | null) { await (await col("brands")).updateOne({ _id: id }, { $set: { name, favicon, updated_at: now() } }); },
  async deleteBrand(id: string, user_id: string) {
    const b = await (await col("brands")).findOne({ _id: id, user_id });
    if (!b) return;
    const exts = await (await col("brand_extractions")).find({ brand_id: id }, { projection: { _id: 1 } }).toArray();
    await (await col("brand_evidence")).deleteMany({ extraction_id: { $in: exts.map((e) => e._id) } });
    await (await col("brand_extractions")).deleteMany({ brand_id: id });
    await (await col("brands")).deleteOne({ _id: id });
  },
  // History: brands newest first, each with its extraction count and latest Brand DNA.
  async listBrands(user_id: string, limit = 100) {
    const brands = await (await col("brands")).find({ user_id }).sort({ updated_at: -1 }).limit(limit).toArray();
    if (!brands.length) return [];
    const agg = await (await col("brand_extractions")).aggregate([
      { $match: { brand_id: { $in: brands.map((b) => b._id) }, status: "complete" } }, { $sort: { version: -1 } },
      { $group: { _id: "$brand_id", versions: { $sum: 1 }, dna: { $first: "$brand_dna" } } },
    ]).toArray();
    const by = new Map(agg.map((a) => [a._id, a]));
    return brands.map((b) => ({ id: b._id as string, name: b.name, url: b.url, favicon: b.favicon, updated_at: b.updated_at, versions: by.get(b._id)?.versions ?? 0, dna: (by.get(b._id)?.dna as string) ?? null }));
  },
  async extractions(brand_id: string, n: number) { return (await (await col("brand_extractions")).find({ brand_id, status: "complete" }).sort({ version: -1 }).limit(n).toArray()).map(strip); },
  async nextVersion(brand_id: string) { const e = await (await col("brand_extractions")).find({ brand_id }).sort({ version: -1 }).limit(1).toArray(); return (e[0]?.version ?? 0) + 1; },
  async addExtraction(e: { id: string; brand_id: string; version: number; brand_dna: string }) { await (await col("brand_extractions")).insertOne({ _id: e.id, brand_id: e.brand_id, version: e.version, brand_dna: e.brand_dna, status: "complete", created_at: now() }); },
  async addEvidence(rows: { extraction_id: string; url: string; property: string; value: string; confidence: number; evidence: string }[]) {
    if (rows.length) await (await col("brand_evidence")).insertMany(rows.map((r) => ({ _id: uid(), ...r })));
  },

  // background jobs (progress is persisted so any instance can serve the progress page)
  async createJob(j: { id: string; user_id: string; url: string }) { await (await col("jobs")).insertOne({ _id: j.id, user_id: j.user_id, url: j.url, status: "running", events: "[]", brand_id: null, error: null, created_at: now() }); },
  async setJobEvents(id: string, events: string) { await (await col("jobs")).updateOne({ _id: id }, { $set: { events } }); },
  async finishJob(id: string, status: "done" | "error", brand_id: string | null, error: string | null) { await (await col("jobs")).updateOne({ _id: id }, { $set: { status, brand_id, error } }); },
  async job(id: string, user_id: string) { return strip(await (await col("jobs")).findOne({ _id: id, user_id })); },
};
