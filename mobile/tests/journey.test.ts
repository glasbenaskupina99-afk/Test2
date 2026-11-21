// The journey: every level of every course planned into chapters and stones.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { buildPlan, groupChapters, wordsNeeded, grammarUnlocks, STONE_WORDS } from "../src/journey.js";

const data = (p: string) => JSON.parse(readFileSync(new URL(`../../app/data/${p}`, import.meta.url), "utf8"));
const LEVELS: [string, string, string | null, string | null, string[]][] = [
  // section, course file, grammar, stories, earlier levels of the same course
  ["A1", "slovenian_a1.json", "sl_a1", "sl_a1", []],
  ["HSK 1", "hsk1.json", "hsk1", "hsk1", []],
  ["HSK 2", "hsk2.json", "hsk2", "hsk2", ["hsk1.json"]],
  ["HSK 3", "hsk3.json", "hsk3", "hsk3", ["hsk1.json", "hsk2.json"]],
  ["Kana", "japanese_kana.json", null, null, []],
  ["JLPT N5", "japanese_n5.json", "n5", "n5", ["japanese_kana.json"]],
  ["JLPT N4", "japanese_n4.json", "n4", "n4", ["japanese_kana.json", "japanese_n5.json"]],
  ["JLPT N3", "japanese_n3.json", "n3", "n3", ["japanese_kana.json", "japanese_n5.json", "japanese_n4.json"]],
];

function plan([section, file, grammar, stories, before]: (typeof LEVELS)[number]) {
  let id = 1;
  const words = data(file).units.flatMap((u: any) => u.words.map((w: string[]) => ({ id: id++, unit: u.name, hanzi: w[0] })));
  const earlier = new Set(before.flatMap((f) => data(f).units.flatMap((u: any) => u.words.map((w: string[]) => w[0]))));
  const place = new Map(words.map((w: any, i: number) => [w.hanzi.toLowerCase(), i + 1]));
  // As the backend does: names, and in Slovenian the little words and biti, don't count.
  const glue = new Set(words.filter((w: any) => ["Little words", "Question words"].includes(w.unit) || w.hanzi === "biti").map((w: any) => w.hanzi.toLowerCase()));
  const sl = section === "A1";
  const at = ([t, lemma, gloss]: string[]) => {
    const key = [String(lemma || "").toLowerCase(), t.toLowerCase()].find((k) => k && place.has(k));
    if (key) return sl && glue.has(key) ? 0 : place.get(key);
    if (earlier.has(t)) return 0;
    return /\(name\)/.test(gloss || "") || (sl && /^\p{Lu}/u.test(t)) ? 0 : Infinity;
  };
  const points = grammar ? data(`grammar/${grammar}.json`).points : [];
  const st = stories
    ? data(`stories/${stories}.json`).stories.map((s: any) => ({
        id: s.id, title: s.title, title_en: s.title_en, chapter: s.chapter,
        need: wordsNeeded(s.sentences.flatMap((x: any) => x.tokens).filter(([t]: string[]) => /\p{L}/u.test(t)).map(at)),
      }))
    : [];
  return { words, points, stories: st, plan: buildPlan({ section, words, points, stories: st }) };
}

for (const level of LEVELS) {
  test(`journey ${level[0]}: every word once, chapters of a sensible size, grammar and stories on the path`, () => {
    const { words, points, stories, plan: p } = plan(level);
    const stones = p.chapters.flatMap((c) => c.stones);
    const wordIds = stones.filter((s) => s.kind === "words").flatMap((s) => s.ids);
    assert.deepEqual(wordIds, words.map((w: any) => w.id), "every word on exactly one stone, in course order");
    assert.ok(stones.filter((s) => s.kind === "words").every((s) => s.ids.length >= 1 && s.ids.length <= STONE_WORDS));
    assert.equal(new Set(stones.map((s) => s.id)).size, stones.length, "stone ids are unique");
    if (level[0] === "Kana") assert.equal(p.chapters.length, 4, "hiragana, hiragana dakuten, katakana, katakana dakuten");
    else for (const c of p.chapters) assert.ok(c.ids.length >= 30 && c.ids.length <= 200, `${level[0]} chapter ${c.n + 1}: ${c.ids.length} words`);
    // Grammar: every lesson once, in order, never before the words that unlock it.
    const g = stones.filter((s) => s.kind === "grammar");
    assert.equal(g.length, Math.ceil(points.length / 3));
    assert.deepEqual(g.map((s) => s.lesson), g.map((_, i) => i));
    const unlocks = grammarUnlocks(words.length, points.length);
    let met = 0;
    for (const s of stones) {
      if (s.kind === "words") met += s.ids.length;
      if (s.kind === "grammar") assert.ok(met >= Math.min(unlocks[s.lesson], words.length), `grammar lesson ${s.lesson + 1} after ${met} words`);
    }
    // Every chapter but kana ends with its gate.
    for (const c of p.chapters) assert.equal(c.stones[c.stones.length - 1].kind === "gate", level[0] !== "Kana", `chapter ${c.n + 1} ends with a gate`);
    // Stories: each one on the path once.
    assert.deepEqual(stones.filter((s) => s.kind === "story").map((s) => s.story).sort(), stories.map((s: any) => s.id).sort());
  });
}

test("chapters: about 60 words each, a short tail joins the one before", () => {
  const u = (name: string, n: number, from: number) => ({ name, ids: Array.from({ length: n }, (_, i) => from + i) });
  const ch = groupChapters([u("a", 25, 0), u("b", 29, 100), u("c", 21, 200), u("d", 29, 300), u("e", 31, 400), u("f", 10, 500)]);
  assert.deepEqual(ch.map((c) => c.units), [["a", "b", "c"], ["d", "e", "f"]]);
});

test("a story waits until 85 % of its words are known", () => {
  assert.equal(wordsNeeded([0, 0, 3, 5, 9, 12, 20, 21, 40, 41]), 40);
  assert.equal(wordsNeeded([1, 2, 3, Infinity]), Infinity);
  assert.equal(wordsNeeded([]), 0);
});

test("the Slovenian path: 8 chapters, each with a story its readers can already read", () => {
  const { plan: p, stories } = plan(LEVELS[0]);
  assert.equal(p.chapters.length, 8);
  assert.equal(p.chapters[0].stones[0].kind, "words", "the path starts with new words");
  let met = 0;
  for (const c of p.chapters) {
    met += c.ids.length;
    const here = c.stones.filter((s) => s.kind === "story");
    assert.ok(here.length >= 1, `chapter ${c.n + 1} has a story`);
    for (const s of here) {
      const st = stories.find((x: any) => x.id === s.story);
      if (st.chapter != null) {
        assert.equal(st.chapter, c.n, `${st.id} is read in its own chapter`);
        assert.ok(st.need <= met, `${st.id}: 85 % of its words are known by the end of chapter ${c.n + 1} (${st.need} ≤ ${met})`);
      }
    }
    assert.equal(c.stones.at(-1).kind, "gate", "the story comes before the gate");
  }
});
