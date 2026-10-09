import { store, now } from "./db";
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

async function one(userId: string, p: Provider) {
  const r = await store.cred(userId, p);
  return r ? { connected: true, masked: `${r.prefix}••••••••••••${r.last4}`, lastVerifiedAt: r.last_verified_at } : { connected: false };
}
export const credentialStatus = async (userId: string) => ({ tinyfish: await one(userId, "tinyfish"), gemini: await one(userId, "gemini") });

export async function saveKey(userId: string, p: Provider, key: string) {
  key = key.trim();
  if (key.length < 12 || /\s/.test(key)) throw new AppError("INVALID_KEY", `That doesn't look like a ${LABEL[p]} API key.`, 400, { provider: p });
  await (p === "tinyfish" ? verifyKey(key) : verifyGeminiKey(key)); // throws INVALID_KEY / RATE_LIMITED / *_ERROR
  const prefix = p === "gemini" ? key.slice(0, 4) : key.includes("-") ? key.slice(0, key.indexOf("-") + 1) : key.includes("_") ? key.slice(0, key.indexOf("_") + 1) : key.slice(0, 3);
  const t = now();
  await store.saveCred({ user_id: userId, provider: p, encrypted_key: encrypt(key), last4: key.slice(-4), prefix, at: t });
}
export async function getKey(userId: string, p: Provider): Promise<string> {
  const r = await store.cred(userId, p);
  if (!r) throw new AppError("NO_KEY", `Connect your ${LABEL[p]} API key to continue.`, 428, { provider: p });
  return decrypt(r.encrypted_key);
}
// Both keys are required for an exploration; reports whichever is missing first.
export const getKeys = async (userId: string) => ({ tinyfish: await getKey(userId, "tinyfish"), gemini: await getKey(userId, "gemini") });

export async function testKey(userId: string, p: Provider) {
  const k = await getKey(userId, p);
  await (p === "tinyfish" ? verifyKey(k) : verifyGeminiKey(k));
  await store.touchCred(userId, p, now());
}
export async function deleteKey(userId: string, p: Provider) {
  await store.deleteCred(userId, p);
}
