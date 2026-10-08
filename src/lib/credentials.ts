import { db, uid, now } from "./db";
import { encrypt, decrypt } from "./crypto";
import { verifyKey } from "./tinyfish";
import { verifyGeminiKey } from "./gemini";
import { AppError } from "./http";

export type Provider = "tinyfish" | "gemini";
export const PROVIDERS: Provider[] = ["tinyfish", "gemini"];
export const provider = (p: unknown): Provider => {
  if (p === "tinyfish" || p === "gemini") return p;
  throw new AppError("BAD_REQUEST", "Unknown provider.", 400);
};
const LABEL: Record<Provider, string> = { tinyfish: "TinyFish", gemini: "Gemini" };

function one(userId: string, p: Provider) {
  const r = db.prepare("SELECT prefix,last4,last_verified_at FROM api_credentials WHERE user_id=? AND provider=?").get(userId, p);
  return r ? { connected: true, masked: `${r.prefix}••••••••••••${r.last4}`, lastVerifiedAt: r.last_verified_at } : { connected: false };
}
export const credentialStatus = (userId: string) => ({ tinyfish: one(userId, "tinyfish"), gemini: one(userId, "gemini") });

export async function saveKey(userId: string, p: Provider, key: string) {
  key = key.trim();
  if (key.length < 12 || /\s/.test(key)) throw new AppError("INVALID_KEY", `That doesn't look like a ${LABEL[p]} API key.`, 400, { provider: p });
  await (p === "tinyfish" ? verifyKey(key) : verifyGeminiKey(key)); // throws INVALID_KEY / RATE_LIMITED / *_ERROR
  const prefix = p === "gemini" ? key.slice(0, 4) : key.includes("-") ? key.slice(0, key.indexOf("-") + 1) : key.includes("_") ? key.slice(0, key.indexOf("_") + 1) : key.slice(0, 3);
  const t = now();
  db.prepare(`INSERT INTO api_credentials VALUES(?,?,?,?,?,?,?,?,?)
    ON CONFLICT(user_id,provider) DO UPDATE SET encrypted_key=excluded.encrypted_key,last4=excluded.last4,prefix=excluded.prefix,last_verified_at=excluded.last_verified_at,updated_at=excluded.updated_at`)
    .run(uid(), userId, p, encrypt(key), key.slice(-4), prefix, t, t, t);
}
export function getKey(userId: string, p: Provider): string {
  const r = db.prepare("SELECT encrypted_key FROM api_credentials WHERE user_id=? AND provider=?").get(userId, p);
  if (!r) throw new AppError("NO_KEY", `Connect your ${LABEL[p]} API key to continue.`, 428, { provider: p });
  return decrypt(r.encrypted_key);
}
// Both keys are required for an exploration; reports whichever is missing first.
export const getKeys = (userId: string) => ({ tinyfish: getKey(userId, "tinyfish"), gemini: getKey(userId, "gemini") });

export async function testKey(userId: string, p: Provider) {
  const k = getKey(userId, p);
  await (p === "tinyfish" ? verifyKey(k) : verifyGeminiKey(k));
  db.prepare("UPDATE api_credentials SET last_verified_at=? WHERE user_id=? AND provider=?").run(now(), userId, p);
}
export function deleteKey(userId: string, p: Provider) {
  db.prepare("DELETE FROM api_credentials WHERE user_id=? AND provider=?").run(userId, p);
}
