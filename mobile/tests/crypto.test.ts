// Sync codes, backup keys and the encryption both use (WebCrypto + CompressionStream, as in the app).
import { test } from "node:test";
import assert from "node:assert/strict";
import { cleanCode, newCode, open, seal, merge, snapshot } from "../src/sync.js";
import { cleanKey, newKey, upload, list, download } from "../src/backup.js";
import { loginKey, register, login, changePassword } from "../src/account.js";

test("sync codes and backup keys: generated, cleaned, and typos refused", () => {
  const code = newCode();
  assert.match(code, /^([2-9A-HJ-NP-Z]{4}-){3}[2-9A-HJ-NP-Z]{4}$/);
  assert.equal(cleanCode(code.toLowerCase().replace(/-/g, " ")), code);
  assert.equal(cleanCode("ABCD-EFGH"), "");
  const key = newKey();
  assert.equal(key.length, 29);
  assert.equal(cleanKey(` ${key.toLowerCase()} `), key);
  assert.equal(cleanKey(key.slice(0, 20)), "");
  assert.notEqual(newKey(), key);
});

test("encryption round-trip, and a wrong key can't read it", async () => {
  const obj = { hello: "你好", n: [1, 2, 3] };
  const box = await seal("CODE-AAAA-BBBB-CCCC", obj);
  assert.deepEqual(await open("CODE-AAAA-BBBB-CCCC", box), obj);
  await assert.rejects(open("CODE-AAAA-BBBB-DDDD", box));
  await assert.rejects(open("CODE-AAAA-BBBB-CCCC", box, "another-salt"), "backup and sync keys are kept apart");
});

const word = (id: number, hanzi: string, source = "hsk1") => ({ id, lang: "zh", section: source === "custom" ? "Mine" : "HSK 1", hanzi, pinyin: "", english: "x", position: id, source });
const card = (word_id: number, last: string, interval: number) => ({ word_id, skill: "write", due: last, interval, reps: 1, lapses: 0, last_review: last });
const db = (words: any[], cards: any[]): any => ({ version: 3, nextId: 100, words, cards, activity: {}, sentenceLog: [], settings: {}, garden: { raindrops: 1, saved: [], awarded: [] }, lookalikes: {}, grammar: { learned: {} }, sync: { code: "x", deleted: [] } });

test("sync merge: the newer review wins, your own words come across, nothing is lost", () => {
  const a = db([word(1, "好"), word(2, "猫", "custom")], [card(1, "2026-01-02 10:00:00", 5)]);
  const b = db([word(7, "好"), word(8, "狗", "custom")], [card(7, "2026-01-05 10:00:00", 9)]);
  merge(a, { v: 1, ...snapshot(b) });
  assert.equal(a.cards.find((c: any) => c.word_id === 1).interval, 9, "b reviewed later");
  assert.ok(a.words.some((w: any) => w.hanzi === "狗"), "b's own word was added");
  assert.ok(a.words.some((w: any) => w.hanzi === "猫"), "a's own word stays");
  merge(b, { v: 1, ...snapshot(a) });
  assert.equal(b.cards.find((c: any) => c.word_id === 7).interval, 9);
});

test("cloud backup: upload, list with summaries, restore — against a fake server", async () => {
  const store = new Map<string, any[]>();
  const realFetch = globalThis.fetch;
  globalThis.fetch = (async (url: string, init: any = {}) => {
    const [id, n] = String(url).split("/api/backup/")[1].split("/");
    const items = store.get(id) || [];
    if (init.method === "POST") {
      const body = JSON.parse(init.body);
      items.push({ n: items.length + 1, at: new Date().toISOString(), size: body.data.length, meta: body.meta, data: body.data });
      store.set(id, items);
      return new Response(JSON.stringify({ n: items.length }));
    }
    if (n) return new Response(JSON.stringify(items.find((b) => b.n === Number(n))));
    return new Response(JSON.stringify({ backups: items.map(({ data: _d, ...b }) => b) }));
  }) as typeof fetch;
  (globalThis as any).window = { __backupUrl: "https://test/api/backup" };
  try {
    const key = newKey();
    const mine = db([word(1, "好")], [card(1, "2026-01-02 10:00:00", 5)]);
    mine.settings = { display_name: "Ana", hf_token: "secret" };
    await upload(key, mine, { at: "2026-01-02T10:00:00Z", edition: "east", learned: 1 });
    await upload(key, mine, { at: "2026-01-03T10:00:00Z", edition: "east", learned: 1 });
    const items = await list(key);
    assert.equal(items.length, 2);
    assert.equal(items[0].n, 2, "newest first");
    assert.equal(items[0].learned, 1);
    const back = await download(key, 1);
    assert.equal(back.db.words[0].hanzi, "好");
    assert.equal(back.db.settings.display_name, "Ana");
    assert.equal(back.db.settings.hf_token, "", "secrets aren't backed up");
    assert.equal(back.db.sync, undefined, "this device's sync code isn't in the backup");
    assert.deepEqual(await list(newKey()), [], "another key sees nothing");
    for (const [, items2] of store) for (const b of items2) assert.ok(!b.data.includes("Ana") && !atob(b.data).includes("Ana"), "the server only sees ciphertext");
  } finally {
    globalThis.fetch = realFetch;
    delete (globalThis as any).window;
  }
});

test("account: the password never leaves the device; the vault opens only with it", async () => {
  const k1 = await loginKey("Ana@Example.com ", "kava-in-caj-123");
  assert.equal(k1, await loginKey("ana@example.com", "kava-in-caj-123"), "email case and spaces don't matter");
  assert.notEqual(k1, await loginKey("ana@example.com", "kava-in-caj-124"));
  const sent: any[] = [];
  const accounts = new Map<string, any>();
  const realFetch = globalThis.fetch;
  globalThis.fetch = (async (url: string, init: any) => {
    const action = String(url).split("/").pop();
    const body = JSON.parse(init.body);
    sent.push(init.body);
    const a = accounts.get(body.email);
    if (action === "register") accounts.set(body.email, { auth: body.auth, vault: body.vault });
    else if (!a || a.auth !== body.auth) return new Response(JSON.stringify({ error: "Wrong email or password" }), { status: 401 });
    else if (action === "update") accounts.set(body.email, { auth: body.new_auth, vault: body.vault });
    return new Response(JSON.stringify({ ok: true, vault: accounts.get(body.email)?.vault }));
  }) as typeof fetch;
  (globalThis as any).window = { __accountUrl: "https://test/api/account" };
  try {
    await register("ana@example.com", "kava-in-caj-123", { sync: "ABCD-EFGH-JKLM-NPQR" });
    assert.deepEqual(await login("ana@example.com", "kava-in-caj-123"), { sync: "ABCD-EFGH-JKLM-NPQR" });
    await assert.rejects(login("ana@example.com", "wrong-password"), /Wrong/);
    await changePassword("ana@example.com", "kava-in-caj-123", "nova-gesla-456");
    assert.equal((await login("ana@example.com", "nova-gesla-456")).sync, "ABCD-EFGH-JKLM-NPQR");
    await assert.rejects(register("ana@example.com", "short", { sync: "x" }), /at least 8/);
    assert.ok(sent.every((b) => !b.includes("kava-in-caj-123") && !b.includes("nova-gesla-456") && !b.includes("ABCD-EFGH")), "no password or sync code is ever sent");
  } finally {
    globalThis.fetch = realFetch;
    delete (globalThis as any).window;
  }
});

test("sync: a word deleted on one device and added again later stays", () => {
  const a = db([word(1, "好"), { ...word(2, "猫", "custom"), created_at: "2026-01-05 10:00:00" }], []);
  const b = db([word(7, "好")], []);
  b.sync.deleted = ["zh|猫|c:Mine\t2026-01-03 10:00:00"]; // deleted before it was added again
  merge(a, { v: 1, ...snapshot(b) });
  assert.ok(a.words.some((w: any) => w.hanzi === "猫"), "re-added word survives an older deletion");
  b.sync.deleted = ["zh|猫|c:Mine\t2026-01-09 10:00:00"]; // deleted afterwards
  merge(a, { v: 1, ...snapshot(b) });
  assert.ok(!a.words.some((w: any) => w.hanzi === "猫"), "a later deletion wins");
});

test("sync: cards of the other app's words are kept, not lost (East ↔ Heritage)", () => {
  const east = db([word(1, "好")], [card(1, "2026-01-02 10:00:00", 30)]);
  const heritage = db([{ ...word(5, "hiša"), lang: "sl" }], [card(5, "2026-01-02 10:00:00", 4)]);
  merge(heritage, { v: 1, ...snapshot(east) });
  const passedOn = snapshot(heritage).cards;
  assert.ok(passedOn.some((c: any) => c.w === "zh|好|b" && c.interval === 30), "Heritage passes the Chinese card on");
  const freshEast = db([word(9, "好")], []);
  merge(freshEast, { v: 1, ...snapshot(heritage) });
  assert.equal(freshEast.cards.find((c: any) => c.word_id === 9)?.interval, 30, "a new East phone gets it back");
});
