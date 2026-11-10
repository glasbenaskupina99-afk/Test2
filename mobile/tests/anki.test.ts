import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import initSqlJs from "sql.js";
import { cleanField, guessRoles, noteToWord, parseApkg, splitFurigana } from "../src/anki.js";

const SQL = await initSqlJs();
const fixture = (name: string) => new Uint8Array(readFileSync(new URL(`./fixtures/${name}`, import.meta.url)));

test("old-format deck (.anki2): note type, deck name, fields and review history", () => {
  const deck = parseApkg(fixture("chinese-legacy.apkg"), SQL);
  assert.equal(deck.name, "HSK Extra");
  assert.deepEqual(deck.types[0].fields, ["Hanzi", "Pinyin", "English", "Audio"]);
  assert.equal(deck.notes.length, 4);
  const roles = guessRoles(deck.types[0], deck.notes, "zh");
  assert.deepEqual(roles, { word: 0, reading: 1, meaning: 2 });
  assert.deepEqual(noteToWord(deck.notes[0], roles), ["熊猫", "xióng māo", "panda"]);
  assert.deepEqual(noteToWord(deck.notes[1], roles), ["电脑", "diàn nǎo", "computer; PC"]);
  assert.equal(deck.notes[0].ivl, 40);
  assert.equal(deck.notes[0].lapses, 1);
  assert.equal(deck.notes[2].type, 0, "a new card stays new");
});

test("new-format deck (.anki21b, zstd): furigana gives the reading", () => {
  const deck = parseApkg(fixture("japanese-modern.apkg"), SQL);
  assert.equal(deck.name, "Core");
  const roles = guessRoles(deck.types[0], deck.notes, "ja");
  assert.equal(roles.word, 0);
  assert.equal(roles.meaning, 1);
  assert.deepEqual(noteToWord(deck.notes[0], roles), ["日本語", "にほんご", "Japanese (language)"]);
  assert.deepEqual(noteToWord(deck.notes[1], roles), ["食べる", "たべる", "to eat"]);
});

test("fields are cleaned of HTML, sounds, entities and cloze markup", () => {
  assert.equal(cleanField("<b>熊猫</b> [sound:a.mp3]"), "熊猫");
  assert.equal(cleanField("火车<br>huǒchē"), "火车");
  assert.equal(cleanField("giraffe&nbsp;&amp; co"), "giraffe & co");
  assert.equal(cleanField("{{c1::猫::cat}} 咪"), "猫 咪");
  assert.deepEqual(splitFurigana("食[た]べる"), { text: "食べる", reading: "たべる" });
  assert.deepEqual(splitFurigana("猫"), { text: "猫", reading: "" });
});

test("something that isn't a deck is refused", () => {
  assert.throws(() => parseApkg(new Uint8Array([1, 2, 3]), SQL), /isn't an Anki deck/);
});
