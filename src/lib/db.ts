import path from "node:path";
import fs from "node:fs";
import crypto from "node:crypto";

// node:sqlite is loaded via getBuiltinModule so the bundler never touches it.
// ponytail: SQLite for zero-setup; schema maps 1:1 to Postgres/Supabase if the driver is swapped.
const g = globalThis as any;
function open() {
  const { DatabaseSync } = (process as any).getBuiltinModule("node:sqlite");
  const dir = process.env.BRANDMELD_DATA_DIR || path.join(process.cwd(), ".data"); // mount a persistent volume here in production
  fs.mkdirSync(dir, { recursive: true });
  const db = new DatabaseSync(path.join(dir, "brandmeld.db"));
  db.exec(`
  PRAGMA busy_timeout=5000; PRAGMA journal_mode=WAL; PRAGMA foreign_keys=ON;
  CREATE TABLE IF NOT EXISTS users(id TEXT PRIMARY KEY, email TEXT UNIQUE NOT NULL, password_hash TEXT NOT NULL, created_at TEXT NOT NULL);
  CREATE TABLE IF NOT EXISTS sessions(token_hash TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE, expires_at INTEGER NOT NULL);
  CREATE TABLE IF NOT EXISTS api_credentials(id TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE, provider TEXT NOT NULL, encrypted_key TEXT NOT NULL, last4 TEXT NOT NULL, prefix TEXT NOT NULL, last_verified_at TEXT, created_at TEXT NOT NULL, updated_at TEXT NOT NULL, UNIQUE(user_id,provider));
  CREATE TABLE IF NOT EXISTS brands(id TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE, name TEXT NOT NULL, url TEXT NOT NULL, favicon TEXT, created_at TEXT NOT NULL, updated_at TEXT NOT NULL, UNIQUE(user_id,url));
  CREATE TABLE IF NOT EXISTS brand_extractions(id TEXT PRIMARY KEY, brand_id TEXT NOT NULL REFERENCES brands(id) ON DELETE CASCADE, version INTEGER NOT NULL, brand_dna TEXT, status TEXT NOT NULL, created_at TEXT NOT NULL);
  CREATE TABLE IF NOT EXISTS brand_evidence(id TEXT PRIMARY KEY, extraction_id TEXT NOT NULL REFERENCES brand_extractions(id) ON DELETE CASCADE, url TEXT NOT NULL, property TEXT NOT NULL, value TEXT, confidence REAL, evidence TEXT);
  CREATE TABLE IF NOT EXISTS jobs(id TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE, url TEXT NOT NULL, status TEXT NOT NULL, events TEXT NOT NULL DEFAULT '[]', brand_id TEXT, error TEXT, created_at TEXT NOT NULL);
  `);
  return db;
}
export const db: any = (g.__bmdb ??= open());
export const uid = () => crypto.randomUUID();
export const now = () => new Date().toISOString();
