// Sync storage for the Bloomko app: one Durable Object per sync code (addressed by a SHA-256 of
// the code, so the server never sees the code). It only holds an encrypted, compressed blob —
// the app encrypts before uploading, the server can't read it.
import { DurableObject } from "cloudflare:workers";

const MAX = 8 * 1024 * 1024; // 8 MB of base64 is far more than a big course needs
const CHUNK = 1000 * 1000; // stored in pieces under the per-value size limit
const BACKUPS = 10; // cloud backups kept per backup key (the oldest go first)
const B64 = /^[A-Za-z0-9+/=]+$/;
const LOCK_AFTER = 8; // wrong passwords in a row …
const LOCK_MS = 15 * 60 * 1000; // … lock the account for 15 minutes

const enc = new TextEncoder();
const toHex = (buf) => [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");
const randomHex = (n) => toHex(crypto.getRandomValues(new Uint8Array(n)));
/** The stored verifier: the login key (already stretched on the device) stretched again here. */
async function verify(auth, salt) {
  const base = await crypto.subtle.importKey("raw", enc.encode(auth), "PBKDF2", false, ["deriveBits"]);
  return toHex(await crypto.subtle.deriveBits({ name: "PBKDF2", salt: enc.encode(salt), iterations: 10000, hash: "SHA-256" }, base, 256));
}
/** Compare without leaking where the first difference is. */
function same(a, b) {
  if (a.length !== b.length) return false;
  let d = 0;
  for (let i = 0; i < a.length; i++) d |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return d === 0;
}
const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, PUT, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
  "Access-Control-Max-Age": "86400",
};

const json = (status, body) =>
  new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json", "Cache-Control": "no-store", ...CORS } });

export class SyncStore extends DurableObject {
  async get() {
    const meta = (await this.ctx.storage.get("meta")) || null;
    if (!meta) return { version: 0 };
    const parts = await this.ctx.storage.get(Array.from({ length: meta.chunks }, (_, i) => `c${i}`));
    const data = Array.from({ length: meta.chunks }, (_, i) => parts.get(`c${i}`) || "").join("");
    return { version: meta.version, data, updated: meta.updated };
  }

  async put(base, data) {
    const meta = (await this.ctx.storage.get("meta")) || { version: 0, chunks: 0 };
    if (base !== meta.version) return { conflict: true, version: meta.version };
    const chunks = Math.ceil(data.length / CHUNK) || 1;
    const entries = {};
    for (let i = 0; i < chunks; i++) entries[`c${i}`] = data.slice(i * CHUNK, (i + 1) * CHUNK);
    const next = { version: meta.version + 1, chunks, updated: new Date().toISOString() };
    await this.ctx.storage.put({ ...entries, meta: next });
    const stale = Array.from({ length: Math.max(0, meta.chunks - chunks) }, (_, i) => `c${chunks + i}`);
    if (stale.length) await this.ctx.storage.delete(stale);
    return { version: next.version };
  }

  // Accounts (2.0): one object per email (by hash). Holds a verifier for the login key and the
  // "vault" — the sync code, encrypted on the device with a key from the password. The password
  // itself never reaches the server, so the server can't open the vault either.
  async account() {
    return (await this.ctx.storage.get("account")) || null;
  }

  async register(auth, vault) {
    if (await this.account()) return { exists: true };
    const salt = randomHex(16);
    await this.ctx.storage.put("account", { salt, verifier: await verify(auth, salt), vault, created: new Date().toISOString(), fails: 0, lockedUntil: 0 });
    return { ok: true };
  }

  /** Checks the login key; too many wrong tries lock the account for a while. */
  async check(auth) {
    const a = await this.account();
    if (!a) return { missing: true };
    if (a.lockedUntil > Date.now()) return { locked: Math.ceil((a.lockedUntil - Date.now()) / 60000) };
    if (!same(await verify(auth, a.salt), a.verifier)) {
      a.fails = (a.fails || 0) + 1;
      if (a.fails >= LOCK_AFTER) Object.assign(a, { fails: 0, lockedUntil: Date.now() + LOCK_MS });
      await this.ctx.storage.put("account", a);
      return { wrong: true };
    }
    if (a.fails) await this.ctx.storage.put("account", { ...a, fails: 0 });
    return { ok: true, account: a };
  }

  async login(auth) {
    const r = await this.check(auth);
    return r.ok ? { vault: r.account.vault } : r;
  }

  /** New password (new login key and re-encrypted vault) or just a new vault. */
  async update(auth, newAuth, vault) {
    const r = await this.check(auth);
    if (!r.ok) return r;
    const a = r.account;
    if (newAuth) {
      a.salt = randomHex(16);
      a.verifier = await verify(newAuth, a.salt);
    }
    if (vault) a.vault = vault;
    await this.ctx.storage.put("account", a);
    return { ok: true };
  }

  async remove(auth) {
    const r = await this.check(auth);
    if (!r.ok) return r;
    await this.ctx.storage.delete("account");
    return { ok: true };
  }

  // Cloud backups (2.0): numbered snapshots, the newest BACKUPS kept. Each one is an encrypted
  // blob plus a small encrypted summary (date, words learned …) shown when choosing what to restore.
  async listBackups() {
    return ((await this.ctx.storage.get("bindex")) || []).map(({ n, at, size, meta }) => ({ n, at, size, meta }));
  }

  async getBackup(n) {
    const item = ((await this.ctx.storage.get("bindex")) || []).find((b) => b.n === n);
    if (!item) return null;
    const parts = await this.ctx.storage.get(Array.from({ length: item.chunks }, (_, i) => `b${n}c${i}`));
    return { n, at: item.at, meta: item.meta, data: Array.from({ length: item.chunks }, (_, i) => parts.get(`b${n}c${i}`) || "").join("") };
  }

  async putBackup(data, meta) {
    const index = (await this.ctx.storage.get("bindex")) || [];
    const n = ((await this.ctx.storage.get("bnext")) || 0) + 1;
    const chunks = Math.ceil(data.length / CHUNK) || 1;
    const entries = {};
    for (let i = 0; i < chunks; i++) entries[`b${n}c${i}`] = data.slice(i * CHUNK, (i + 1) * CHUNK);
    index.push({ n, at: new Date().toISOString(), size: data.length, chunks, meta });
    const drop = index.splice(0, Math.max(0, index.length - BACKUPS));
    await this.ctx.storage.put({ ...entries, bindex: index, bnext: n });
    const stale = drop.flatMap((b) => Array.from({ length: b.chunks }, (_, i) => `b${b.n}c${i}`));
    if (stale.length) await this.ctx.storage.delete(stale);
    return { n, kept: index.length };
  }
}

/** /api/sync/<64 hex chars>: GET the stored copy, PUT a new one ({ base, data }). */
export async function handleSync(request, env, id) {
  if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: CORS });
  if (!/^[0-9a-f]{64}$/.test(id)) return json(400, { error: "bad sync id" });
  if (!env.SYNC) return json(503, { error: "sync isn't set up on the server" });
  const stub = env.SYNC.get(env.SYNC.idFromName(id));
  if (request.method === "GET") return json(200, await stub.get());
  if (request.method === "PUT") {
    let body;
    try {
      body = await request.json();
    } catch {
      return json(400, { error: "invalid request" });
    }
    const data = String(body?.data || "");
    if (!data || data.length > MAX || !/^[A-Za-z0-9+/=]+$/.test(data)) return json(400, { error: "invalid data" });
    const r = await stub.put(Number(body.base) || 0, data);
    return r.conflict ? json(409, r) : json(200, r);
  }
  return json(405, { error: "use GET or PUT" });
}

/**
 * /api/backup/<64 hex chars>: GET lists the backups, POST stores a new one ({ data, meta }).
 * /api/backup/<id>/<n>: GET one backup. The id is a hash of the backup key; data and meta are
 * encrypted on the device with that key, so the server can't read either.
 */
export async function handleBackup(request, env, path) {
  if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: CORS });
  const [id, num] = path.split("/");
  if (!/^[0-9a-f]{64}$/.test(id || "")) return json(400, { error: "bad backup id" });
  if (!env.SYNC) return json(503, { error: "backups aren't set up on the server" });
  const stub = env.SYNC.get(env.SYNC.idFromName(`backup:${id}`));
  if (request.method === "GET" && num) {
    const b = await stub.getBackup(Number(num));
    return b ? json(200, b) : json(404, { error: "no such backup" });
  }
  if (request.method === "GET") return json(200, { backups: await stub.listBackups() });
  if (request.method === "POST" && !num) {
    let body;
    try {
      body = await request.json();
    } catch {
      return json(400, { error: "invalid request" });
    }
    const data = String(body?.data || "");
    const meta = String(body?.meta || "");
    if (!data || data.length > MAX || !B64.test(data) || meta.length > 4000 || (meta && !B64.test(meta))) return json(400, { error: "invalid data" });
    return json(200, await stub.putBackup(data, meta));
  }
  return json(405, { error: "use GET or POST" });
}

const EMAIL = /^[^\s@]{1,64}@[^\s@]{1,190}\.[^\s@]{2,24}$/;
const HEX64 = /^[0-9a-f]{64}$/;

/**
 * /api/account/register | login | update | delete — POST { email, auth, vault?, new_auth? }.
 * `auth` is a key the app derives from the password; `vault` is encrypted on the device.
 */
export async function handleAccount(request, env, action) {
  if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: CORS });
  if (request.method !== "POST") return json(405, { error: "use POST" });
  if (!env.SYNC) return json(503, { error: "accounts aren't set up on the server" });
  let body;
  try {
    body = await request.json();
  } catch {
    return json(400, { error: "invalid request" });
  }
  const email = String(body?.email || "").trim().toLowerCase();
  const auth = String(body?.auth || "");
  const vault = body?.vault == null ? "" : String(body.vault);
  const newAuth = body?.new_auth == null ? "" : String(body.new_auth);
  if (!EMAIL.test(email)) return json(400, { error: "That doesn't look like an email address" });
  if (!HEX64.test(auth) || (newAuth && !HEX64.test(newAuth))) return json(400, { error: "invalid request" });
  if (vault.length > 4000 || (vault && !B64.test(vault))) return json(400, { error: "invalid data" });
  const id = toHex(await crypto.subtle.digest("SHA-256", enc.encode(`bloomko-account:${email}`)));
  const stub = env.SYNC.get(env.SYNC.idFromName(`account:${id}`));
  const answer = (r) =>
    r.exists ? json(409, { error: "There's already an account with this email — sign in instead" })
    : r.missing || r.wrong ? json(401, { error: "Wrong email or password" })
    : r.locked ? json(429, { error: `Too many wrong passwords — try again in ${r.locked} min` })
    : json(200, r);
  if (action === "register") {
    if (!vault) return json(400, { error: "invalid data" });
    return answer(await stub.register(auth, vault));
  }
  if (action === "login") return answer(await stub.login(auth));
  if (action === "update") return answer(await stub.update(auth, newAuth, vault));
  if (action === "delete") return answer(await stub.remove(auth));
  return json(404, { error: "unknown action" });
}
