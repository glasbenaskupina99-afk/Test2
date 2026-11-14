// The bloomko.eu sync / backup endpoints (worker/sync.js), run in Node with an in-memory Durable Object.
import { test } from "node:test";
import assert from "node:assert/strict";
import { build } from "esbuild";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";

const dir = mkdtempSync(join(tmpdir(), "bloomko-worker-"));
writeFileSync(join(dir, "stub.js"), "export class DurableObject { constructor(ctx, env) { this.ctx = ctx; this.env = env; } }");
await build({
  entryPoints: [new URL("../../worker/sync.js", import.meta.url).pathname],
  bundle: true,
  format: "esm",
  platform: "neutral",
  outfile: join(dir, "sync.mjs"),
  alias: { "cloudflare:workers": join(dir, "stub.js") },
  logLevel: "silent",
});
const { SyncStore, handleAccount, handleBackup, handleFriends, handleSync } = await import(pathToFileURL(join(dir, "sync.mjs")).href);

/** Durable Object storage in memory (get/put/delete with single keys, arrays and objects). */
function memoryStorage() {
  const m = new Map<string, any>();
  return {
    async get(k: any) {
      if (Array.isArray(k)) return new Map(k.filter((x) => m.has(x)).map((x) => [x, structuredClone(m.get(x))]));
      return structuredClone(m.get(k));
    },
    async put(k: any, v?: any) {
      if (typeof k === "object") for (const [a, b] of Object.entries(k)) m.set(a, structuredClone(b));
      else m.set(k, structuredClone(v));
    },
    async delete(k: any) {
      for (const x of [].concat(k)) m.delete(x);
    },
    size: () => m.size,
  };
}

function env() {
  const objects = new Map<string, any>();
  return {
    SYNC: {
      idFromName: (name: string) => name,
      get: (id: string) => {
        if (!objects.has(id)) objects.set(id, new SyncStore({ storage: memoryStorage() }, {}));
        return objects.get(id);
      },
    },
    objects,
  };
}

const ID = "a".repeat(64);
const req = (method: string, body?: unknown) => new Request("https://bloomko.eu/x", { method, body: body ? JSON.stringify(body) : undefined, headers: { "Content-Type": "application/json" } });
const call = async (r: Response) => ({ status: r.status, body: await r.json() });

test("backups: store, list, fetch one; only the newest 10 are kept", async () => {
  const e = env();
  assert.deepEqual((await call(await handleBackup(req("GET"), e, ID))).body, { backups: [] });
  for (let i = 1; i <= 12; i++) {
    const r = await call(await handleBackup(req("POST", { data: btoa(`backup ${i}`), meta: btoa("m") }), e, ID));
    assert.equal(r.status, 200);
    assert.equal(r.body.n, i);
  }
  const listed = (await call(await handleBackup(req("GET"), e, ID))).body.backups;
  assert.deepEqual(listed.map((b: any) => b.n), [3, 4, 5, 6, 7, 8, 9, 10, 11, 12]);
  const one = await call(await handleBackup(req("GET"), e, `${ID}/12`));
  assert.equal(atob(one.body.data), "backup 12");
  assert.equal((await handleBackup(req("GET"), e, `${ID}/1`)).status, 404, "the oldest was dropped");
  // Old chunks are deleted, not left behind.
  const storage = e.objects.get(`backup:${ID}`).ctx.storage;
  assert.equal(storage.size(), 10 + 2, "10 one-chunk backups + index + counter");
});

test("backups: bad ids and bad data are refused", async () => {
  const e = env();
  assert.equal((await handleBackup(req("GET"), e, "nope")).status, 400);
  assert.equal((await handleBackup(req("POST", { data: "not base64!" }), e, ID)).status, 400);
  assert.equal((await handleBackup(req("POST", {}), e, ID)).status, 400);
  assert.equal((await handleBackup(req("PATCH"), e, ID)).status, 405);
  // Deleting removes every backup of the key.
  await handleBackup(req("POST", { data: btoa("x") }), e, ID);
  assert.equal((await handleBackup(req("DELETE"), e, ID)).status, 200);
  assert.deepEqual((await call(await handleBackup(req("GET"), e, ID))).body, { backups: [] });
});

test("sync and backup with the same id don't touch each other", async () => {
  const e = env();
  await handleBackup(req("POST", { data: btoa("b") }), e, ID);
  const s = await call(await handleSync(req("GET"), e, ID));
  assert.deepEqual(s.body, { version: 0 });
  const put = await call(await handleSync(req("PUT", { base: 0, data: btoa("s") }), e, ID));
  assert.equal(put.body.version, 1);
  const conflict = await handleSync(req("PUT", { base: 0, data: btoa("s2") }), e, ID);
  assert.equal(conflict.status, 409, "a stale base version is a conflict");
});

test("accounts: register, sign in, wrong password, lock-out, new password, delete", async () => {
  const e = env();
  const auth = "1".repeat(64);
  const other = "2".repeat(64);
  const post = (action: string, body: unknown) => handleAccount(req("POST", body), e, action).then(call);
  assert.equal((await post("register", { email: "Ana@Example.com", auth, vault: btoa("v1") })).status, 200);
  assert.equal((await post("register", { email: "ana@example.com", auth, vault: btoa("v") })).status, 409, "one account per email (case doesn't matter)");
  const ok = await post("login", { email: "ana@example.com", auth });
  assert.equal(ok.status, 200);
  assert.equal(atob(ok.body.vault), "v1");
  assert.equal((await post("login", { email: "ana@example.com", auth: other })).status, 401);
  assert.equal((await post("login", { email: "nobody@example.com", auth })).status, 401, "same answer for an unknown email");
  for (let i = 0; i < 7; i++) await post("login", { email: "ana@example.com", auth: other });
  assert.equal((await post("login", { email: "ana@example.com", auth })).status, 429, "8 wrong tries lock the account");
  // A fresh account to check password change and deletion.
  await post("register", { email: "bo@example.com", auth, vault: btoa("v2") });
  assert.equal((await post("update", { email: "bo@example.com", auth, new_auth: other, vault: btoa("v3") })).status, 200);
  assert.equal((await post("login", { email: "bo@example.com", auth })).status, 401, "the old password no longer works");
  assert.equal(atob((await post("login", { email: "bo@example.com", auth: other })).body.vault), "v3");
  assert.equal((await post("delete", { email: "bo@example.com", auth: other })).status, 200);
  assert.equal((await post("login", { email: "bo@example.com", auth: other })).status, 401);
  assert.equal((await post("login", { email: "not-an-email", auth })).status, 400);
  // The server never stores the login key itself.
  const stored = JSON.stringify([...e.objects.values()].map((o: any) => o.ctx.storage));
  assert.ok(!stored.includes(auth));
});

test("friends: publish a garden card, visit it, water it once a day, see who watered", async () => {
  const e = env();
  const code = "ABCD-EFGH";
  const secret = "0".repeat(32);
  const call2 = async (method: string, path: string, body?: unknown) => call(await handleFriends(req(method, body), e, path));
  assert.equal((await call2("GET", code)).status, 404);
  assert.equal((await call2("PUT", code, { secret, profile: { name: "Ana", streak: 3 } })).status, 200);
  assert.equal((await call2("PUT", code, { secret: "1".repeat(32), profile: { name: "Mallory" } })).status, 403, "only the owner can change the card");
  assert.equal((await call2("GET", code)).body.profile.name, "Ana");
  // Bo has a card of his own; only he (with his secret) can water in its name.
  const bo = "2".repeat(32);
  await call2("PUT", "JKLM-NPQR", { secret: bo, profile: { name: "Bo" } });
  assert.equal((await call2("POST", `${code}/water`, { from: "JKLM-NPQR", name: "Bo", secret: "3".repeat(32) })).status, 403, "can't water in someone else's name");
  assert.equal((await call2("POST", `${code}/water`, { from: "KLMN-PQRS", name: "Ghost", secret: bo })).status, 403, "the sender's garden must exist");
  assert.equal((await call2("POST", `${code}/water`, { from: "JKLM-NPQR", name: "Bo", secret: bo })).status, 200);
  assert.equal((await call2("POST", `${code}/water`, { from: "JKLM-NPQR", name: "Bo", secret: bo })).status, 409, "once a day per friend");
  assert.equal((await call2("POST", `${code}/water`, { from: code, name: "Ana" })).status, 400, "not your own garden");
  const r = await call2("PUT", code, { secret, profile: { name: "Ana", streak: 4 } });
  assert.deepEqual(r.body.inbox.map((w: any) => w.name), ["Bo"]);
  assert.equal((await call2("GET", "nope")).status, 400);
  assert.equal((await call2("DELETE", code, { secret: "1".repeat(32) })).status, 403);
  assert.equal((await call2("DELETE", code, { secret })).status, 200);
  assert.equal((await call2("GET", code)).status, 404, "the card is gone");
});
