// Sync storage for the Bloomko app: one Durable Object per sync code (addressed by a SHA-256 of
// the code, so the server never sees the code). It only holds an encrypted, compressed blob —
// the app encrypts before uploading, the server can't read it.
import { DurableObject } from "cloudflare:workers";

const MAX = 3 * 1024 * 1024; // 3 MB of base64: a big course is a few hundred KB
const BACKUPS_PER_DAY = 24; // more than this in a day is not a person backing up
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
  "Access-Control-Allow-Methods": "GET, PUT, POST, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
  "Access-Control-Max-Age": "86400",
};

/** The request's JSON body, refusing anything bigger than a backup could be. */
async function readJson(request) {
  if (Number(request.headers.get("Content-Length") || 0) > MAX + 20000) return null;
  try {
    return await request.json();
  } catch {
    return null;
  }
}
const ipOf = async (request) => toHex(await crypto.subtle.digest("SHA-256", enc.encode(`ip:${request.headers.get("CF-Connecting-IP") || ""}`))).slice(0, 16);

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

  /** Delete the synced copy (when its account is deleted). */
  async syncWipe() {
    const meta = await this.ctx.storage.get("meta");
    const keys = ["meta", ...Array.from({ length: meta?.chunks || 0 }, (_, i) => `c${i}`)];
    await this.ctx.storage.delete(keys);
    return { ok: true };
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
  /**
   * Checks the login key. Wrong tries lock out the address they come from (not the account), so
   * someone guessing from elsewhere can't lock the owner out.
   */
  async check(auth, ip = "") {
    const a = await this.account();
    if (!a) return { missing: true };
    a.ips ||= {};
    const rec = a.ips[ip] || { n: 0, until: 0 };
    if (rec.until > Date.now()) return { locked: Math.ceil((rec.until - Date.now()) / 60000) };
    if (!same(await verify(auth, a.salt), a.verifier)) {
      rec.n++;
      if (rec.n >= LOCK_AFTER) Object.assign(rec, { n: 0, until: Date.now() + LOCK_MS });
      a.ips[ip] = rec;
      const keys = Object.keys(a.ips);
      if (keys.length > 200) for (const k of keys.slice(0, keys.length - 200)) delete a.ips[k];
      await this.ctx.storage.put("account", a);
      return { wrong: true };
    }
    if (a.ips[ip]) {
      delete a.ips[ip];
      await this.ctx.storage.put("account", a);
    }
    return { ok: true, account: a };
  }

  async login(auth, ip) {
    const r = await this.check(auth, ip);
    return r.ok ? { vault: r.account.vault } : r;
  }

  /** New password (new login key and re-encrypted vault) or just a new vault. */
  async update(auth, newAuth, vault, ip) {
    const r = await this.check(auth, ip);
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

  async remove(auth, ip) {
    const r = await this.check(auth, ip);
    if (!r.ok) return r;
    await this.ctx.storage.delete("account");
    return { ok: true };
  }

  // Friends (2.1): a public garden card (name, streak, the look of the garden) that friends can
  // visit with your friend code, and an inbox of who watered your garden. Only the owner (with the
  // secret made on their device) can change the card or read the inbox.
  async friendGet() {
    const f = await this.ctx.storage.get("friend");
    return f ? { profile: f.profile, updated: f.updated } : null;
  }

  async friendPut(secret, profile) {
    const f = (await this.ctx.storage.get("friend")) || null;
    const hash = toHex(await crypto.subtle.digest("SHA-256", enc.encode(secret)));
    if (f && !same(f.owner, hash)) return { forbidden: true };
    const inbox = (f?.inbox || []).slice(-30);
    await this.ctx.storage.put("friend", { owner: hash, profile, updated: new Date().toISOString(), inbox, waters: f?.waters || {} });
    // The latest waterings; the app keeps track of which it has already shown.
    return { ok: true, inbox: inbox.map(({ name, at }) => ({ name, at })) };
  }

  /** Is this the secret of this card's owner? (Used to check who is watering.) */
  async friendOwns(secret) {
    const f = await this.ctx.storage.get("friend");
    return !!f && same(toHex(await crypto.subtle.digest("SHA-256", enc.encode(secret))), f.owner);
  }

  async friendDelete(secret) {
    if (!(await this.friendOwns(secret))) return { forbidden: true };
    await this.ctx.storage.delete("friend");
    return { ok: true };
  }

  async friendWater(from, name) {
    const f = await this.ctx.storage.get("friend");
    if (!f) return { missing: true };
    const day = new Date().toISOString().slice(0, 10);
    f.waters ||= {};
    if (f.waters[from] === day) return { already: true };
    f.waters[from] = day;
    // Forget who watered on earlier days, so the list stays small.
    for (const [k, d] of Object.entries(f.waters)) if (d !== day) delete f.waters[k];
    if (Object.keys(f.waters).length > 500) return { already: true };
    f.inbox = [...(f.inbox || []), { name, at: new Date().toISOString() }].slice(-30);
    await this.ctx.storage.put("friend", f);
    return { ok: true };
  }

  // Cloud backups (2.0): numbered snapshots, the newest BACKUPS kept. Each one is an encrypted
  // blob plus a small encrypted summary (date, words learned …) shown when choosing what to restore.
  async listBackups() {
    return ((await this.ctx.storage.get("bindex")) || []).map(({ n, at, size, meta }) => ({ n, at, size, meta }));
  }

  /** Delete every backup for this key. */
  async backupWipe() {
    const index = (await this.ctx.storage.get("bindex")) || [];
    const keys = ["bindex", "bnext", ...index.flatMap((b) => Array.from({ length: b.chunks }, (_, i) => `b${b.n}c${i}`))];
    await this.ctx.storage.delete(keys);
    return { ok: true };
  }

  async getBackup(n) {
    const item = ((await this.ctx.storage.get("bindex")) || []).find((b) => b.n === n);
    if (!item) return null;
    const parts = await this.ctx.storage.get(Array.from({ length: item.chunks }, (_, i) => `b${n}c${i}`));
    return { n, at: item.at, meta: item.meta, data: Array.from({ length: item.chunks }, (_, i) => parts.get(`b${n}c${i}`) || "").join("") };
  }

  async putBackup(data, meta) {
    const index = (await this.ctx.storage.get("bindex")) || [];
    const today = new Date().toISOString().slice(0, 10);
    if (index.filter((b) => b.at.startsWith(today)).length >= BACKUPS_PER_DAY) return { tooMany: true };
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
    const body = await readJson(request);
    if (!body) return json(400, { error: "invalid request" });
    const data = String(body?.data || "");
    if (!data || data.length > MAX || !/^[A-Za-z0-9+/=]+$/.test(data)) return json(400, { error: "invalid data" });
    const r = await stub.put(Number(body.base) || 0, data);
    return r.conflict ? json(409, r) : json(200, r);
  }
  // Knowing the id means knowing the sync code (it's a hash of it).
  if (request.method === "DELETE") return json(200, await stub.syncWipe());
  return json(405, { error: "use GET, PUT or DELETE" });
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
    const body = await readJson(request);
    if (!body) return json(400, { error: "invalid request" });
    const data = String(body?.data || "");
    const meta = String(body?.meta || "");
    if (!data || data.length > MAX || !B64.test(data) || meta.length > 4000 || (meta && !B64.test(meta))) return json(400, { error: "invalid data" });
    const r = await stub.putBackup(data, meta);
    return r.tooMany ? json(429, { error: "Too many backups today — try again tomorrow" }) : json(200, r);
  }
  if (request.method === "DELETE" && !num) return json(200, await stub.backupWipe());
  return json(405, { error: "use GET, POST or DELETE" });
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
  const body = await readJson(request);
  if (!body) return json(400, { error: "invalid request" });
  const ip = await ipOf(request);
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
  if (action === "login") return answer(await stub.login(auth, ip));
  if (action === "update") return answer(await stub.update(auth, newAuth, vault, ip));
  if (action === "delete") return answer(await stub.remove(auth, ip));
  return json(404, { error: "unknown action" });
}

const FRIEND = /^[2-9A-HJ-NP-Z]{4}-[2-9A-HJ-NP-Z]{4}$/;

/**
 * /api/friends/<code>: GET a friend's garden card; PUT { secret, profile } to update your own
 * (returns who watered it since last time). /api/friends/<code>/water: POST { from, name }.
 */
export async function handleFriends(request, env, path) {
  if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: CORS });
  if (!env.SYNC) return json(503, { error: "friends aren't set up on the server" });
  const [code, action] = path.split("/");
  if (!FRIEND.test(code || "")) return json(400, { error: "That isn't a friend code" });
  const stub = env.SYNC.get(env.SYNC.idFromName(`friend:${code}`));
  let body = {};
  if (request.method !== "GET") {
    body = await readJson(request);
    if (!body) return json(400, { error: "invalid request" });
  }
  if (request.method === "GET" && !action) {
    const f = await stub.friendGet();
    return f ? json(200, f) : json(404, { error: "No garden with this friend code" });
  }
  if (request.method === "PUT" && !action) {
    const secret = String(body.secret || "");
    const profile = body.profile;
    if (!/^[0-9a-f]{32,64}$/.test(secret) || !profile || typeof profile !== "object" || JSON.stringify(profile).length > 40000) return json(400, { error: "invalid data" });
    const r = await stub.friendPut(secret, profile);
    return r.forbidden ? json(403, { error: "not your garden" }) : json(200, r);
  }
  if (request.method === "DELETE" && !action) {
    const r = await stub.friendDelete(String(body.secret || ""));
    return r.forbidden ? json(403, { error: "not your garden" }) : json(200, r);
  }
  if (request.method === "POST" && action === "water") {
    const from = String(body.from || "");
    const name = String(body.name || "").trim().slice(0, 40) || "A friend";
    if (!FRIEND.test(from) || from === code) return json(400, { error: "invalid request" });
    // Only the owner of the "from" garden can water in its name.
    const sender = env.SYNC.get(env.SYNC.idFromName(`friend:${from}`));
    if (!(await sender.friendOwns(String(body.secret || "")))) return json(403, { error: "Turn on friends first" });
    const r = await stub.friendWater(from, name);
    return r.missing ? json(404, { error: "No garden with this friend code" }) : r.already ? json(409, { error: "Already watered today" }) : json(200, r);
  }
  return json(405, { error: "not allowed" });
}
