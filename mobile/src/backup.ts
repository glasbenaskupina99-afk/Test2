// Encrypted cloud backup (2.0). A full copy of your data, compressed and encrypted on the device
// with your backup key, is kept on bloomko.eu — the newest 10 copies, one a day by itself. On a new
// phone you enter the key and pick a copy to restore. The server only ever sees ciphertext and a
// hash of the key; without the key nobody can read or restore it (not us either).
//
// Unlike sync (which merges two devices into one), a backup is a point in time: restoring
// replaces what's on this device with that copy.
import { ALPHABET, enc, hex, open, seal } from "./sync.js";
import type { Db } from "./types.js";

export const BACKUP_URL = () => window.__backupUrl || "https://bloomko.eu/api/backup";
const SALT = "bloomko-backup-v1";
/** Format tag inside every backup, so a restore can tell it's really one. */
const FORMAT = "bloomko-backup-1";

/** A new backup key: 24 letters and digits in groups of four (about 120 bits). */
export function newKey(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(24));
  return [...bytes].map((b) => ALPHABET[b % 32]).join("").match(/.{4}/g).join("-");
}

/** "abcd efgh …" → "ABCD-EFGH-…", or "" when it isn't a backup key. */
export function cleanKey(input: string): string {
  const s = String(input || "").toUpperCase().replace(/[^0-9A-Z]/g, "").replace(/O/g, "0").replace(/I/g, "1");
  if (s.length !== 24 || [...s].some((c) => !ALPHABET.includes(c))) return "";
  return s.match(/.{4}/g).join("-");
}

async function idOf(key: string): Promise<string> {
  return hex(await crypto.subtle.digest("SHA-256", enc.encode(`bloomko-backup:${key}`)));
}

/** What a backup contains: everything except secrets and this device's sync/backup settings. */
export function payload(db: Db, edition: string) {
  const { sync: _s, backup: _b, account: _a, ...rest } = db;
  return { format: FORMAT, edition, at: new Date().toISOString(), db: { ...rest, settings: { ...db.settings, hf_token: "", llm_api_key: "" } } };
}

/** The little summary shown in the list of backups (also encrypted). */
export interface BackupMeta {
  at: string;
  edition: string;
  learned: number;
  streak?: number;
  device?: string;
  version?: string;
}

export interface BackupItem extends Partial<BackupMeta> {
  n: number;
  at: string;
  size: number;
}

async function call(method: string, path: string, body?: unknown) {
  let r: Response;
  try {
    r = await fetch(`${BACKUP_URL()}/${path}`, {
      method,
      headers: body ? { "Content-Type": "application/json" } : {},
      body: body ? JSON.stringify(body) : undefined,
    });
  } catch {
    throw new Error("Can't reach bloomko.eu — check your internet connection");
  }
  const data = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(data.error || `Backup server error ${r.status}`);
  return data;
}

/** Upload a new backup. */
export async function upload(key: string, db: Db, meta: BackupMeta): Promise<{ n: number }> {
  const id = await idOf(key);
  const data = await seal(key, payload(db, meta.edition), SALT);
  return call("POST", id, { data, meta: await seal(key, meta, SALT) });
}

/** The backups stored for this key, newest first, with their decrypted summaries. */
export async function list(key: string): Promise<BackupItem[]> {
  const id = await idOf(key);
  const { backups = [] } = await call("GET", id);
  const out: BackupItem[] = [];
  for (const b of backups) {
    let meta: Partial<BackupMeta> = {};
    try {
      if (b.meta) meta = await open(key, b.meta, SALT);
    } catch {
      /* summary unreadable: still listed by date */
    }
    out.push({ ...meta, n: b.n, at: b.at, size: b.size });
  }
  return out.sort((a, b) => b.n - a.n);
}

/** Download and decrypt one backup; returns the stored database. */
export async function download(key: string, n: number): Promise<{ edition: string; at: string; db: Db }> {
  const id = await idOf(key);
  const b = await call("GET", `${id}/${n}`);
  let p: any;
  try {
    p = await open(key, b.data, SALT);
  } catch {
    throw new Error("Couldn't decrypt this backup — is the key right?");
  }
  if (p?.format !== FORMAT || !p.db || !Array.isArray(p.db.words)) throw new Error("That isn't a Bloomko backup");
  return p;
}
