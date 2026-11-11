// Builds the bloomko.eu landing pages in every language from site-src/ into site/:
//   site/index.html, site/heritage/index.html            (English)
//   site/<lang>/index.html, site/<lang>/heritage/index.html (fr, es, ja)
// Run: cd mobile && npm run build:site   (the generated pages are committed; Cloudflare serves site/)
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { SPECIES, plantFor } from "../../app/static/js/plants.ts";

const ROOT = resolve(new URL("../..", import.meta.url).pathname);
const SRC = join(ROOT, "site-src");
const OUT = join(ROOT, "site");
const SITE = "https://bloomko.eu";
const LANGS = (process.env.SITE_LANGS || "en,fr,es,ja").split(",");
const json = (p: string) => JSON.parse(readFileSync(p, "utf8"));
const STR = Object.fromEntries(LANGS.map((l) => [l, json(join(SRC, "i18n", `${l}.json`))]));

// ------------------------------------------------------------------ checks: every language has every key
for (const l of LANGS.slice(1)) {
  const missing = Object.keys(STR.en).filter((k) => !(k in STR[l]));
  if (missing.length) throw new Error(`${l}.json is missing: ${missing.join(", ")}`);
}

const prefix = (lang: string) => (lang === "en" ? "/" : `/${lang}/`);
const esc = (s: string) => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/"/g, "&quot;");
const GLOBE = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><circle cx="12" cy="12" r="10"/><path d="M2 12h20M12 2a15 15 0 0 1 0 20M12 2a15 15 0 0 0 0 20"/></svg>';

// ------------------------------------------------------------------ the demo garden: words and plants
const ui = (l: string) => (l === "en" ? {} : json(join(ROOT, "app/data/i18n", l, "ui.json")));
const meanings = (l: string) => (l === "en" ? {} : json(join(ROOT, "app/data/i18n", l, "meanings.json")));
const UI = Object.fromEntries(LANGS.map((l) => [l, ui(l)]));
const MEAN = Object.fromEntries(LANGS.map((l) => [l, meanings(l)]));
function course(files: string[]) {
  const out = new Map<string, [string, string, string]>();
  for (const f of files) for (const u of json(join(ROOT, "app/data", f)).units) for (const w of u.words) if (!out.has(w[0])) out.set(w[0], w);
  return out;
}
const COURSES = {
  zh: { words: course(["hsk1.json", "hsk2.json"]), pick: ["你好", "谢谢", "茶", "水", "猫", "狗", "朋友", "学习", "爱", "山", "月", "书", "花", "米饭", "家", "雨", "鱼", "苹果"] },
  ja: { words: course(["japanese_n5.json", "japanese_n4.json"]), pick: ["山", "川", "花", "猫", "犬", "水", "友達", "本", "月", "雨", "魚", "空", "木", "お茶", "家", "先生", "海", "桜"] },
  sl: { words: course(["slovenian_a1.json"]), pick: [] as string[] },
};
function gardenWords(c: "zh" | "ja" | "sl", lang: string) {
  const C = COURSES[c];
  // Slovenian: the words already translated into every interface language.
  const pick = c === "sl" ? [...C.words.keys()].filter((w) => LANGS.slice(1).every((l) => MEAN[l][`sl|${w}`])) : C.pick;
  const out = [];
  for (const w of pick) {
    const e = C.words.get(w);
    if (!e) continue;
    // (Japanese words need no meaning on the Japanese page: the reading is shown.)
    if (LANGS.slice(1).some((l) => !(c === "ja" && l === "ja") && !MEAN[l][`${c}|${w}`])) continue;
    const m = lang === "en" ? e[2] : c === "ja" && lang === "ja" ? "" : MEAN[lang][`${c}|${w}`];
    out.push([w, c === "sl" ? "" : e[1], m.split(/\s*;\s*|\s*；\s*/).slice(0, 2).join(lang === "ja" ? "・" : "; "), plantFor(c, w).key]);
    if (out.length === 12) break;
  }
  if (out.length < 12) throw new Error(`only ${out.length} garden words for ${c}`);
  return out;
}
const plants = (lang: string) => Object.fromEntries(SPECIES.map((s) => [s.key, { name: UI[lang][s.name] || s.name, svg: s.svg }]));

// ------------------------------------------------------------------ one page
function render(page: "east" | "heritage", lang: string) {
  const S = STR[lang];
  const path = prefix(lang) + (page === "heritage" ? "heritage/" : "");
  const url = SITE + path;
  const pageOf = (l: string) => prefix(l) + (page === "heritage" ? "heritage/" : "");
  const alternates = [...LANGS.map((l) => `  <link rel="alternate" hreflang="${l}" href="${SITE}${pageOf(l)}">`), `  <link rel="alternate" hreflang="x-default" href="${SITE}${pageOf("en")}">`].join("\n");
  const langmenu = `      <details class="langmenu"><summary aria-label="${esc(S["c.lang_label"])}">${GLOBE}${lang.toUpperCase()}</summary><ul>${LANGS.map((l) => `<li><a href="${pageOf(l)}" hreflang="${l}" lang="${l}"${l === lang ? ' aria-current="page"' : ""}>${STR[l]["meta.name"]}<small>${l.toUpperCase()}</small></a></li>`).join("")}</ul></details>`;
  const footlangs = LANGS.map((l) => `<a href="${pageOf(l)}" hreflang="${l}" lang="${l}">${STR[l]["meta.name"]}</a>`).join("");
  const uilangs = LANGS.map((l) => `<a href="${pageOf(l)}" hreflang="${l}" lang="${l}">${STR[l]["meta.name"]}</a>`).join("");
  const t = Object.fromEntries(Object.entries(S).filter(([k]) => k.startsWith("t.")).map(([k, v]) => [k.slice(2), v]));
  const tryZh = [["你", "nǐ"], ["好", "hǎo"], ["爱", "ài"], ["茶", "chá"]].map(([c, r], i) => [c, r, S["e.try_zh"][i]]);
  const tryJa = [["あ", "a"], ["日", "にち · ひ"], ["本", "ほん"], ["山", "やま"]].map(([c, r], i) => [c, r, S["e.try_ja"][i]]);
  const garden =
    page === "east"
      ? { zh: { name: S["c.g_bed"], words: gardenWords("zh", lang) }, ja: { name: S["c.g_bed"], words: gardenWords("ja", lang) } }
      : { sl: { name: S["c.g_bed"], words: gardenWords("sl", lang) } };
  const data = {
    lang,
    edition: page,
    t,
    try: page === "east" ? { zh: tryZh, ja: tryJa } : undefined,
    garden,
    plants: plants(lang),
    suggest: Object.fromEntries(LANGS.map((l) => [l, { text: STR[l]["meta.suggest"], url: pageOf(l) }])),
  };
  let html = readFileSync(join(SRC, `${page}.html`), "utf8");
  // Texts first (they may contain {{@home}}), then the page values.
  html = html.replace(/\{\{([a-z]\.[a-z0-9_]+)\}\}/g, (m, k) => {
    if (!(k in S)) throw new Error(`${page}/${lang}: no text for ${k}`);
    return S[k];
  });
  const vals = {
    lang,
    locale: S["meta.locale"],
    url,
    home: prefix(lang),
    alternates,
    langmenu,
    footlangs,
    uilangs,
    data: JSON.stringify(data).replace(/</g, "\\u003c"),
  };
  html = html.replace(/\{\{@([a-z]+)\}\}/g, (m, k) => {
    if (!(k in vals)) throw new Error(`${page}: unknown value ${k}`);
    return vals[k];
  });
  if (/\{\{/.test(html)) throw new Error(`${page}/${lang}: unreplaced {{ }}`);
  const file = join(OUT, path, "index.html");
  mkdirSync(dirname(file), { recursive: true });
  writeFileSync(file, html.replace("<!doctype html>\n", "<!doctype html>\n<!-- Generated from site-src/ by mobile/scripts/build-site.ts — edit there, then: cd mobile && npm run build:site -->\n"));
  return path;
}

const pages = [];
for (const lang of LANGS) for (const page of ["east", "heritage"] as const) pages.push(render(page, lang));
console.log(`site: ${pages.length} pages`, pages.join(" "));
