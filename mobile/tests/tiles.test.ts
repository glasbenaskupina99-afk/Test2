// "Build the sentence": cutting sentences into tiles and checking the order.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { cutSl, cutCjk, extraTile, rightOrder, goodCut } from "../src/tiles.js";

const d = (p: string) => JSON.parse(readFileSync(new URL(`../../app/data/${p}`, import.meta.url), "utf8"));
const words = (files: string[]) => new Set(files.flatMap((f) => d(f).units.flatMap((u: any) => u.words.map((w: string[]) => w[0]))));

test("Slovenian: words at spaces, the first lower-cased unless it's a name, the full stop stays put", () => {
  assert.deepEqual(cutSl("V torek grem k zdravniku."), { tiles: ["v", "torek", "grem", "k", "zdravniku"], end: "." });
  assert.deepEqual(cutSl("Ana in Luka sta prijatelja.", new Set(["Ana", "Luka"])).tiles[0], "Ana");
  assert.equal(extraTile(["imam", "dva", "psa"], "sl"), "imaš", "a wrong ending of a word in the sentence");
  assert.ok(rightOrder(["v", "torek", "grem", "k", "zdravniku"], ["v", "torek", "grem", "k", "zdravniku"], "sl"));
  assert.ok(!rightOrder(["torek", "v", "grem", "k", "zdravniku"], ["v", "torek", "grem", "k", "zdravniku"], "sl"));
});

test("Chinese: cut at the course's words; dialogues aren't used", () => {
  const zh = words(["hsk1.json", "hsk2.json", "hsk3.json"]);
  assert.deepEqual(cutCjk("今天天气很好。", zh, "zh").tiles, ["今天", "天气", "很", "好"]);
  assert.ok(!goodCut(cutCjk("A：谢谢！B：不客气。", zh, "zh"), "zh"));
  assert.ok(!["我", "不", "喝", "茶"].includes(extraTile(["我", "不", "喝", "茶"], "zh", 2)), "the extra tile isn't one of the sentence's");
});

test("Japanese: particles and です apart, verb endings joined; cuts with a stray syllable aren't used", () => {
  const ja = words(["japanese_n5.json", "japanese_n4.json", "japanese_n3.json"]);
  assert.deepEqual(cutCjk("毎朝お茶を飲みます。", ja, "ja").tiles, ["毎朝", "お茶", "を", "飲みます"]);
  assert.deepEqual(cutCjk("あの大きい建物は病院です。", ja, "ja").tiles, ["あの", "大きい", "建物", "は", "病院", "です"]);
  assert.ok(goodCut(cutCjk("毎日学校へ行きます。", ja, "ja"), "ja"));
  assert.ok(!goodCut({ tiles: ["公園", "に", "いま", "す"], end: "。" }, "ja"));
});

test("enough good puzzles: most course examples make one", () => {
  const share = (lang: "zh" | "ja", file: string, lex: Set<string>) => {
    const x = d(file);
    const keys = Object.keys(x);
    return keys.filter((k) => goodCut(cutCjk(x[k].example_zh, lex, lang), lang)).length / keys.length;
  };
  assert.ok(share("zh", "extras/zh.json", words(["hsk1.json", "hsk2.json", "hsk3.json"])) > 0.6);
  assert.ok(share("ja", "extras/ja.json", words(["japanese_n5.json", "japanese_n4.json", "japanese_n3.json"])) > 0.4);
  const sl = d("extras/sl.json");
  assert.ok(Object.values<any>(sl).filter((x) => goodCut(cutSl(x.example_zh), "sl")).length / Object.keys(sl).length > 0.8);
});
