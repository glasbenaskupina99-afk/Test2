// Japanese helpers: kana normalisation, reading checks and spoken-answer scoring.
import { toHiragana, isRomaji } from "wanakana";

const KANJI_RE = /[㐀-鿿豈-﫿々]/;
const WRITABLE_RE = /[㐀-鿿豈-﫿々ぁ-ゖァ-ヺー]/g;

export const isKanji = (c) => KANJI_RE.test(c);

/** Characters you'd write by hand: kanji and kana, without punctuation. */
export const writable = (text) => ((text || "").match(WRITABLE_RE) || []).join("");

/** Hiragana with spaces/punctuation removed. Particles は/へ/を are folded to how they sound. */
export function normKana(text) {
  let t = (text || "").trim().toLowerCase();
  if (isRomaji(t.replace(/[\s.,!?'-]/g, "")) || /[a-z]/.test(t)) t = toHiragana(t.replace(/\s+/g, " "), { passRomaji: false });
  t = toHiragana(t); // katakana → hiragana
  return t.replace(/[^ぁ-ゖ㐀-鿿々ー]/g, "").replace(/は/g, "わ").replace(/へ/g, "え").replace(/を/g, "お");
}

export function compareReading(answer, reading) {
  return { result: normKana(answer) && normKana(answer) === normKana(reading) ? "correct" : "wrong" };
}

function lcs(a, b) {
  const dp = Array.from({ length: a.length + 1 }, () => new Array(b.length + 1).fill(0));
  for (let i = a.length - 1; i >= 0; i--)
    for (let j = b.length - 1; j >= 0; j--) dp[i][j] = a[i] === b[j] ? dp[i + 1][j + 1] + 1 : Math.max(dp[i + 1][j], dp[i][j + 1]);
  // which positions of a are matched
  const hit = new Array(a.length).fill(false);
  let i = 0;
  let j = 0;
  while (i < a.length && j < b.length) {
    if (a[i] === b[j]) { hit[i] = true; i++; j++; }
    else if (dp[i + 1][j] >= dp[i][j + 1]) i++;
    else j++;
  }
  return hit;
}

/**
 * Score what the recogniser heard against the target (written form and reading).
 * The recogniser may return kanji, kana or a mix, so both forms are tried.
 */
export function compareSpokenJa(heard, text, reading) {
  const h = normKana(writable(heard) || heard);
  const tries = [writable(text), reading].filter(Boolean).map((t) => {
    const target = [...normKana(t)];
    const hit = lcs(target, [...h]);
    return { target, hit, score: Math.round((100 * hit.filter(Boolean).length) / Math.max(target.length, 1)) };
  });
  tries.sort((a, b) => b.score - a.score);
  const best = tries[0] || { target: [], hit: [], score: 0 };
  return {
    score: best.score,
    syllables: best.target.map((c, i) => ({ expected: c, status: best.hit[i] ? "ok" : "missing" })),
    heard_pinyin: heard,
  };
}
