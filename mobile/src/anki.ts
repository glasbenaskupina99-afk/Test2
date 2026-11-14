// Reading Anki decks (.apkg) in the app (2.0). An .apkg is a zip with an SQLite collection:
// collection.anki2 / .anki21 (older exports: note types and decks as JSON in the col table) or
// collection.anki21b (newer exports: zstd-compressed, with notetypes / fields / decks tables).
// This file only parses; the UI picks which fields are the word, the reading and the meaning.
import { unzipSync } from "fflate";
import { decompress as unzstd } from "fzstd";
import type { SqlJsStatic, Database } from "sql.js";

export interface AnkiNoteType {
  id: string;
  name: string;
  fields: string[];
}

export interface AnkiNote {
  id: string;
  typeId: string;
  fields: string[];
  tags: string;
  deckId: string;
  /** Review history of the note's cards: the longest interval (days) and totals. */
  ivl: number;
  reps: number;
  lapses: number;
  /** Anki card type: 0 new, 1 learning, 2 review, 3 relearning (the most advanced card). */
  type: number;
}

export interface AnkiDeck {
  name: string;
  types: AnkiNoteType[];
  notes: AnkiNote[];
  decks: Record<string, string>;
}

const rows = (db: Database, sql: string): any[][] => {
  try {
    const r = db.exec(sql);
    return r.length ? r[0].values : [];
  } catch {
    return [];
  }
};

/** Parse an .apkg file. `SQL` is the initialised sql.js module (loaded by the caller). */
export function parseApkg(bytes: Uint8Array, SQL: SqlJsStatic): AnkiDeck {
  let files: Record<string, Uint8Array>;
  try {
    // Only the collection: decks often carry hundreds of MB of pictures and sounds we don't need.
    files = unzipSync(bytes, { filter: (f) => /^collection\.anki2/.test(f.name) });
  } catch {
    throw new Error("That file isn't an Anki deck (.apkg)");
  }
  let raw = files["collection.anki21b"];
  if (raw) raw = unzstd(raw);
  else raw = files["collection.anki21"] || files["collection.anki2"];
  if (!raw) throw new Error("No Anki collection found in this file");
  const db = new SQL.Database(raw);
  try {
    // Note types and decks: tables in the new format, JSON in the col table in the old one.
    const types: AnkiNoteType[] = [];
    const decks: Record<string, string> = {};
    const fieldRows = rows(db, "SELECT ntid, ord, name FROM fields ORDER BY ntid, ord");
    if (fieldRows.length) {
      const names = Object.fromEntries(rows(db, "SELECT id, name FROM notetypes").map(([id, name]) => [String(id), String(name)]));
      for (const [ntid, , name] of fieldRows) {
        const id = String(ntid);
        let t = types.find((x) => x.id === id);
        if (!t) types.push((t = { id, name: names[id] || "Note", fields: [] }));
        t.fields.push(String(name));
      }
      for (const [id, name] of rows(db, "SELECT id, name FROM decks")) decks[String(id)] = String(name).replace(/\x1f/g, "::");
    } else {
      const [models, deckJson] = rows(db, "SELECT models, decks FROM col")[0] || [];
      for (const [id, m] of Object.entries<any>(JSON.parse(String(models || "{}")))) {
        types.push({ id: String(id), name: m.name || "Note", fields: (m.flds || []).sort((a, b) => a.ord - b.ord).map((f) => f.name) });
      }
      for (const [id, d] of Object.entries<any>(JSON.parse(String(deckJson || "{}")))) decks[String(id)] = d.name;
    }

    // Cards: deck and review history per note.
    const byNote = new Map<string, { deckId: string; ivl: number; reps: number; lapses: number; type: number }>();
    for (const [nid, did, ivl, reps, lapses, type] of rows(db, "SELECT nid, did, ivl, reps, lapses, type FROM cards")) {
      const k = String(nid);
      const c = byNote.get(k) || { deckId: String(did), ivl: 0, reps: 0, lapses: 0, type: 0 };
      c.ivl = Math.max(c.ivl, Number(ivl) || 0);
      c.reps += Number(reps) || 0;
      c.lapses += Number(lapses) || 0;
      c.type = Math.max(c.type, Number(type) || 0);
      byNote.set(k, c);
    }
    const notes: AnkiNote[] = rows(db, "SELECT id, mid, flds, tags FROM notes ORDER BY id").map(([id, mid, flds, tags]) => {
      const c = byNote.get(String(id)) || { deckId: "", ivl: 0, reps: 0, lapses: 0, type: 0 };
      return { id: String(id), typeId: String(mid), fields: String(flds).split("\x1f"), tags: String(tags || "").trim(), ...c };
    });
    if (!notes.length) throw new Error("This deck has no notes");

    // The deck's name: the one most notes are in (without the parent "Default::" parts).
    const count: Record<string, number> = {};
    for (const n of notes) count[n.deckId] = (count[n.deckId] || 0) + 1;
    const main = Object.entries(count).sort((a, b) => b[1] - a[1])[0]?.[0];
    const name = (decks[main] || "Anki deck").split("::").pop().trim();
    return { name, types: types.filter((t) => notes.some((n) => n.typeId === t.id)), notes, decks };
  } finally {
    db.close();
  }
}

// ------------------------------------------------------------------ fields → word, reading, meaning

const ENTITIES: Record<string, string> = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " " };

/** A field as plain text: no HTML, no [sound:…], no cloze markup, one line. */
export function cleanField(html: string): string {
  return String(html || "")
    .replace(/\[sound:[^\]]*\]/g, "")
    .replace(/<br\s*\/?>|<\/(div|p|li)>/gi, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&(#x?[0-9a-f]+|\w+);/gi, (m, e) => {
      if (e[0] !== "#") return ENTITIES[e.toLowerCase()] ?? m;
      const n = e[1].toLowerCase() === "x" ? parseInt(e.slice(2), 16) : Number(e.slice(1));
      return Number.isInteger(n) && n > 0 && n <= 0x10ffff ? String.fromCodePoint(n) : m; // a broken entity stays as it is
    })
    .replace(/\{\{c\d+::(.*?)(::[^}]*)?\}\}/g, "$1")
    .split("\n")
    .map((l) => l.replace(/\s+/g, " ").trim())
    .filter(Boolean)[0] || "";
}

/** Anki furigana "日本語[にほんご]" → { text: "日本語", reading: "にほんご" }. */
export function splitFurigana(s: string): { text: string; reading: string } {
  if (!/\[[^\]]+\]/.test(s)) return { text: s, reading: "" };
  const text = s.replace(/ ?\[[^\]]*\]/g, "").replace(/\s+/g, "");
  // Each "kanji[reading]" becomes its reading; kana between them stays as it is.
  const reading = s.replace(/ ?([^\s[\]]*?)\[([^\]]+)\]/g, (_, base, r) => r).replace(/\s+/g, "");
  return { text, reading };
}

const CJK = /[㐀-鿿豈-﫿]/;
const KANA = /[぀-ヿ]/;
const TONE = /[āáǎàēéěèīíǐìōóǒòūúǔùǖǘǚǜ]|[a-z]+[1-5]\b/i;

export interface FieldRoles {
  word: number;
  reading: number;
  meaning: number;
}

/** Guess which field is the word, the reading and the meaning, by name first, then by content. */
export function guessRoles(type: AnkiNoteType, sample: AnkiNote[], course: string): FieldRoles {
  const names = type.fields.map((f) => f.toLowerCase());
  const find = (re: RegExp, not: number[] = []) => names.findIndex((n, i) => re.test(n) && !not.includes(i));
  const texts = type.fields.map((_, i) => sample.map((n) => cleanField(n.fields[i] || "")));
  const share = (i: number, re: RegExp) => texts[i].filter((t) => re.test(t)).length / Math.max(1, texts[i].length);

  let word = find(/^(front|word|expression|vocab|vocabulary|hanzi|simplified|kanji|term|target|slovene|slovenian|sl)$/);
  if (word < 0) word = find(/word|expression|hanzi|simplified|kanji|vocab|front|term/);
  if (word < 0 && course !== "sl") word = type.fields.findIndex((_, i) => share(i, CJK) > 0.5);
  if (word < 0) word = 0;

  let reading = find(/reading|pinyin|kana|furigana|pronunciation|romaji|transliteration/, [word]);
  if (reading < 0 && course === "zh") reading = type.fields.findIndex((_, i) => i !== word && share(i, TONE) > 0.5);
  if (reading < 0 && course === "ja") reading = type.fields.findIndex((_, i) => i !== word && share(i, KANA) > 0.5 && share(i, CJK) < 0.2);

  let meaning = find(/^(back|meaning|english|definition|translation|gloss|answer)$/, [word, reading]);
  if (meaning < 0) meaning = find(/meaning|english|definition|translation|gloss|back/, [word, reading]);
  if (meaning < 0) meaning = type.fields.findIndex((_, i) => i !== word && i !== reading && share(i, CJK) < 0.2 && share(i, /[a-z]/i) > 0.5);
  if (meaning < 0) meaning = type.fields.findIndex((_, i) => i !== word && i !== reading);
  return { word, reading, meaning };
}

/** One note → [word, reading, meaning] as plain text. */
export function noteToWord(note: AnkiNote, roles: FieldRoles): [string, string, string] {
  const raw = cleanField(note.fields[roles.word] || "");
  const { text, reading: furi } = splitFurigana(raw);
  const reading = roles.reading >= 0 ? splitFurigana(cleanField(note.fields[roles.reading] || "")).text : furi;
  // Meanings: the first few, separated by "; " (Anki decks often list many).
  const meaning = cleanField(note.fields[roles.meaning] || "").split(/\s*[;,/]\s*/).filter(Boolean).slice(0, 3).join("; ");
  return [text, reading || furi, meaning];
}
