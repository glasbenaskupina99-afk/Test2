import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { EXAMS, makePaper, scorePaper } from "../src/exams.js";

const data = (p: string) => JSON.parse(readFileSync(new URL(`../../app/data/${p}`, import.meta.url), "utf8"));
const LEVELS: Record<string, [string, string, string]> = {
  "HSK 1": ["hsk1.json", "zh", "hsk1"],
  "HSK 3": ["hsk3.json", "zh", "hsk3"],
  "JLPT N5": ["japanese_n5.json", "ja", "n5"],
  "JLPT N3": ["japanese_n3.json", "ja", "n3"],
};

function source(level: string) {
  const [file, lang, grammar] = LEVELS[level];
  const words = data(file).units.flatMap((u: any) => u.words.map(([hanzi, pinyin, english]: string[], i: number) => ({ id: i + 1, hanzi, pinyin, english })));
  const extras = data(`extras/${lang}.json`);
  const examples = words.filter((w: any) => extras[w.hanzi]?.example_zh).map((w: any) => ({ text: extras[w.hanzi].example_zh, reading: extras[w.hanzi].example_pinyin || "", en: extras[w.hanzi].example_en, word: w }));
  return { words, examples, grammar: data(`grammar/${grammar}.json`).points };
}

for (const level of Object.keys(LEVELS)) {
  test(`${level}: the mock exam has the real exam's parts, counts and time`, () => {
    const paper = makePaper(level, source(level));
    const spec = (EXAMS as any)[level];
    assert.equal(paper.sections.length, spec.sections.length);
    paper.sections.forEach((s: any, i: number) => {
      const want = spec.sections[i];
      const count = [...want.parts, ...(want.reading || [])].reduce((a: number, [, n]: [string, number]) => a + n, 0);
      assert.equal(s.questions.length, count, `${s.title}: question count`);
      assert.equal(s.minutes, want.minutes);
      for (const q of s.questions) {
        assert.ok(q.options.length >= 2 && q.answer >= 0 && q.answer < q.options.length, `${q.type} has a valid answer`);
        assert.equal(new Set(q.options).size, q.options.length, `${q.type}: options are all different`);
      }
    });
    const perfect = scorePaper(paper, paper.sections.map((s: any) => s.questions.map((q: any) => q.answer)));
    assert.equal(perfect.total, perfect.max);
    assert.ok(perfect.passed);
    const blank = scorePaper(paper, paper.sections.map((s: any) => s.questions.map(() => null)));
    assert.equal(blank.total, 0);
    assert.equal(blank.passed, false);
  });
}

test("JLPT: enough points in total but one part under its minimum is a fail", () => {
  const paper = makePaper("JLPT N5", source("JLPT N5"));
  const answers = paper.sections.map((s: any) => s.questions.map((q: any) => (s.id === "listening" ? null : q.answer)));
  const r = scorePaper(paper, answers);
  assert.ok(r.total >= r.pass, "the knowledge parts alone reach the pass mark");
  assert.equal(r.passed, false);
});

test("a short mock has about a third of the questions", () => {
  const full = makePaper("HSK 1", source("HSK 1"));
  const short = makePaper("HSK 1", source("HSK 1"), { short: true });
  const n = (p: any) => p.sections.reduce((a: number, s: any) => a + s.questions.length, 0);
  assert.ok(n(short) < n(full) / 2 && n(short) >= n(full) / 4);
});
