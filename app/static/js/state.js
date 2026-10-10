// Shared app state.
export const state = {
  settings: null,
  aiStatus: null,
};

/** Which course is active: "zh" (Mandarin) or "ja" (Japanese kanji). */
export const course = () => (state.settings?.course === "ja" ? "ja" : "zh");
export const isJa = () => course() === "ja";

export const T = {
  lang: () => (isJa() ? "Japanese" : "Chinese"),
  reading: () => (isJa() ? "reading" : "pinyin"),
  speechLang: () => (isJa() ? "ja-JP" : "zh-CN"),
};

/** What to send to text-to-speech for a word (kana reading is unambiguous for single kanji). */
export const sayText = (w) => (isJa() ? w.pinyin || w.hanzi : w.hanzi);

export function applyCourse() {
  document.documentElement.lang = isJa() ? "ja" : "zh-CN";
  document.documentElement.dataset.course = course();
  window.__course = course();
}
