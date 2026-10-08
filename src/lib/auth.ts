import crypto from "node:crypto";
import { cookies } from "next/headers";
import { db, uid, now } from "./db";

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
  db.prepare("INSERT INTO sessions VALUES(?,?,?)").run(sha(token), userId, exp);
  (await cookies()).set(COOKIE, token, { httpOnly: true, sameSite: "lax", secure: process.env.NODE_ENV === "production", path: "/", expires: new Date(exp) });
}
export async function endSession() {
  const c = await cookies();
  const t = c.get(COOKIE)?.value;
  if (t) db.prepare("DELETE FROM sessions WHERE token_hash=?").run(sha(t));
  c.delete(COOKIE);
}
export type User = { id: string; email: string };
export async function currentUser(): Promise<User | null> {
  const t = (await cookies()).get(COOKIE)?.value;
  if (!t) return null;
  const r = db.prepare("SELECT u.id,u.email FROM sessions s JOIN users u ON u.id=s.user_id WHERE s.token_hash=? AND s.expires_at>?").get(sha(t), Date.now());
  return r ? { id: r.id, email: r.email } : null;
}
export function signUp(email: string, pw: string): User {
  email = email.trim().toLowerCase();
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) throw new Error("Enter a valid email address.");
  if (pw.length < 8) throw new Error("Use a password of at least 8 characters.");
  if (db.prepare("SELECT 1 FROM users WHERE email=?").get(email)) throw new Error("An account with this email already exists.");
  const id = uid();
  db.prepare("INSERT INTO users VALUES(?,?,?,?)").run(id, email, hashPassword(pw), now());
  return { id, email };
}
export function signIn(email: string, pw: string): User {
  const r = db.prepare("SELECT * FROM users WHERE email=?").get(email.trim().toLowerCase());
  if (!r || !verifyPassword(pw, r.password_hash)) throw new Error("Email or password is incorrect.");
  return { id: r.id, email: r.email };
}
