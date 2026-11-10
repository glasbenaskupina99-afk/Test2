// Sync storage for the Bloomko app: one Durable Object per sync code (addressed by a SHA-256 of
// the code, so the server never sees the code). It only holds an encrypted, compressed blob —
// the app encrypts before uploading, the server can't read it.
import { DurableObject } from "cloudflare:workers";

const MAX = 8 * 1024 * 1024; // 8 MB of base64 is far more than a big course needs
const CHUNK = 1000 * 1000; // stored in pieces under the per-value size limit
const BACKUPS = 10; // cloud backups kept per backup key (the oldest go first)
const B64 = /^[A-Za-z0-9+/=]+$/;
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
