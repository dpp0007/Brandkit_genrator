import crypto from "node:crypto";
import { cookies } from "next/headers";
import { store, uid } from "./db";

const COOKIE = "bm_session";
const sha = (s: string) => crypto.createHash("sha256").update(s).digest("hex");

function hashPassword(pw: string) {
  const salt = crypto.randomBytes(16);
  return salt.toString("hex") + ":" + crypto.scryptSync(pw, salt, 32).toString("hex");
}
function verifyPassword(pw: string, stored: string) {
  const [salt, hash] = stored.split(":");
  return crypto.timingSafeEqual(crypto.scryptSync(pw, Buffer.from(salt, "hex"), 32), Buffer.from(hash, "hex"));
}

export async function startSession(userId: string) {
  const token = crypto.randomBytes(32).toString("base64url");
  const exp = Date.now() + 30 * 864e5;
  await store.createSession(sha(token), userId, exp);
  (await cookies()).set(COOKIE, token, { httpOnly: true, sameSite: "lax", secure: process.env.NODE_ENV === "production", path: "/", expires: new Date(exp) });
}
export async function endSession() {
  const c = await cookies();
  const t = c.get(COOKIE)?.value;
  if (t) await store.deleteSession(sha(t));
  c.delete(COOKIE);
}
export class UserError extends Error {}
export type User = { id: string; email: string };
export async function currentUser(): Promise<User | null> {
  const t = (await cookies()).get(COOKIE)?.value;
  if (!t) return null;
  return store.userBySession(sha(t));
}
export async function signUp(email: string, pw: string): Promise<User> {
  email = email.trim().toLowerCase();
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) throw new UserError("Enter a valid email address.");
  if (pw.length < 8) throw new UserError("Use a password of at least 8 characters.");
  if (await store.userByEmail(email)) throw new UserError("An account with this email already exists.");
  const id = uid();
  try { await store.createUser({ id, email, password_hash: hashPassword(pw) }); }
  catch (e: any) { if (e?.code === 11000) throw new UserError("An account with this email already exists."); throw e; } // two sign-ups racing on one email
  return { id, email };
}
export async function signIn(email: string, pw: string): Promise<User> {
  const r = await store.userByEmail(email.trim().toLowerCase());
  if (!r || !verifyPassword(pw, r.password_hash)) throw new UserError("Email or password is incorrect.");
  return { id: r.id, email: r.email };
}
