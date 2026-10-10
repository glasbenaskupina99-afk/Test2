// JS port of app/pinyin.py (pinyin-pro replaces pypinyin).
import { pinyin } from "pinyin-pro";

const TONE_MARKS = { "̄": 1, "́": 2, "̌": 3, "̀": 4 };
const HANZI_RE = /[㐀-鿿豈-﫿]/g;

export const hanziOnly = (text) => ((text || "").match(HANZI_RE) || []).join("");

export function splitTones(text) {
  const letters = [];
  const tones = [];
  for (const ch of (text || "").toLowerCase().normalize("NFD")) {
    if (TONE_MARKS[ch]) tones.push(TONE_MARKS[ch]);
    else if ("1234".includes(ch)) tones.push(Number(ch));
    else if (ch === "̈" || ch === ":") letters.push("v");
    else if (ch >= "a" && ch <= "z") letters.push(ch);
  }
  return [letters.join("").replace(/uv/g, "v"), tones];
}

export function comparePinyin(answer, expected) {
  const [al, at] = splitTones(answer);
  const [el, et] = splitTones(expected);
  if (al !== el) return { result: "wrong" };
  if (at.join() === et.join()) return { result: "correct" };
  return { result: "tones_wrong" };
}

export function toPinyin(text) {
  const hz = hanziOnly(text);
  return hz ? pinyin(hz, { toneType: "symbol" }) : "";
}

function syllablesNumbered(text) {
  const hz = hanziOnly(text);
  if (!hz) return [];
  return pinyin(hz, { toneType: "num", type: "array" }).map((s) => (/\d$/.test(s) ? s.replace(/0$/, "5") : s + "5"));
}

export function compareSpoken(heard, expected) {
  const exp = syllablesNumbered(expected);
  const got = syllablesNumbered(heard);
  const base = (s) => s.slice(0, -1);
  const n = exp.length;
  const m = got.length;
  const dp = Array.from({ length: n + 1 }, () => new Array(m + 1).fill(0));
  for (let i = n - 1; i >= 0; i--)
    for (let j = m - 1; j >= 0; j--)
      dp[i][j] = base(exp[i]) === base(got[j]) ? dp[i + 1][j + 1] + 1 : Math.max(dp[i + 1][j], dp[i][j + 1]);
  const result = exp.map((s) => ({ expected: s, status: "missing" }));
  let i = 0;
  let j = 0;
  while (i < n && j < m) {
    if (base(exp[i]) === base(got[j])) {
      result[i].heard = got[j];
      result[i].status = exp[i] === got[j] || exp[i].endsWith("5") ? "ok" : "tone";
      i++;
      j++;
    } else if (dp[i + 1][j] >= dp[i][j + 1]) i++;
    else j++;
  }
  const ok = result.filter((r) => r.status === "ok").length;
  const tone = result.filter((r) => r.status === "tone").length;
  return { score: Math.round((100 * (ok + 0.5 * tone)) / Math.max(n, 1)), syllables: result, heard_pinyin: toPinyin(heard) };
}
