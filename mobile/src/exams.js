// Mock exams in the shape of the real HSK and JLPT: the same sections, number of questions,
// time limits, score scales and pass marks, with questions built from the level's own words,
// example sentences and grammar. A "short" mock keeps the proportions at about a third.
//
// Formats (official, as published by Chinese Testing International / the JLPT):
// HSK 1: listening 20 q (~15 min) + reading 20 q (17 min); 200 points, pass 120.
// HSK 2: listening 35 q (~25 min) + reading 25 q (22 min); 200 points, pass 120.
// HSK 3: listening 40 q (~35 min) + reading 30 q (30 min) + writing 10 q (15 min); 300 points, pass 180.
// JLPT N5: vocabulary 20 min, grammar & reading 40 min, listening 30 min; language knowledge &
//   reading 0–120 (min 38), listening 0–60 (min 19); pass 80 of 180.
// JLPT N4: 25 / 55 / 35 min; same scales and minimums; pass 90 of 180.
// JLPT N3: 30 / 70 / 40 min; language knowledge 0–60, reading 0–60, listening 0–60 (min 19 each); pass 95 of 180.

/** parts: [type, count]; score: the section's points; group: which scored section it counts towards. */
export const EXAMS = {
  "HSK 1": {
    name: "HSK 1", total: 200, pass: 120, lang: "zh",
    sections: [
      { id: "listening", title: "Listening", minutes: 15, score: 100, parts: [["listen_word_tf", 5], ["listen_word", 5], ["listen_sent", 5], ["listen_sent", 5]] },
      { id: "reading", title: "Reading", minutes: 17, score: 100, parts: [["read_word_tf", 5], ["read_word", 5], ["cloze_word", 5], ["cloze_grammar", 5]] },
    ],
  },
  "HSK 2": {
    name: "HSK 2", total: 200, pass: 120, lang: "zh",
    sections: [
      { id: "listening", title: "Listening", minutes: 25, score: 100, parts: [["listen_word_tf", 10], ["listen_word", 10], ["listen_sent", 15]] },
      { id: "reading", title: "Reading", minutes: 22, score: 100, parts: [["read_word", 5], ["cloze_word", 10], ["read_sent", 5], ["cloze_grammar", 5]] },
    ],
  },
  "HSK 3": {
    name: "HSK 3", total: 300, pass: 180, lang: "zh",
    sections: [
      { id: "listening", title: "Listening", minutes: 35, score: 100, parts: [["listen_word", 10], ["listen_sent", 30]] },
      { id: "reading", title: "Reading", minutes: 30, score: 100, parts: [["cloze_word", 10], ["cloze_grammar", 10], ["read_sent", 10]] },
      { id: "writing", title: "Writing", minutes: 15, score: 100, parts: [["pinyin_char", 10]] },
    ],
  },
  "JLPT N5": {
    name: "JLPT N5", total: 180, pass: 80, lang: "ja",
    sections: [
      { id: "vocabulary", title: "Vocabulary (文字・語彙)", minutes: 20, group: "knowledge", parts: [["kanji_reading", 7], ["orthography", 5], ["cloze_word", 6], ["read_word", 3]] },
      { id: "grammar", title: "Grammar & reading (文法・読解)", minutes: 40, group: "knowledge", parts: [["cloze_grammar", 13], ["read_sent", 9]] },
      { id: "listening", title: "Listening (聴解)", minutes: 30, group: "listening", parts: [["listen_word", 12], ["listen_sent", 12]] },
    ],
    groups: { knowledge: { title: "Language knowledge & reading", score: 120, min: 38 }, listening: { title: "Listening", score: 60, min: 19 } },
  },
  "JLPT N4": {
    name: "JLPT N4", total: 180, pass: 90, lang: "ja",
    sections: [
      { id: "vocabulary", title: "Vocabulary (文字・語彙)", minutes: 25, group: "knowledge", parts: [["kanji_reading", 7], ["orthography", 5], ["cloze_word", 8], ["read_word", 5]] },
      { id: "grammar", title: "Grammar & reading (文法・読解)", minutes: 55, group: "knowledge", parts: [["cloze_grammar", 15], ["read_sent", 12]] },
      { id: "listening", title: "Listening (聴解)", minutes: 35, group: "listening", parts: [["listen_word", 14], ["listen_sent", 14]] },
    ],
    groups: { knowledge: { title: "Language knowledge & reading", score: 120, min: 38 }, listening: { title: "Listening", score: 60, min: 19 } },
  },
  "JLPT N3": {
    name: "JLPT N3", total: 180, pass: 95, lang: "ja",
    sections: [
      { id: "vocabulary", title: "Vocabulary (文字・語彙)", minutes: 30, group: "knowledge", parts: [["kanji_reading", 8], ["orthography", 6], ["cloze_word", 11], ["read_word", 10]] },
      { id: "grammar", title: "Grammar & reading (文法・読解)", minutes: 70, group: "knowledge", parts: [["cloze_grammar", 18]], reading: [["read_sent", 16]] },
      { id: "listening", title: "Listening (聴解)", minutes: 40, group: "listening", parts: [["listen_word", 13], ["listen_sent", 15]] },
    ],
    groups: { knowledge: { title: "Language knowledge", score: 60, min: 19 }, reading: { title: "Reading", score: 60, min: 19 }, listening: { title: "Listening", score: 60, min: 19 } },
  },
};

const shuffle = (a) => a.map((x) => [Math.random(), x]).sort((p, q) => p[0] - q[0]).map((x) => x[1]);
const sample = (a, n) => shuffle(a).slice(0, n);
const HAN = /[㐀-鿿]/;
const firstMeaning = (s) => String(s || "").split(/[;,(]/)[0].trim();

/** Options: the answer plus distractors, shuffled; returns [options, index of the answer]. */
function withDistractors(answer, pool, n, key = (x) => x) {
  const seen = new Set([key(answer)]);
  const out = [answer];
  for (const x of shuffle(pool)) {
    if (out.length >= n) break;
    const k = key(x);
    if (!k || seen.has(k)) continue;
    seen.add(k);
    out.push(x);
  }
  const opts = shuffle(out);
  return [opts, opts.indexOf(answer)];
}

/**
 * Builds a paper. src = { words: [{hanzi, pinyin, english}], examples: [{text, reading, en, word}],
 * grammar: [{id, examples:[{text, reading, en, mark}], short}] } for the exam's level.
 */
export function makePaper(level, src, { short = false } = {}) {
  const spec = EXAMS[level];
  if (!spec) throw new Error("No mock exam for this level");
  const nOpt = spec.lang === "ja" ? 4 : 3;
  const k = short ? 1 / 3 : 1;
  const words = src.words.filter((w) => w.hanzi && w.english);
  const meanings = words.map((w) => firstMeaning(w.english));
  const examples = src.examples.filter((e) => e.text && e.en && e.text.length <= 40);
  const gExamples = src.grammar.flatMap((p) => p.examples.filter((e) => e.mark?.length && e.text.includes(e.mark[0])).map((e) => ({ ...e, point: p.id })));
  const marks = [...new Set(gExamples.map((e) => e.mark[0]))];
  const kanjiWords = words.filter((w) => HAN.test(w.hanzi) && w.pinyin && w.pinyin !== w.hanzi);
  const used = new Set();
  const take = (arr, key) => {
    const fresh = arr.filter((x) => !used.has(key(x)));
    const x = (fresh.length ? fresh : arr)[Math.floor(Math.random() * (fresh.length || arr.length))];
    if (x) used.add(key(x));
    return x;
  };

  const make = {
    listen_word_tf() {
      const w = take(words, (x) => "w" + x.hanzi);
      const right = Math.random() < 0.5;
      const shown = right ? firstMeaning(w.english) : firstMeaning(take(words.filter((x) => firstMeaning(x.english) !== firstMeaning(w.english)), (x) => "d" + x.hanzi).english);
      return { type: "listen_word_tf", audio: w.hanzi, reading: w.pinyin, prompt: shown, options: ["True", "False"], answer: right ? 0 : 1, solution: `${w.hanzi} · ${w.pinyin} · ${w.english}` };
    },
    read_word_tf() {
      const q = make.listen_word_tf();
      return { ...q, type: "read_word_tf", text: q.audio, audio: null };
    },
    listen_word() {
      const w = take(words, (x) => "w" + x.hanzi);
      const [options, answer] = withDistractors(firstMeaning(w.english), meanings, nOpt);
      return { type: "listen_word", audio: w.hanzi, reading: w.pinyin, options, answer, solution: `${w.hanzi} · ${w.pinyin} · ${w.english}` };
    },
    read_word() {
      const q = make.listen_word();
      return { ...q, type: "read_word", text: q.audio, audio: null };
    },
    listen_sent() {
      const e = take(examples, (x) => "e" + x.text);
      const [options, answer] = withDistractors(e.en, examples.map((x) => x.en), nOpt);
      return { type: "listen_sent", audio: e.text, reading: e.reading, options, answer, solution: `${e.text} · ${e.en}` };
    },
    read_sent() {
      const q = make.listen_sent();
      return { ...q, type: "read_sent", text: q.audio, audio: null };
    },
    cloze_word() {
      const cands = examples.filter((e) => e.word && e.text.includes(e.word.hanzi));
      const e = take(cands, (x) => "c" + x.text);
      if (!e) return make.read_word();
      const w = e.word;
      const same = words.filter((x) => [...x.hanzi].length === [...w.hanzi].length);
      const [options, answer] = withDistractors(w.hanzi, (same.length > 5 ? same : words).map((x) => x.hanzi), nOpt);
      return { type: "cloze_word", text: e.text.replace(w.hanzi, "＿＿"), hint: e.en, options, answer, solution: `${e.text} · ${e.en}` };
    },
    cloze_grammar() {
      const e = take(gExamples, (x) => "g" + x.text);
      if (!e) return make.cloze_word();
      const m = e.mark[0];
      const [options, answer] = withDistractors(m, marks, nOpt);
      return { type: "cloze_grammar", text: e.text.replace(m, "＿＿"), hint: e.en, options, answer, solution: `${e.text} · ${e.en}`, point: e.point };
    },
    kanji_reading() {
      const w = take(kanjiWords, (x) => "k" + x.hanzi);
      if (!w) return make.read_word();
      const [options, answer] = withDistractors(w.pinyin, kanjiWords.map((x) => x.pinyin), 4);
      return { type: "kanji_reading", text: w.hanzi, options, answer, solution: `${w.hanzi} · ${w.pinyin} · ${w.english}` };
    },
    orthography() {
      const w = take(kanjiWords, (x) => "o" + x.hanzi);
      if (!w) return make.read_word();
      const same = kanjiWords.filter((x) => [...x.hanzi].length === [...w.hanzi].length);
      const [options, answer] = withDistractors(w.hanzi, (same.length > 5 ? same : kanjiWords).map((x) => x.hanzi), 4);
      return { type: "orthography", text: w.pinyin, hint: firstMeaning(w.english), options, answer, solution: `${w.pinyin} → ${w.hanzi} · ${w.english}` };
    },
    pinyin_char() {
      const cands = examples.filter((e) => e.word && e.text.includes(e.word.hanzi) && e.word.pinyin);
      const e = take(cands, (x) => "p" + x.text);
      if (!e) return make.read_word();
      const w = e.word;
      const same = words.filter((x) => [...x.hanzi].length === [...w.hanzi].length);
      const [options, answer] = withDistractors(w.hanzi, (same.length > 5 ? same : words).map((x) => x.hanzi), 4);
      return { type: "pinyin_char", text: e.text.replace(w.hanzi, `（${w.pinyin}）`), hint: e.en, options, answer, solution: `${e.text} · ${e.en}` };
    },
  };

  const sections = spec.sections.map((s) => {
    const parts = [...s.parts, ...(s.reading || [])];
    const questions = [];
    for (const [type, count] of parts) {
      const n = Math.max(1, Math.round(count * k));
      for (let i = 0; i < n; i++) {
        const q = make[type]();
        if (q) questions.push({ ...q, group: (s.reading || []).some(([t]) => t === type) ? "reading" : s.group || s.id });
      }
    }
    return { id: s.id, title: s.title, minutes: Math.max(3, Math.round(s.minutes * k)), score: s.score || null, questions };
  });
  return { level, name: spec.name, short, total: spec.total, pass: spec.pass, groups: spec.groups || null, sections };
}

/** Scores a finished paper: answers[sectionIndex][questionIndex] = chosen option (or null). */
export function scorePaper(paper, answers) {
  const spec = EXAMS[paper.level];
  const right = {};
  const count = {};
  paper.sections.forEach((s, si) => {
    s.questions.forEach((q, qi) => {
      const g = spec.groups ? q.group : s.id;
      count[g] = (count[g] || 0) + 1;
      if (answers?.[si]?.[qi] === q.answer) right[g] = (right[g] || 0) + 1;
    });
  });
  const parts = spec.groups
    ? Object.entries(spec.groups).map(([id, g]) => ({ id, title: g.title, max: g.score, min: g.min, score: Math.round(((right[id] || 0) / Math.max(count[id] || 1, 1)) * g.score) }))
    : spec.sections.map((s) => ({ id: s.id, title: s.title, max: s.score, min: null, score: Math.round(((right[s.id] || 0) / Math.max(count[s.id] || 1, 1)) * s.score) }));
  const total = parts.reduce((a, p) => a + p.score, 0);
  const sectionsOk = parts.every((p) => p.min == null || p.score >= p.min);
  return { total, max: spec.total, pass: spec.pass, passed: total >= spec.pass && sectionsOk, sectionsOk, parts };
}
