// Slovenian without the AI: grading typed sentences, spoken answers with digits, basic forms.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { compareSpelling, compareSpokenSl, gradeSentenceSl, lemmaSl } from "../src/slovenian.js";

const sentences: any[] = JSON.parse(readFileSync(new URL("../../app/data/slovenian_sentences.json", import.meta.url), "utf8"));
const grade = (en: string, answer: string) => {
  const row = sentences.find((r) => r[0] === en);
  assert.ok(row, en);
  return gradeSentenceSl(answer, row[1], row[3] || []);
};

test("a sentence is right for a woman and for a man", () => {
  assert.equal(grade("I am hungry.", "Lačna sem")?.correct, true);
  assert.equal(grade("I am hungry.", "Lačen sem.")?.score, 100);
  assert.equal(grade("I am thirsty.", "Žejen sem")?.correct, true);
  assert.equal(grade("Yesterday I was at home.", "Včeraj sem bila doma.")?.correct, true);
  assert.equal(grade("I like reading.", "rada berem")?.correct, true);
});

test("subject pronouns ('jaz', 'ti', 'mi', 'vi'), 'ali' and another word order are fine", () => {
  assert.equal(grade("I am from Slovenia.", "Jaz sem iz Slovenije")?.correct, true);
  assert.equal(grade("I am hungry.", "Jaz sem lačen")?.correct, true, "pronoun and order together");
  assert.equal(grade("Where do you live?", "Kje ti živiš?")?.correct, true);
  assert.equal(grade("Where do you live?", "Kje vi živite?")?.correct, true);
  assert.equal(grade("How are you?", "Kako si ti?")?.correct, true);
  assert.equal(grade("We are going to the seaside.", "Mi gremo na morje.")?.correct, true);
  assert.equal(grade("Can you help me?", "Ali lahko pomagaš?"), null, "'mi' (to me) is not a subject pronoun");
  assert.equal(grade("Do you speak English?", "Govoriš angleško?")?.correct, true);
  assert.equal(grade("Can I pay by card?", "Ali lahko plačam s kartico?")?.correct, true);
  const order = grade("My head hurts.", "Glava me boli");
  assert.equal(order?.correct, true);
  const swapped = grade("I have a brother and a sister.", "Imam sestro in brata");
  assert.equal(swapped?.correct, true);
  assert.ok(swapped!.score < 100, "another order is right, but the usual one is shown");
});

test("missing č š ž still counts; digits (including compound numbers) are read as words", () => {
  assert.equal(grade("I am hungry.", "lacen sem")?.score, 90);
  assert.equal(grade("It costs two euros.", "Stane 2 evra")?.correct, true);
  assert.equal(grade("It is eight o'clock.", "Ura je 8")?.correct, true);
  assert.equal(compareSpelling("2", "dva").result, "correct");
  assert.equal(compareSpelling("2", "dve").result, "correct");
  assert.equal(compareSpelling("25", "petindvajset").result, "correct");
  assert.equal(compareSpelling("21", "enaindvajset").result, "correct");
  assert.equal(compareSpokenSl("stane 25 evrov", "Stane petindvajset evrov.").score, 100);
});

test("a wrong sentence stays wrong, a near miss says so", () => {
  assert.equal(grade("I am hungry.", "Žejen sem"), null);
  assert.equal(grade("Mom is at home.", "Oče je doma"), null);
  assert.equal(grade("Where is the station?", ""), null);
  const near = grade("I live in Ljubljana.", "Živim v Ljubljana");
  assert.equal(near?.correct, false);
  assert.match(near!.feedback, /Almost/);
  // The dual needs its own forms: "dve" with a masculine noun is not accepted.
  assert.equal(grade("It costs two euros.", "Stane dve evra")?.correct ?? false, false);
});

test("every built-in sentence and each of its alternatives is accepted", () => {
  for (const [en, sl, , alts = []] of sentences) {
    for (const answer of [sl, ...alts]) assert.equal(gradeSentenceSl(answer, sl, alts)?.correct, true, `${en} → ${answer}`);
  }
});

test("speaking: the recogniser's digits and the other gender count", () => {
  assert.equal(compareSpokenSl("stane 2 evra", "Stane dva evra.").score, 100);
  assert.equal(compareSpokenSl("ura je 8", "Ura je osem.").score, 100);
  assert.equal(compareSpokenSl("lačna sem", "Lačen sem.", ["Lačna sem."]).score, 100);
  assert.ok(compareSpokenSl("dober", "Dober dan!").score < 100);
});

test("basic forms: kavo → kava, delam → delati", () => {
  const course = JSON.parse(readFileSync(new URL("../../app/data/slovenian_a1.json", import.meta.url), "utf8"));
  const lex = new Set<string>(course.units.flatMap((u: any) => u.words.map((w: any) => String(w[0]).toLowerCase())));
  const has = (w: string) => lex.has(w);
  const pairs: [string, string][] = [["kavo", "kava"], ["kavarni", "kavarna"], ["hiše", "hiša"], ["prijatelji", "prijatelj"], ["delam", "delati"], ["govorim", "govoriti"], ["mleka", "mleko"], ["lačna", "lačen"], ["je", "biti"], ["grem", "iti"], ["nimam", "imeti"], ["pije", "piti"]];
  for (const [form, lemma] of pairs) if (lex.has(lemma)) assert.equal(lemmaSl(form, has), lemma, form);
  assert.equal(lemmaSl("potem", has), "", "'potem' is not a form of 'pot'");
  // The ready-made stories name the basic form of every word: the guesser must agree with them.
  const stories = JSON.parse(readFileSync(new URL("../../app/data/stories/sl_a1.json", import.meta.url), "utf8")).stories;
  let n = 0, right = 0;
  const seen = new Set<string>();
  for (const st of stories) for (const s of st.sentences) for (const [t, lemma] of s.tokens) {
    const low = String(t).toLowerCase();
    if (!lemma || !lex.has(lemma) || lex.has(low) || seen.has(low)) continue;
    seen.add(low);
    n++;
    if (lemmaSl(low, has) === lemma) right++;
  }
  assert.ok(n > 50 && right / n > 0.95, `${right} of ${n} forms in the stories found`);
});

test("bundled Slovenian neural audio covers every course word and sentence", () => {
  const index = JSON.parse(readFileSync(new URL("../../app/data/audio/sl.json", import.meta.url), "utf8"));
  const bin = readFileSync(new URL("../../app/data/audio/sl.bin", import.meta.url));
  const course = JSON.parse(readFileSync(new URL("../../app/data/slovenian_a1.json", import.meta.url), "utf8"));
  for (const u of course.units) {
    for (const [w] of u.words) {
      const slice = index[String(w).toLowerCase().trim()];
      assert.ok(slice, `audio for word: ${w}`);
      const [off, len] = slice;
      assert.ok(len > 500 && off + len <= bin.length, `valid MP3 slice for ${w}`);
    }
  }
  for (const [, sl, , alts = []] of sentences) {
    for (const s of [sl, ...alts]) {
      const k = String(s).toLowerCase().replace(/\s+/g, " ").trim();
      assert.ok(index[k], `audio for sentence: ${s}`);
    }
  }
  // East neural packs (Chinese HSK 1 + Japanese Kana/N5)
  for (const [code, file] of [["zh", "hsk1.json"], ["ja", "japanese_n5.json"]] as const) {
    const idx = JSON.parse(readFileSync(new URL(`../../app/data/audio/${code}.json`, import.meta.url), "utf8"));
    const b = readFileSync(new URL(`../../app/data/audio/${code}.bin`, import.meta.url));
    const data = JSON.parse(readFileSync(new URL(`../../app/data/${file}`, import.meta.url), "utf8"));
    for (const u of data.units) {
      for (const [hz, py] of u.words) {
        const slice = idx[String(hz).toLowerCase().trim()] || idx[String(py).toLowerCase().trim()];
        assert.ok(slice, `${code} audio for ${hz}`);
        assert.ok(slice[1] > 500 && slice[0] + slice[1] <= b.length);
      }
    }
  }
});
