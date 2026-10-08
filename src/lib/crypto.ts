import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";

function masterKey(): Buffer {
  let s = process.env.BRANDMELD_SECRET;
  if (!s) {
    const f = path.join(process.env.BRANDMELD_DATA_DIR || path.join(process.cwd(), ".data"), "secret.key");
    fs.mkdirSync(path.dirname(f), { recursive: true });
    if (!fs.existsSync(f)) fs.writeFileSync(f, crypto.randomBytes(32).toString("hex"), { mode: 0o600 });
    s = fs.readFileSync(f, "utf8");
  }
  return crypto.createHash("sha256").update(s).digest();
}
// AES-256-GCM: iv(12) | tag(16) | ciphertext, base64
export function encrypt(plain: string): string {
  const iv = crypto.randomBytes(12);
  const c = crypto.createCipheriv("aes-256-gcm", masterKey(), iv);
  const ct = Buffer.concat([c.update(plain, "utf8"), c.final()]);
  return Buffer.concat([iv, c.getAuthTag(), ct]).toString("base64");
}
export function decrypt(blob: string): string {
  const b = Buffer.from(blob, "base64");
  const d = crypto.createDecipheriv("aes-256-gcm", masterKey(), b.subarray(0, 12));
  d.setAuthTag(b.subarray(12, 28));
  return Buffer.concat([d.update(b.subarray(28)), d.final()]).toString("utf8");
}
