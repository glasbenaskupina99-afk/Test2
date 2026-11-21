import { test } from "node:test";
import assert from "node:assert/strict";
import { next, scheduleDays, retrievability, intervalFor, fromSm2 } from "../src/fsrs.js";

test("a first review starts from the rating's stability", () => {
  const again = next({}, 1, 0);
  const good = next({}, 3, 0);
  const easy = next({}, 4, 0);
  assert.ok(again.stability < good.stability && good.stability < easy.stability);
  assert.ok(again.difficulty > good.difficulty, "a forgotten card is harder");
});

test("remembering again and again makes the intervals grow", () => {
  let card: any = {};
  let last = 0;
  for (let i = 0; i < 6; i++) {
    card = next(card, 3, last);
    const days = intervalFor(card.stability);
    assert.ok(days > last, `interval ${days} should grow past ${last}`);
    last = days;
  }
  assert.ok(last > 30, "after six good reviews the gap is over a month");
});

test("forgetting shrinks stability; Again never schedules into the future", () => {
  const strong = { stability: 40, difficulty: 5 };
  const lapse = next(strong, 1, 40);
  assert.ok(lapse.stability < strong.stability);
  assert.ok(scheduleDays(10, 3) >= 1 && scheduleDays(10_000, 3) <= 365 * 1.05);
});

test("retrievability is 90% after exactly one stability", () => {
  assert.ok(Math.abs(retrievability(intervalFor(10), 10) - 0.9) < 1e-9);
  assert.equal(fromSm2({ interval: 12, ease: 2.5 }).stability, 12);
});

test("a card without a difficulty (old backup, import) is still scheduled", () => {
  for (const rating of [1, 2, 3, 4] as const) {
    const r = next({ stability: 6 } as any, rating, 5);
    assert.ok(Number.isFinite(r.stability) && Number.isFinite(r.difficulty), `rating ${rating}: ${JSON.stringify(r)}`);
  }
});
