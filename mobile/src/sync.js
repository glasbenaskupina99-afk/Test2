// Sync between devices (phone ↔ computer, old phone → new phone) without an account.
// Your progress is compressed and encrypted on the device with a key made from your sync code,
// then stored on bloomko.eu under a hash of that code — the server can't read it. Every device
// with the same code merges the copy into its own data, so nothing is lost on either side.

export const SYNC_URL = () => window.__syncUrl || "https://bloomko.eu/api/sync";
const ALPHABET = "23456789ABCDEFGHJKLMNPQRSTUVWXYZ"; // no 0/O, 1/I
const SYNCED_SETTINGS = ["section_zh", "section_ja", "section_sl", "display_name", "daily_goal", "new_per_lesson", "review_size", "sentence_count", "leniency", "hint_after_misses", "tts_rate"];

export function newCode() {
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  const chars = [...bytes].map((b) => ALPHABET[b % 32]).join("");
  return chars.match(/.{4}/g).join("-");
}

/** "abcd efgh-…" → "ABCD-EFGH-…" or "" when it isn't a valid code. */
export function cleanCode(input) {
  const s = String(input || "").toUpperCase().replace(/[^0-9A-Z]/g, "").replace(/O/g, "0").replace(/I/g, "1");
  if (s.length !== 16 || [...s].some((c) => !ALPHABET.includes(c))) return "";
  return s.match(/.{4}/g).join("-");
}

const enc = new TextEncoder();
const hex = (buf) => [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");
const b64 = (bytes) => {
  let s = "";
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(s);
};
const unb64 = (s) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0));

async function idOf(code) {
  return hex(await crypto.subtle.digest("SHA-256", enc.encode(`bloomko-sync:${code}`)));
}

async function keyOf(code) {
  const base = await crypto.subtle.importKey("raw", enc.encode(code), "PBKDF2", false, ["deriveKey"]);
  return crypto.subtle.deriveKey(
    { name: "PBKDF2", salt: enc.encode("bloomko-sync-v1"), iterations: 100000, hash: "SHA-256" },
    base,
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt", "decrypt"]
  );
}

async function pipe(bytes, stream) {
  return new Uint8Array(await new Response(new Blob([bytes]).stream().pipeThrough(stream)).arrayBuffer());
}

async function seal(code, obj) {
  const zipped = await pipe(enc.encode(JSON.stringify(obj)), new CompressionStream("gzip"));
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ct = new Uint8Array(await crypto.subtle.encrypt({ name: "AES-GCM", iv }, await keyOf(code), zipped));
  const out = new Uint8Array(iv.length + ct.length);
  out.set(iv);
  out.set(ct, iv.length);
  return b64(out);
}

async function open(code, data) {
  const bytes = unb64(data);
  const plain = await crypto.subtle.decrypt({ name: "AES-GCM", iv: bytes.slice(0, 12) }, await keyOf(code), bytes.slice(12));
  return JSON.parse(new TextDecoder().decode(await pipe(new Uint8Array(plain), new DecompressionStream("gzip"))));
}

// ------------------------------------------------------------------ what gets synced

export const wordKey = (w) => `${w.lang}|${w.hanzi}|${w.source === "custom" ? `c:${w.section}` : "b"}`;
const later = (a, b) => String(a || "") > String(b || "");

/** The parts of the database that are your progress, with words referenced by content (ids differ per device). */
export function snapshot(db) {
  const byId = new Map(db.words.map((w) => [w.id, w]));
  return {
    v: 1,
    at: db.sync?.changed_at || "",
    words: db.words.filter((w) => w.source === "custom" || w.extras).map(({ id: _id, ...w }) => (w.source === "custom" ? w : { lang: w.lang, hanzi: w.hanzi, source: w.source, extras: w.extras })),
    cards: db.cards.filter((c) => byId.has(c.word_id)).map(({ word_id, ...c }) => ({ ...c, w: wordKey(byId.get(word_id)) })),
    deleted: db.sync?.deleted || [],
    activity: db.activity,
    sentenceLog: db.sentenceLog,
    garden: { raindrops: db.garden.raindrops, saved: db.garden.saved, awarded: db.garden.awarded },
    lookalikes: db.lookalikes,
    grammar: db.grammar,
    stories: db.stories || {},
    storiesAi: db.storiesAi || [],
    settings: Object.fromEntries(SYNCED_SETTINGS.filter((k) => k in (db.settings || {})).map((k) => [k, db.settings[k]])),
  };
}

/** Merges another device's snapshot into db (in place). Newer reviews win; nothing is dropped. */
export function merge(db, r) {
  if (!r || r.v !== 1) return;
  const deleted = new Set([...(db.sync.deleted || []), ...(r.deleted || [])]);
  db.sync.deleted = [...deleted].slice(-500);

  // Words: your own words from the other device are added; memory hooks are kept.
  const local = new Map(db.words.map((w) => [wordKey(w), w]));
  for (const w of r.words || []) {
    const k = wordKey(w);
    if (deleted.has(k)) continue;
    const mine = local.get(k);
    if (mine) {
      if (w.extras && !mine.extras) mine.extras = w.extras;
    } else if (w.source === "custom") {
      const nw = { ...w, id: db.nextId++ };
      db.words.push(nw);
      local.set(k, nw);
    }
  }
  const gone = new Set(db.words.filter((w) => deleted.has(wordKey(w))).map((w) => w.id));
  if (gone.size) {
    db.words = db.words.filter((w) => !gone.has(w.id));
    db.cards = db.cards.filter((c) => !gone.has(c.word_id));
  }

  // Review cards: the one reviewed more recently wins.
  const cards = new Map(db.cards.map((c) => [`${c.word_id}|${c.skill}`, c]));
  for (const { w, ...c } of r.cards || []) {
    const word = local.get(w);
    if (!word || gone.has(word.id)) continue;
    const k = `${word.id}|${c.skill}`;
    const mine = cards.get(k);
    if (!mine) {
      const nc = { ...c, word_id: word.id };
      db.cards.push(nc);
      cards.set(k, nc);
    } else if (later(c.last_review, mine.last_review)) {
      Object.assign(mine, c, { word_id: word.id });
    }
  }

  // Daily activity: the higher number per day (the same day may have been synced before).
  for (const [day, a] of Object.entries(r.activity || {})) {
    const mine = (db.activity[day] ||= { xp: 0, new_words: 0, reviews: 0, sentences: 0 });
    for (const [f, v] of Object.entries(a)) if (typeof v === "number") mine[f] = Math.max(mine[f] || 0, v);
  }

  const seen = new Set(db.sentenceLog.map((x) => `${x.lang}|${x.hanzi}|${x.created_at}`));
  for (const x of r.sentenceLog || []) if (!seen.has(`${x.lang}|${x.hanzi}|${x.created_at}`)) db.sentenceLog.push(x);
  db.sentenceLog.sort((a, b) => String(a.created_at).localeCompare(String(b.created_at)));
  db.sentenceLog = db.sentenceLog.slice(-300);

  const newer = later(r.at, db.sync.changed_at);
  if (r.garden) {
    db.garden.saved = [...new Set([...db.garden.saved, ...(r.garden.saved || [])])].sort();
    db.garden.awarded = [...new Set([...db.garden.awarded, ...(r.garden.awarded || [])])].sort();
    if (newer && typeof r.garden.raindrops === "number") db.garden.raindrops = r.garden.raindrops;
  }
  for (const [k, v] of Object.entries(r.lookalikes || {})) {
    const mine = (db.lookalikes[k] ||= { seen: 0, wrong: 0 });
    mine.seen = Math.max(mine.seen, v.seen || 0);
    mine.wrong = Math.max(mine.wrong, v.wrong || 0);
  }
  for (const [id, c] of Object.entries(r.grammar?.learned || {})) {
    const mine = db.grammar.learned[id];
    if (!mine || later(c.last_review, mine.last_review)) db.grammar.learned[id] = c;
  }
  db.stories ||= {};
  for (const [id, s] of Object.entries(r.stories || {})) {
    const mine = (db.stories[id] ||= { done: false, best: 0 });
    mine.done = mine.done || !!s.done;
    mine.best = Math.max(mine.best || 0, s.best || 0);
  }
  const ai = new Map((db.storiesAi || []).map((s) => [s.id, s]));
  for (const s of r.storiesAi || []) if (!ai.has(s.id)) ai.set(s.id, s);
  db.storiesAi = [...ai.values()].sort((a, b) => String(b.id).localeCompare(String(a.id))).slice(0, 6);

  if (newer) for (const [k, v] of Object.entries(r.settings || {})) db.settings[k] = v;
}

// ------------------------------------------------------------------ talking to bloomko.eu

async function request(method, id, body) {
  const r = await fetch(`${SYNC_URL()}/${id}`, {
    method,
    headers: body ? { "Content-Type": "application/json" } : {},
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await r.json().catch(() => ({}));
  if (r.status === 409) return { conflict: true, ...data };
  if (!r.ok) throw new Error(data.error || `Sync server error ${r.status}`);
  return data;
}

/**
 * Pull, merge, push. Returns { changed } — true when the other device brought something new.
 * `db.sync` holds { code, version, hash, last, changed_at, deleted }.
 */
export async function syncNow(db) {
  const s = db.sync;
  if (!s?.code) throw new Error("Sync is off");
  const id = await idOf(s.code);
  let changed = false;
  for (let attempt = 0; attempt < 3; attempt++) {
    const remote = await request("GET", id);
    if (remote.data && remote.version !== s.version) {
      let snap;
      try {
        snap = await open(s.code, remote.data);
      } catch {
        throw new Error("Couldn't read the synced data — is the code right?");
      }
      const before = JSON.stringify(snapshot(db));
      merge(db, snap);
      changed = changed || JSON.stringify(snapshot(db)) !== before;
    }
    const snap = snapshot(db);
    const json = JSON.stringify(snap);
    const hash = hex(await crypto.subtle.digest("SHA-256", enc.encode(json)));
    if (remote.version && hash === s.hash && remote.version === s.version) break; // nothing new on either side
    if (remote.version && hash === s.hash) { s.version = remote.version; break; }
    const put = await request("PUT", id, { base: remote.version || 0, data: await seal(s.code, snap) });
    if (put.conflict) continue; // another device synced in between: merge again
    s.version = put.version;
    s.hash = hash;
    break;
  }
  s.last = new Date().toISOString();
  return { changed };
}
