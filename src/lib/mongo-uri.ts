// Cleans up a MongoDB connection string the way people actually paste it into host dashboards:
// surrounding quotes or whitespace, and passwords containing characters like @ : / ? # that must be percent-encoded.
export function normalizeMongoUri(raw: string): string {
  let uri = raw.trim().replace(/^["'`]+|["'`]+$/g, "").trim();
  const m = uri.match(/^(mongodb(?:\+srv)?:\/\/)(.*)$/i);
  if (!m) return uri;
  const [, scheme, rest] = m;
  const end = rest.search(/[/?]/); // authority ends at the first / or ?
  const authority = end === -1 ? rest : rest.slice(0, end);
  const tail = end === -1 ? "" : rest.slice(end);
  const at = authority.lastIndexOf("@"); // the host follows the LAST @, so a raw @ in the password is recoverable
  if (at === -1) return uri;
  const userinfo = authority.slice(0, at), hosts = authority.slice(at + 1);
  const colon = userinfo.indexOf(":");
  if (colon === -1) return uri;
  const user = userinfo.slice(0, colon), pass = userinfo.slice(colon + 1);
  const safe = (v: string) => { try { return encodeURIComponent(decodeURIComponent(v)); } catch { return encodeURIComponent(v); } };
  return `${scheme}${safe(user)}:${safe(pass)}@${hosts}${tail}`;
}

// Safe, secret-free description of why a database call failed. Never includes the connection string.
export function describeDbError(e: any): { code: string; hint: string } {
  const msg = String(e?.message ?? "");
  if (/MONGODB_URI is not set/i.test(msg)) return { code: "not_configured", hint: "MONGODB_URI is not set in this environment's variables." };
  if (e?.name === "MongoParseError" || /invalid (connection string|scheme)|URI malformed/i.test(msg)) return { code: "bad_uri", hint: "MONGODB_URI is not a valid connection string (check for stray spaces or quotes)." };
  if (e?.code === 18 || e?.code === 8000 || /auth/i.test(msg) && /fail/i.test(msg)) return { code: "auth_failed", hint: "Atlas rejected the username or password. Check the database user and password in MONGODB_URI." };
  if (e?.name === "MongoServerSelectionError" || e?.name === "MongoNetworkError" || /ENOTFOUND|ETIMEDOUT|ECONNREFUSED|timed out|querySrv/i.test(msg)) return { code: "unreachable", hint: "Could not reach Atlas. In Atlas > Network Access, allow 0.0.0.0/0 (Vercel has no fixed IPs), and check the cluster hostname." };
  return { code: "error", hint: "The database returned an error. See the server logs." };
}

// Removes anything that looks like a connection string before it is logged.
export const redact = (s: string) => s.replace(/mongodb(\+srv)?:\/\/[^\s"']+/gi, "mongodb://[redacted]");
