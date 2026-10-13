// Sync storage for the Bloomko app: one Durable Object per sync code (addressed by a SHA-256 of
// the code, so the server never sees the code). It only holds an encrypted, compressed blob —
// the app encrypts before uploading, the server can't read it.
import { DurableObject } from "cloudflare:workers";

const MAX = 8 * 1024 * 1024; // 8 MB of base64 is far more than a big course needs
const CHUNK = 1000 * 1000; // stored in pieces under the per-value size limit
const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, PUT, OPTIONS",
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
