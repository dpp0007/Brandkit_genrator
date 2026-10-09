import crypto from "node:crypto";
import { cookies } from "next/headers";
import { store, uid } from "./db";

import { sessionKey } from "./crypto";

const COOKIE = process.env.NODE_ENV === "production" ? "__Host-bm_session" : "bm_session"; // __Host- binds the cookie to this exact host over HTTPS
const DAYS = 30;
const b64 = (x: Buffer | string) => Buffer.from(x).toString("base64url");
const mac = (data: string) => crypto.createHmac("sha256", sessionKey()).update(data).digest("base64url");

function hashPassword(pw: string) {
  const salt = crypto.randomBytes(16);
  return salt.toString("hex") + ":" + crypto.scryptSync(pw, salt, 32).toString("hex");
}
function verifyPassword(pw: string, stored: string) {
  const [salt, hash] = stored.split(":");
  return crypto.timingSafeEqual(crypto.scryptSync(pw, Buffer.from(salt, "hex"), 32), Buffer.from(hash, "hex"));
}

// Sessions are signed cookies (HMAC), verified without touching the database. Rotating BRANDMELD_SECRET signs everyone out.
export async function startSession(user: { id: string; email: string }) {
  const exp = Date.now() + DAYS * 864e5;
  const body = b64(JSON.stringify({ u: user.id, e: user.email, x: exp }));
  (await cookies()).set(COOKIE, `${body}.${mac(body)}`, { httpOnly: true, sameSite: "lax", secure: process.env.NODE_ENV === "production", path: "/", expires: new Date(exp) });
}
export async function endSession() { (await cookies()).delete(COOKIE); }
export class UserError extends Error {}
export type User = { id: string; email: string };
export async function currentUser(): Promise<User | null> {
  const v = (await cookies()).get(COOKIE)?.value;
  if (!v) return null;
  const [body, sig] = v.split(".");
  if (!body || !sig) return null;
  try {
    const want = Buffer.from(mac(body)), got = Buffer.from(sig);
    if (want.length !== got.length || !crypto.timingSafeEqual(want, got)) return null;
    const p = JSON.parse(Buffer.from(body, "base64url").toString("utf8"));
    return p.x > Date.now() && p.u && p.e ? { id: p.u, email: p.e } : null;
  } catch { return null; }
}
export async function signUp(email: string, pw: string): Promise<User> {
  email = email.trim().toLowerCase();
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) throw new UserError("Enter a valid email address.");
  if (email.length > 254) throw new UserError("Enter a valid email address.");
  if (pw.length < 8) throw new UserError("Use a password of at least 8 characters.");
  if (pw.length > 200) throw new UserError("That password is too long (200 characters at most).");
  if (await store.userByEmail(email)) throw new UserError("An account with this email already exists.");
  const id = uid();
  try { await store.createUser({ id, email, password_hash: hashPassword(pw) }); }
  catch (e: any) { if (e?.code === 11000) throw new UserError("An account with this email already exists."); throw e; } // two sign-ups racing on one email
  return { id, email };
}
// A fixed hash to compare against when the email is unknown, so "no such user" takes as long as "wrong password".
const DUMMY = hashPassword("brandmeld-dummy-password");
export async function signIn(email: string, pw: string): Promise<User> {
  const r = pw.length <= 200 && email.length <= 254 ? await store.userByEmail(email.trim().toLowerCase()) : null;
  const ok = verifyPassword(pw.slice(0, 200), r?.password_hash ?? DUMMY);
  if (!r || !ok) throw new UserError("Email or password is incorrect.");
  return { id: r.id, email: r.email };
}
