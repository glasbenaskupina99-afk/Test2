// Translated course content for the interface language (French, Spanish, Japanese): word meanings,
// practice sentences, grammar, stories and memory hooks. Each file in www/i18n/<lang>/ maps keys to
// translations and is laid over the English data; anything missing stays English.

const LANGS = ["fr", "es", "ja"];
let lang = "en";
let meanings = null;
let sentences = null;
const cache = {};

export const getLang = () => lang;

/** Fetches i18n/<lang>/<name>.json once (null for English or when the file doesn't exist). */
export function overlay(name) {
  if (lang === "en") return Promise.resolve(null);
  const key = `${lang}/${name}`;
  cache[key] ||= fetch(`i18n/${key}.json`)
    .then((r) => (r.ok ? r.json() : null))
    .catch(() => null);
  return cache[key];
}

export async function setLang(next) {
  lang = LANGS.includes(next) ? next : "en";
  [meanings, sentences] = await Promise.all([overlay("meanings"), overlay("sentences")]);
}

/** Meaning of a built-in word in the interface language, or undefined. */
export const meaning = (wordLang, hanzi) => meanings?.[`${wordLang}|${hanzi}`];
export const sentence = (key) => sentences?.[key];
