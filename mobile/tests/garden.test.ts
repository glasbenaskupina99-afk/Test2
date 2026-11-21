// 2.1: every word becomes a real plant; friends see a compact picture of your garden.
import { test } from "node:test";
import assert from "node:assert/strict";
import { SPECIES, plantFor, hashOf } from "../../app/static/js/plants.js";
import { encodeBed, decodeBed, cleanFriendCode, newFriendCode } from "../src/friends.js";

test("a word always grows into the same plant, and a garden has many different ones", () => {
  assert.equal(plantFor("zh", "茶").key, plantFor("zh", "茶").key);
  assert.equal(hashOf("abc"), hashOf("abc"));
  const words = ["好", "茶", "书", "猫", "狗", "水", "火", "山", "人", "大", "小", "中", "国", "学", "生", "你", "我", "他", "们", "是"];
  const kinds = new Set(words.map((w) => plantFor("zh", w).key));
  assert.ok(kinds.size >= 10, `20 words give ${kinds.size} species`);
  assert.equal(new Set(SPECIES.map((s) => s.key)).size, SPECIES.length, "species keys are unique");
  assert.ok(SPECIES.length <= 36, "species fit one base-36 character");
  for (const s of SPECIES) assert.ok(s.name && s.latin && s.svg.includes("<"), `${s.key} has a name and a drawing`);
});

test("a bed travels to friends as two characters a spot, and comes back the same", () => {
  const spots = [
    { health: "healthy", size: 3, t: "茶" },
    { health: "thirsty", size: 1, t: "书" },
    { health: "wilting", size: 0, t: "猫" },
    { health: "gone" },
    { health: "empty" },
  ];
  const s = encodeBed(spots, "zh");
  assert.equal(s.length, spots.length * 2);
  assert.ok(!s.includes("茶"), "the words themselves aren't shared");
  const back = decodeBed(s);
  assert.deepEqual(back.map((p) => p.health), ["healthy", "thirsty", "wilting", "gone", "empty"]);
  assert.equal(back[0].plant, plantFor("zh", "茶").key);
  assert.deepEqual([back[0].size, back[1].size, back[2].size], [3, 1, 0]);
});

test("friend codes: made, cleaned, typos refused", () => {
  const c = newFriendCode();
  assert.match(c, /^[2-9A-HJ-NP-Z]{4}-[2-9A-HJ-NP-Z]{4}$/);
  assert.equal(cleanFriendCode(c.toLowerCase().replace("-", " ")), c);
  assert.equal(cleanFriendCode("ABC"), "");
});
