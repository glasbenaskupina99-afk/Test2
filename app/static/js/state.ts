// Shared app state.
export const state = {
  settings: null,
  aiStatus: null,
};

/** Which course is active: "zh" (Mandarin), "ja" (Japanese kanji) or "sl" (Slovenian). */
/** "east" = Bloomko East (Chinese, Japanese) · "heritage" = Bloomko Heritage (lesser-known languages). */
export const EDITION = window.__edition === "heritage" ? "heritage" : "east";
export const isHeritage = () => EDITION === "heritage";
export const course = () => (["zh", "ja", "sl"].includes(state.settings?.course) ? state.settings.course : EDITION === "heritage" ? "sl" : "zh");
export const isJa = () => course() === "ja";
/** Slovenian uses the Latin alphabet: spelling instead of stroke-order handwriting. */
export const isSl = () => course() === "sl";

const NAMES = { zh: "Chinese", ja: "Japanese", sl: "Slovenian" };
export const T = {
  lang: () => NAMES[course()],
  reading: () => ({ zh: "pinyin", ja: "reading", sl: "pronunciation" })[course()],
  speechLang: () => ({ zh: "zh-CN", ja: "ja-JP", sl: "sl-SI" })[course()],
};

/** What to send to text-to-speech for a word (kana reading is unambiguous for single kanji). */
export const sayText = (w) => (isJa() ? w.pinyin || w.hanzi : w.hanzi);

export function applyCourse() {
  document.documentElement.lang = { zh: "zh-CN", ja: "ja", sl: "sl" }[course()];
  document.documentElement.dataset.course = course();
  window.__course = course();
}
