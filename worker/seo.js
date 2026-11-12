// Word pages for search engines: one page per built-in word (meaning, reading, stroke order,
// memory hook, example) plus level and language overview pages and the sitemap. Rendered from
// the same data the app uses (app/data), so the site always matches the courses.
import hsk1 from "../app/data/hsk1.json";
import hsk2 from "../app/data/hsk2.json";
import hsk3 from "../app/data/hsk3.json";
import kana from "../app/data/japanese_kana.json";
import n5 from "../app/data/japanese_n5.json";
import n4 from "../app/data/japanese_n4.json";
import n3 from "../app/data/japanese_n3.json";
import extrasZh from "../app/data/extras/zh.json";
import extrasJa from "../app/data/extras/ja.json";
import strokeCounts from "./stroke-counts.json";
import slA1 from "../app/data/slovenian_a1.json";
import extrasSl from "../app/data/extras/sl.json";
import gHsk1 from "../app/data/grammar/hsk1.json";
import gHsk2 from "../app/data/grammar/hsk2.json";
import gHsk3 from "../app/data/grammar/hsk3.json";
import gN5 from "../app/data/grammar/n5.json";
import gN4 from "../app/data/grammar/n4.json";
import gN3 from "../app/data/grammar/n3.json";
import gSl from "../app/data/grammar/sl_a1.json";
import sHsk1 from "../app/data/stories/hsk1.json";
import sHsk2 from "../app/data/stories/hsk2.json";
import sHsk3 from "../app/data/stories/hsk3.json";
import sN5 from "../app/data/stories/n5.json";
import sN4 from "../app/data/stories/n4.json";
import sN3 from "../app/data/stories/n3.json";
import sSl from "../app/data/stories/sl_a1.json";

const SITE = "https://bloomko.eu";

const LANGS = {
  chinese: {
    lang: "zh", name: "Chinese", native: "中文", flag: "🇨🇳", reading: "Pinyin", extras: extrasZh, htmlLang: "zh-Hans",
    intro: "Every word of the official HSK 3.0 levels 1–3, with stroke order, pinyin, a memory trick and an example sentence.",
    levels: [
      { slug: "hsk-1", name: "HSK 1", data: hsk1, blurb: "Beginner — the first 500 words of the official HSK 3.0 standard." },
      { slug: "hsk-2", name: "HSK 2", data: hsk2, blurb: "Elementary — everyday life, travel, feelings." },
      { slug: "hsk-3", name: "HSK 3", data: hsk3, blurb: "Intermediate — work, school, health, nature." },
    ],
    grammar: [{ name: "HSK 1", data: gHsk1 }, { name: "HSK 2", data: gHsk2 }, { name: "HSK 3", data: gHsk3 }],
    stories: [{ name: "HSK 1", data: sHsk1 }, { name: "HSK 2", data: sHsk2 }, { name: "HSK 3", data: sHsk3 }],
  },
  japanese: {
    lang: "ja", name: "Japanese", native: "日本語", flag: "🇯🇵", reading: "Reading", extras: extrasJa, htmlLang: "ja",
    intro: "Hiragana, katakana and JLPT N5–N3 vocabulary, with kanji stroke order, readings, a memory trick and an example sentence.",
    levels: [
      { slug: "kana", name: "Hiragana & Katakana", data: kana, blurb: "Start here — all 142 kana, stroke by stroke." },
      { slug: "n5", name: "JLPT N5", data: n5, blurb: "Beginner — basic kanji, kana words and loanwords." },
      { slug: "n4", name: "JLPT N4", data: n4, blurb: "Elementary — everyday life, work and plans." },
      { slug: "n3", name: "JLPT N3", data: n3, blurb: "Intermediate — society, feelings, news and more." },
    ],
    grammar: [{ name: "JLPT N5", data: gN5 }, { name: "JLPT N4", data: gN4 }, { name: "JLPT N3", data: gN3 }],
    stories: [{ name: "JLPT N5", data: sN5 }, { name: "JLPT N4", data: sN4 }, { name: "JLPT N3", data: sN3 }],
  },
  slovenian: {
    lang: "sl", name: "Slovenian", native: "Slovenščina", flag: "🇸🇮", reading: "Pronunciation", extras: extrasSl, htmlLang: "sl",
    intro: "The words of the first CEFR level (A1) with pronunciation, gender, a memory trick and an example sentence — plus grammar explained in plain English and short stories to read.",
    levels: [{ slug: "a1", name: "Slovenian A1", data: slA1, blurb: "Beginner — greetings, family, food, the city, time and everyday life." }],
    grammar: [{ name: "A1", data: gSl }],
    stories: [{ name: "A1", data: sSl }],
  },
};
const GENDER = { m: "masculine noun", ž: "feminine noun", s: "neuter noun", mn: "plural-only noun" };

// ------------------------------------------------------------------ index of all words

const WORDS = {}; // "chinese" → Map(word → entry)
const WITH_CHAR = {}; // "chinese" → Map(character → entries)
const SLUGS = {}; // "slovenian" → Map(slug → entry)
const GRAMMAR_SAMPLE = 2; // grammar points per level on the site
const STORY_SAMPLE = 1; // stories per level on the site (2 for a language with one level)
for (const [key, L] of Object.entries(LANGS)) {
  const map = new Map();
  for (const level of L.levels) {
    level.units = [];
    for (const u of level.data.units) {
      const unit = { name: u.name, words: [] };
      for (const [word, reading, english, gender] of u.words) {
        if (map.has(word)) continue;
        const entry = { word, reading, english, gender, level, unit, langKey: key };
        map.set(word, entry);
        unit.words.push(entry);
      }
      if (unit.words.length) level.units.push(unit);
    }
    level.count = level.units.reduce((n, u) => n + u.words.length, 0);
  }
  WORDS[key] = map;
  // Address of each word: the word itself; Slovenian phrases get dashes ("dober-dan").
  const slugs = new Map();
  for (const e of map.values()) {
    e.slug = L.lang === "sl" ? e.word.toLowerCase().trim().replace(/\s+/g, "-") : e.word;
    if (!slugs.has(e.slug)) slugs.set(e.slug, e);
  }
  SLUGS[key] = slugs;
  // Grammar points and stories, with their level.
  // Only a taste of the grammar and stories goes on the site (the rest is in the app):
  // the first grammar points and stories of each level. Every word gets a page.
  const one = (L.grammar || []).length === 1;
  L.allPoints = (L.grammar || []).reduce((n, g) => n + g.data.points.length, 0);
  L.allStories = (L.stories || []).reduce((n, g) => n + g.data.stories.length, 0);
  for (const g of L.grammar || []) g.shown = g.data.points.slice(0, GRAMMAR_SAMPLE);
  for (const g of L.stories || []) g.shown = g.data.stories.slice(0, one ? 2 : STORY_SAMPLE);
  L.points = (L.grammar || []).flatMap((g) => g.shown.map((pt, i, all) => ({ ...pt, levelName: g.name, prev: all[i - 1], next: all[i + 1] })));
  L.storyList = (L.stories || []).flatMap((g) => g.shown.map((st) => ({ ...st, levelName: g.name })));
  // Character → words that contain it (for "Words with 爱").
  const byChar = new Map();
  for (const e of map.values()) for (const c of new Set(e.word)) {
    if (!byChar.has(c)) byChar.set(c, []);
    byChar.get(c).push(e);
  }
  WITH_CHAR[key] = byChar;
}

// ------------------------------------------------------------------ helpers

const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
const wordUrl = (e) => `/${e.langKey}/${encodeURIComponent(e.slug)}/`;
const grammarUrl = (key, pt) => `/${key}/grammar/${pt ? `${pt.id}/` : ""}`;
const storyUrl = (key, st) => `/${key}/stories/${st ? `${st.id}/` : ""}`;
const levelUrl = (key, level) => `/${key}/${level.slug}/`;
const isKanaChar = (c) => /[\u3041-\u30ff]/.test(c);
const isKatakana = (w) => /^[\u30a0-\u30ffー]+$/.test(w);

function page({ title, description, canonical, body, lang = "en", breadcrumbs = [], extraHead = "" }) {
  const crumbs = breadcrumbs.length
    ? `<nav class="crumbs" aria-label="Breadcrumb">${breadcrumbs.map((b, i) => (i < breadcrumbs.length - 1 ? `<a href="${b.url}">${esc(b.name)}</a><span>›</span>` : `<b>${esc(b.name)}</b>`)).join("")}</nav>`
    : "";
  const ld = breadcrumbs.length
    ? `<script type="application/ld+json">${JSON.stringify({
        "@context": "https://schema.org",
        "@type": "BreadcrumbList",
        itemListElement: breadcrumbs.map((b, i) => ({ "@type": "ListItem", position: i + 1, name: b.name, item: SITE + b.url })),
      }).replace(/</g, "\\u003c")}</script>`
    : "";
  return `<!doctype html>
<html lang="${lang}">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(title)}</title>
<meta name="description" content="${esc(description)}">
<link rel="canonical" href="${SITE}${canonical}">
<meta property="og:title" content="${esc(title)}">
<meta property="og:description" content="${esc(description)}">
<meta property="og:url" content="${SITE}${canonical}">
<meta property="og:image" content="${SITE}/img/icon-512.png">
<meta name="theme-color" content="#1c3026">
<link rel="icon" href="/favicon.svg" type="image/svg+xml">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Nunito:wght@500;700;800;900&display=swap" rel="stylesheet">
<style>${CSS}</style>
${ld}${extraHead}
</head>
<body>
<div class="wrap">
<header class="top"><a class="brand" href="/"><img src="/img/logo.png" alt="" width="36" height="36">Bloomko</a>
<nav class="links"><a href="/chinese/">Chinese</a><a href="/japanese/">Japanese</a><a href="/slovenian/">Slovenian</a></nav></header>
${crumbs}
<main>${body}</main>
${notifyCard()}
<footer>
<span>© 2026 Bloomko · <a href="/">bloomko.eu</a> · <a href="mailto:thebloomko@gmail.com">thebloomko@gmail.com</a></span>
<span>Stroke order data: Make Me a Hanzi &amp; animCJK (Arphic Public License) · Animation: Hanzi Writer (MIT)</span>
</footer>
</div>
<script>${NOTIFY_JS}</script>
</body>
</html>`;
}

function notifyCard() {
  return `<section class="card cta">
<img src="/img/logo.png" alt="" width="56" height="56">
<div><h2>Learn to write it by hand</h2>
<p>Bloomko is a free Android app: write characters stroke by stroke, practise with spaced repetition and get an AI tutor that works offline. Be the first to know when it launches.</p>
<form class="notify" data-notify><input type="email" name="email" placeholder="your@email.com" required aria-label="Email"><input type="text" name="website" tabindex="-1" autocomplete="off" class="hp" aria-hidden="true"><button>Notify me</button></form>
<p class="note" hidden></p></div>
</section>`;
}

// ------------------------------------------------------------------ pages

function wordPage(e) {
  if (e.langKey === "slovenian") return slWordPage(e);
  const L = LANGS[e.langKey];
  const x = L.extras[e.word] || {};
  const chars = [...e.word].filter((c) => strokeCounts[L.lang][c]);
  const kanaWord = L.lang === "ja" && e.level.slug === "kana";
  const script = kanaWord ? (isKatakana(e.word) ? "katakana" : "hiragana") : null;
  const strokesTotal = chars.reduce((n, c) => n + strokeCounts[L.lang][c], 0);
  const meaning = e.english;

  const title = kanaWord
    ? `${e.word} (${meaning}) – how to write ${script} ${e.word}, stroke order | Bloomko`
    : `${e.word} (${e.reading}) – “${meaning.split(";")[0].trim()}”: meaning, stroke order & example | Bloomko`;
  const description = kanaWord
    ? `How to write the ${script} ${e.word} (“${meaning}”): animated stroke order (${strokesTotal} strokes), a memory trick and an example word.`
    : `${e.word} (${e.reading}) means “${meaning}”. ${e.level.name} word. Animated stroke order, a memory trick${x.example_zh ? ` and an example: ${x.example_zh}` : "."}`;

  // Words that share a character with this one (not for single kana).
  const related = kanaWord
    ? []
    : chars
        .filter((c) => !isKanaChar(c))
        .map((c) => ({ c, words: (WITH_CHAR[e.langKey].get(c) || []).filter((w) => w !== e).slice(0, 18) }))
        .filter((r) => r.words.length);
  const charLinks = chars.length > 1
    ? `<p class="chars">${chars
        .map((c) => {
          const single = WORDS[e.langKey].get(c);
          const label = `${c} · ${strokeCounts[L.lang][c]} strokes`;
          return single ? `<a href="${wordUrl(single)}">${esc(label)}</a>` : `<span>${esc(label)}</span>`;
        })
        .join("")}</p>`
    : "";
  // What each character of a compound means on its own, when it is a word in the course.
  const parts = chars.length > 1
    ? chars
        .map((c) => WORDS[e.langKey].get(c))
        .filter(Boolean)
        .map((w) => `<li><a href="${wordUrl(w)}" lang="${L.htmlLang}">${esc(w.word)}</a> <span lang="${L.htmlLang}">${esc(w.reading)}</span> — ${esc(w.english)} (${strokeCounts[L.lang][w.word] || "?"} strokes)</li>`)
    : [];

  const unitWords = e.unit.words;
  const i = unitWords.indexOf(e);
  const prev = unitWords[i - 1];
  const next = unitWords[i + 1];
  const siblings = unitWords
    .filter((w) => w !== e)
    .map((w) => `<a href="${wordUrl(w)}"><b lang="${L.htmlLang}">${esc(w.word)}</b><small>${esc(w.english)}</small></a>`)
    .join("");

  const body = `
<article class="word">
<div class="hero card">
<div class="tag">${esc(e.level.name)} · ${esc(e.unit.name)}</div>
<h1 lang="${L.htmlLang}">${esc(e.word)}</h1>
${e.reading !== e.word ? `<p class="reading" lang="${L.htmlLang}">${esc(e.reading)}</p>` : ""}
<p class="meaning">${esc(meaning)}</p>
</div>

<section class="card">
<h2>Stroke order${script ? ` of ${script} ${esc(e.word)}` : ` of ${esc(e.word)}`}</h2>
<p class="muted">${chars.length === 1 ? `${esc(e.word)} is written with ${strokesTotal} strokes.` : `${chars.length} characters, ${strokesTotal} strokes in total.`} Watch the animation, then try writing it yourself.</p>
<div class="writers" data-lang="${L.lang}">${chars.map((c) => `<div class="writer" data-char="${esc(c)}" data-code="${c.codePointAt(0).toString(16)}"><div class="box"></div><div class="wbtns"><button data-act="play">▶ Play</button><button data-act="quiz">✍ Try it</button></div></div>`).join("")}</div>
${charLinks}
</section>

${x.mnemonic ? `<section class="card hook"><h2>Memory trick</h2><p>${esc(x.mnemonic)}</p>${x.sounds_like ? `<p class="muted">Sounds like: ${esc(x.sounds_like)}</p>` : ""}${x.components ? `<p class="muted"><b>${kanaWord ? "Origin" : "Parts"}:</b> ${esc(x.components)}</p>` : ""}</section>` : ""}

${parts.length ? `<section class="card"><h2>The characters in ${esc(e.word)}</h2><ul class="parts">${parts.join("")}</ul></section>` : ""}

${x.example_zh ? `<section class="card"><h2>${kanaWord ? "Example word" : "Example sentence"}</h2><p class="ex" lang="${L.htmlLang}">${esc(x.example_zh)}</p>${x.example_pinyin && x.example_pinyin !== x.example_zh ? `<p class="muted" lang="${L.htmlLang}">${esc(x.example_pinyin)}</p>` : ""}<p>${esc(x.example_en)}</p></section>` : ""}

<nav class="pager">${prev ? `<a href="${wordUrl(prev)}">‹ <span lang="${L.htmlLang}">${esc(prev.word)}</span></a>` : "<span></span>"}<a href="${levelUrl(e.langKey, e.level)}">All ${esc(e.level.name)} words</a>${next ? `<a href="${wordUrl(next)}"><span lang="${L.htmlLang}">${esc(next.word)}</span> ›</a>` : "<span></span>"}</nav>

${related.map((r) => `<section class="card"><h2>Words with <span lang="${L.htmlLang}">${esc(r.c)}</span></h2><div class="grid">${r.words.map((w) => `<a href="${wordUrl(w)}"><b lang="${L.htmlLang}">${esc(w.word)}</b><small>${esc(w.english)}</small></a>`).join("")}</div></section>`).join("")}

${siblings ? `<section class="card"><h2>More words: ${esc(e.unit.name)}</h2><div class="grid">${siblings}</div></section>` : ""}
</article>`;
  return page({
    title, description, body,
    canonical: wordUrl(e),
    breadcrumbs: [{ name: "Bloomko", url: "/" }, { name: L.name, url: `/${e.langKey}/` }, { name: e.level.name, url: levelUrl(e.langKey, e.level) }, { name: e.word, url: wordUrl(e) }],
    extraHead: `<script src="/vendor/hanzi-writer.min.js" defer></script><script>${WRITER_JS}</script><script type="application/ld+json">${JSON.stringify({
      "@context": "https://schema.org",
      "@type": "DefinedTerm",
      name: e.word,
      alternateName: e.reading !== e.word ? e.reading : undefined,
      description: meaning,
      inLanguage: L.htmlLang,
      url: SITE + wordUrl(e),
      inDefinedTermSet: { "@type": "DefinedTermSet", name: `${e.level.name} ${kanaWord ? "kana" : "vocabulary"}`, url: SITE + levelUrl(e.langKey, e.level) },
    }).replace(/</g, "\\u003c")}</script>`,
  });
}

function levelPage(key, level) {
  const L = LANGS[key];
  const units = level.units
    .map((u) => `<section class="card"><h2>${esc(u.name)}</h2><div class="grid">${u.words.map((w) => `<a href="${wordUrl(w)}"><b lang="${L.htmlLang}">${esc(w.word)}</b><small>${esc(w.english)}</small></a>`).join("")}</div></section>`)
    .join("");
  const what = level.slug === "kana" ? "all hiragana and katakana" : `all ${level.count} ${level.name} words`;
  if (L.lang === "sl") return page({
    title: `Slovenian A1 vocabulary list (${level.count} words) – pronunciation, gender & examples | Bloomko`,
    description: `Free Slovenian A1 word list: ${level.count} beginner words in ${level.units.length} topics, each with pronunciation (stressed syllable), gender, a memory trick and an example sentence.`,
    canonical: levelUrl(key, level),
    breadcrumbs: [{ name: "Bloomko", url: "/" }, { name: L.name, url: `/${key}/` }, { name: level.name, url: levelUrl(key, level) }],
    body: `<div class="card hero"><div class="tag">${L.flag} ${esc(L.name)}</div><h1>${esc(level.name)}</h1><p class="meaning">${esc(level.blurb)}</p><p class="muted">${level.count} words in ${level.units.length} themed units. Tap any word for its pronunciation, memory trick and example. Next: <a href="${grammarUrl(key)}">A1 grammar</a> · <a href="${storyUrl(key)}">short stories</a></p></div>${units}`,
  });
  return page({
    title: `${level.name} ${level.slug === "kana" ? "chart" : "vocabulary list"} (${level.count}) – stroke order, meanings & examples | Bloomko`,
    description: `Free ${level.name} ${level.slug === "kana" ? "chart" : "word list"}: ${what} with ${L.reading.toLowerCase()}, meaning, animated stroke order, a memory trick and an example for each.`,
    canonical: levelUrl(key, level),
    breadcrumbs: [{ name: "Bloomko", url: "/" }, { name: L.name, url: `/${key}/` }, { name: level.name, url: levelUrl(key, level) }],
    body: `<div class="card hero"><div class="tag">${L.flag} ${esc(L.name)}</div><h1>${esc(level.name)}</h1><p class="meaning">${esc(level.blurb)}</p><p class="muted">${level.count} ${level.slug === "kana" ? "characters" : "words"} in ${level.units.length} themed units. Tap any word for its stroke order, memory trick and example.</p></div>${units}`,
  });
}

function langPage(key) {
  const L = LANGS[key];
  const levels = L.levels
    .map((lv) => {
      const sample = lv.units.flatMap((u) => u.words).slice(0, 8);
      return `<a class="card level" href="${levelUrl(key, lv)}"><h2>${esc(lv.name)}</h2><p>${esc(lv.blurb)}</p><p class="sample" lang="${L.htmlLang}">${sample.map((w) => esc(w.word)).join(" · ")}</p><span class="muted">${lv.count} ${lv.slug === "kana" ? "characters" : "words"} ›</span></a>`;
    })
    .join("");
  const total = L.levels.reduce((n, lv) => n + lv.count, 0);
  const sl = L.lang === "sl";
  const more = [
    L.points.length ? `<a class="card level" href="${grammarUrl(key)}"><h2>📘 ${esc(L.name)} grammar</h2><p>Grammar explained in plain English, with example sentences — a few examples here, all ${L.allPoints} points in the app.</p><p class="sample">${L.points.slice(0, 4).map((pt) => esc(plain(pt.title))).join(" · ")}</p><span class="muted">Grammar examples ›</span></a>` : "",
    L.storyList.length ? `<a class="card level" href="${storyUrl(key)}"><h2>📖 ${esc(L.name)} stories</h2><p>Short graded stories: tap any word for its meaning, read the translation, then answer a few questions. Try ${L.storyList.length === 1 ? "one" : L.storyList.length} here — ${L.allStories} in the app.</p><p class="sample" lang="${L.htmlLang}">${L.storyList.slice(0, 4).map((st) => esc(st.title)).join(" · ")}</p><span class="muted">Read a story ›</span></a>` : "",
  ].join("");
  return page({
    title: sl ? `Learn Slovenian: A1 words, grammar & short stories for beginners | Bloomko` : `Learn ${L.name} words: stroke order, meanings & memory tricks (${total} words) | Bloomko`,
    description: `${L.intro} Free, by level.`,
    canonical: `/${key}/`,
    breadcrumbs: [{ name: "Bloomko", url: "/" }, { name: L.name, url: `/${key}/` }],
    body: `<div class="card hero"><div class="tag">${L.flag} ${esc(L.native)}</div><h1>${sl ? "Learn Slovenian" : `${esc(L.name)} words`}</h1><p class="meaning">${esc(L.intro)}</p></div><div class="levels">${levels}${more}</div>`,
  });
}


// ------------------------------------------------------------------ Slovenian words, grammar, stories

/** Plain text of a grammar string: no **bold** or [ending] marks. */
const plain = (t) => String(t || "").replace(/\*\*(.+?)\*\*/g, "$1").replace(/\[([^\]]*)\]/g, "$1");
/** Grammar text → HTML: **bold**, [highlighted part], line breaks. */
const rich = (t) => esc(t).replace(/\*\*(.+?)\*\*/g, "<b>$1</b>").replace(/\[([^\]]*)\]/g, "<mark>$1</mark>");
const paras = (t) => String(t || "").split(/\n{2,}/).map((p) => `<p>${rich(p).replace(/\n/g, "<br>")}</p>`).join("");
/** An example sentence with its grammar part highlighted (Slovenian: [brackets]; Chinese/Japanese: the "mark" list). */
function exampleHtml(ex) {
  if (/\[/.test(ex.text)) return rich(ex.text);
  let out = esc(ex.text);
  for (const m of ex.mark || []) if (m) out = out.split(esc(m)).join(`<mark>${esc(m)}</mark>`);
  return out;
}

function slWordPage(e) {
  const L = LANGS.slovenian;
  const x = L.extras[e.word] || {};
  const unitWords = e.unit.words;
  const i = unitWords.indexOf(e);
  const prev = unitWords[i - 1];
  const next = unitWords[i + 1];
  const siblings = unitWords.filter((w) => w !== e).map((w) => `<a href="${wordUrl(w)}"><b lang="sl">${esc(w.word)}</b><small>${esc(w.english)}</small></a>`).join("");
  const kind = GENDER[e.gender] || "";
  const first = e.english.split(";")[0].trim();
  const body = `
<article class="word">
<div class="hero card">
<div class="tag">${esc(e.level.name)} · ${esc(e.unit.name)}</div>
<h1 lang="sl" class="sl">${esc(e.word)}</h1>
<p class="reading">${esc(e.reading)}</p>
<p class="meaning">${esc(e.english)}</p>
${kind ? `<p class="muted">${esc(kind)} (${esc(e.gender)})</p>` : ""}
</div>
<section class="card"><h2>How to say it</h2><p>Say it as <b>${esc(e.reading)}</b> — the syllable in capitals is stressed.${x.sounds_like ? ` ${esc(x.sounds_like)}` : ""}</p>${kind ? `<p class="muted">${esc(e.word)} is a ${esc(kind)}. <a href="${grammarUrl("slovenian", { id: "sl-gender" })}">How to tell a noun's gender</a></p>` : ""}</section>
${x.mnemonic ? `<section class="card hook"><h2>Memory trick</h2><p>${esc(x.mnemonic)}</p>${x.components ? `<p class="muted"><b>Usage:</b> ${esc(x.components)}</p>` : ""}</section>` : ""}
${x.example_zh ? `<section class="card"><h2>Example sentence</h2><p class="ex" lang="sl">${esc(x.example_zh)}</p><p>${esc(x.example_en)}</p></section>` : ""}
<nav class="pager">${prev ? `<a href="${wordUrl(prev)}">‹ <span lang="sl">${esc(prev.word)}</span></a>` : "<span></span>"}<a href="${levelUrl("slovenian", e.level)}">All A1 words</a>${next ? `<a href="${wordUrl(next)}"><span lang="sl">${esc(next.word)}</span> ›</a>` : "<span></span>"}</nav>
${siblings ? `<section class="card"><h2>More words: ${esc(e.unit.name)}</h2><div class="grid">${siblings}</div></section>` : ""}
</article>`;
  return page({
    title: `${e.word} – Slovenian for “${first}”: pronunciation & example | Bloomko`,
    description: `“${e.word}” means “${e.english}” in Slovenian. Pronunciation: ${e.reading}${kind ? `, ${kind}` : ""}. A memory trick${x.example_zh ? ` and an example: ${x.example_zh}` : "."}`,
    canonical: wordUrl(e),
    body,
    breadcrumbs: [{ name: "Bloomko", url: "/" }, { name: L.name, url: "/slovenian/" }, { name: e.level.name, url: levelUrl("slovenian", e.level) }, { name: e.word, url: wordUrl(e) }],
    extraHead: `<script type="application/ld+json">${JSON.stringify({ "@context": "https://schema.org", "@type": "DefinedTerm", name: e.word, description: e.english, inLanguage: "sl", url: SITE + wordUrl(e), inDefinedTermSet: { "@type": "DefinedTermSet", name: "Slovenian A1 vocabulary", url: SITE + levelUrl("slovenian", e.level) } }).replace(/</g, "\\u003c")}</script>`,
  });
}

const moreInApp = (title, text) => `<section class="card more"><h2>🌱 ${esc(title)}</h2><p class="muted">${esc(text)} Bloomko is a free Android app, coming soon — sign up below to hear when it launches.</p></section>`;

function grammarIndex(key) {
  const L = LANGS[key];
  const sections = (L.grammar || []).map((g) => `<section class="card"><h2>${esc(g.data.level || g.name)}</h2><ul class="glist">${g.shown.map((pt) => `<li><a href="${grammarUrl(key, pt)}"><b>${rich(pt.title)}</b><small>${esc(plain(pt.short))}</small></a></li>`).join("")}</ul></section>`).join("");
  const levels = (L.grammar || []).map((g) => g.name).join(", ");
  return page({
    title: `${L.name} grammar for beginners, explained with examples (${levels}) | Bloomko`,
    description: `${L.name} grammar (${levels}) explained in plain English with example sentences and translations — a few examples from Bloomko, which has all ${L.allPoints} grammar points with exercises.`,
    canonical: grammarUrl(key),
    breadcrumbs: [{ name: "Bloomko", url: "/" }, { name: L.name, url: `/${key}/` }, { name: "Grammar", url: grammarUrl(key) }],
    body: `<div class="card hero"><div class="tag">${L.flag} ${esc(L.name)}</div><h1>${esc(L.name)} grammar</h1><p class="meaning">Grammar in plain English, from the very first sentence.</p><p class="muted">A few examples of how Bloomko explains grammar: the pattern, a short explanation and example sentences with the grammar part highlighted.</p></div>${sections}${moreInApp(`All ${L.allPoints} grammar points are in the app`, "Each with quizzes that pick the right form, fill the gap or find the grammar in a sentence — and they come back for review until they stick.")}`,
  });
}

function grammarPage(key, pt) {
  const L = LANGS[key];
  const title = plain(pt.title);
  const exs = (pt.examples || []).map((ex) => `<li><p class="ex" lang="${L.htmlLang}">${exampleHtml(ex)}</p>${ex.reading ? `<p class="muted" lang="${L.htmlLang}">${esc(ex.reading)}</p>` : ""}<p>${esc(ex.en)}</p></li>`).join("");
  const body = `
<article>
<div class="card hero"><div class="tag">${L.flag} ${esc(L.name)} grammar · ${esc(pt.levelName)}</div><h1 class="gtitle">${rich(pt.title)}</h1>${pt.pattern ? `<p class="pattern" lang="${L.htmlLang}">${rich(pt.pattern)}</p>` : ""}<p class="meaning">${esc(plain(pt.short))}</p></div>
<section class="card explain"><h2>Explanation</h2>${paras(pt.explain)}</section>
${exs ? `<section class="card"><h2>Examples</h2><ul class="exs">${exs}</ul></section>` : ""}
<nav class="pager">${pt.prev ? `<a href="${grammarUrl(key, pt.prev)}">‹ ${esc(plain(pt.prev.title).slice(0, 34))}</a>` : "<span></span>"}<a href="${grammarUrl(key)}">Grammar</a>${pt.next ? `<a href="${grammarUrl(key, pt.next)}">${esc(plain(pt.next.title).slice(0, 34))} ›</a>` : "<span></span>"}</nav>
</article>`;
  const ex0 = (pt.examples || [])[0];
  return page({
    title: `${title} – ${L.name} grammar (${pt.levelName}) explained with examples | Bloomko`,
    description: `${L.name} grammar, ${pt.levelName}: ${plain(pt.short)}.${ex0 ? ` Example: ${plain(ex0.text)} — ${ex0.en}` : ""}`.slice(0, 300),
    canonical: grammarUrl(key, pt),
    breadcrumbs: [{ name: "Bloomko", url: "/" }, { name: L.name, url: `/${key}/` }, { name: "Grammar", url: grammarUrl(key) }, { name: title, url: grammarUrl(key, pt) }],
    body,
    extraHead: `<script type="application/ld+json">${JSON.stringify({ "@context": "https://schema.org", "@type": "LearningResource", name: `${title} (${L.name} grammar)`, description: plain(pt.short), educationalLevel: pt.levelName, inLanguage: "en", about: { "@type": "Language", name: L.name }, learningResourceType: "Grammar explanation", isAccessibleForFree: true, url: SITE + grammarUrl(key, pt) }).replace(/</g, "\\u003c")}</script>`,
  });
}

function storiesIndex(key) {
  const L = LANGS[key];
  const sections = (L.stories || []).map((g) => `<section class="card"><h2>${esc(g.name)}</h2><div class="grid">${g.shown.map((st) => `<a href="${storyUrl(key, st)}"><b lang="${L.htmlLang}">${esc(st.title)}</b><small>${esc(st.title_en)}</small></a>`).join("")}</div></section>`).join("");
  return page({
    title: `${L.name} short stories for beginners with translation (${(L.stories || []).map((g) => g.name).join(", ")}) | Bloomko`,
    description: `Free graded ${L.name} stories for beginners: tap any word for its meaning, read the English translation and test yourself with a short quiz.`,
    canonical: storyUrl(key),
    breadcrumbs: [{ name: "Bloomko", url: "/" }, { name: L.name, url: `/${key}/` }, { name: "Stories", url: storyUrl(key) }],
    body: `<div class="card hero"><div class="tag">${L.flag} ${esc(L.name)}</div><h1>${esc(L.name)} stories</h1><p class="meaning">Short graded stories for beginners.</p><p class="muted">Tap any word to see what it means, open the translation of each sentence, and answer a few questions at the end.</p></div>${sections}${moreInApp(`${L.allStories} stories in the app`, "Made of the words you already know, read aloud, with new ones as you learn more.")}`,
  });
}

function storyPage(key, st) {
  const L = LANGS[key];
  const sl = L.lang === "sl";
  const lex = SLUGS[key];
  const meaningOf = (t) => {
    const [surface, read, m] = t;
    if (m) return [read, m];
    if (!sl) return [read, ""];
    const e = WORDS.slovenian.get(surface) || WORDS.slovenian.get(surface.toLowerCase()) || (read && WORDS.slovenian.get(read));
    return [read, e ? e.english : ""];
  };
  const tok = (t) => {
    const [surface] = t;
    if (!surface.trim() || /^[\s.,!?;:„“”"»«…()、。！？，「」『』・―—-]+$/.test(surface)) return esc(surface);
    const [read, m] = meaningOf(t);
    if (!m) return `<span>${esc(surface)}</span>`;
    const hint = [sl ? (read && read !== surface ? `← ${read}` : "") : read !== surface ? read : "", m].filter(Boolean).join(" · ");
    return `<button class="tok" type="button" data-t="${esc(hint)}">${esc(surface)}</button>`;
  };
  const sentences = st.sentences.map((s) => `<div class="sent"><p class="st" lang="${L.htmlLang}">${s.tokens.map(tok).join(sl ? "" : "")}</p><details><summary>Translation</summary><p>${esc(s.en)}</p></details></div>`).join("");
  const quiz = (st.questions || []).map((q, i) => `<fieldset class="q" data-answer="${q.answer}"><legend>${i + 1}. ${esc(q.q)}</legend>${q.options.map((o, j) => `<button type="button" data-i="${j}">${esc(o)}</button>`).join("")}</fieldset>`).join("");
  const list = L.storyList.filter((x) => x.levelName === st.levelName);
  const i = list.indexOf(st);
  const prev = list[i - 1], next = list[i + 1];
  const words = new Set(st.sentences.flatMap((s) => s.tokens.map((t) => t[0])).map((w) => w.toLowerCase()));
  const vocab = [...lex.values()].filter((e) => words.has(e.word.toLowerCase())).slice(0, 24);
  const body = `
<article class="story">
<div class="card hero"><div class="tag">${L.flag} ${esc(L.name)} story · ${esc(st.levelName)}</div><h1 lang="${L.htmlLang}" class="stitle">${esc(st.title)}</h1><p class="meaning">${esc(st.title_en)}</p><p class="muted">Tap a word for its meaning. Open “Translation” under a sentence if you get stuck.</p></div>
<section class="card">${sentences}<div class="tip" role="status" hidden></div></section>
${quiz ? `<section class="card"><h2>Did you understand it?</h2>${quiz}<p class="score muted"></p></section>` : ""}
${vocab.length ? `<section class="card"><h2>Words from this story</h2><div class="grid">${vocab.map((w) => `<a href="${wordUrl(w)}"><b lang="${L.htmlLang}">${esc(w.word)}</b><small>${esc(w.english)}</small></a>`).join("")}</div></section>` : ""}
<nav class="pager">${prev ? `<a href="${storyUrl(key, prev)}">‹ <span lang="${L.htmlLang}">${esc(prev.title)}</span></a>` : "<span></span>"}<a href="${storyUrl(key)}">Stories</a>${next ? `<a href="${storyUrl(key, next)}"><span lang="${L.htmlLang}">${esc(next.title)}</span> ›</a>` : "<span></span>"}</nav>
</article>`;
  return page({
    title: `${st.title} (${st.title_en}) – ${L.name} story for beginners, ${st.levelName}, with translation | Bloomko`,
    description: `A short ${st.levelName} ${L.name} story: “${st.title}” (${st.title_en}). Tap any word for its meaning, read the English translation and answer ${(st.questions || []).length} questions.`,
    canonical: storyUrl(key, st),
    breadcrumbs: [{ name: "Bloomko", url: "/" }, { name: L.name, url: `/${key}/` }, { name: "Stories", url: storyUrl(key) }, { name: st.title, url: storyUrl(key, st) }],
    body,
    extraHead: `<script>${STORY_JS}</script><script type="application/ld+json">${JSON.stringify({ "@context": "https://schema.org", "@type": "LearningResource", name: `${st.title} (${st.title_en})`, inLanguage: L.htmlLang, educationalLevel: st.levelName, learningResourceType: "Graded reader", isAccessibleForFree: true, url: SITE + storyUrl(key, st) }).replace(/</g, "\\u003c")}</script>`,
  });
}

const STORY_JS = `
addEventListener("DOMContentLoaded",()=>{
  const tip=document.querySelector(".story .tip");
  let on=null;
  document.querySelectorAll(".story .tok").forEach((b)=>b.addEventListener("click",(e)=>{
    e.stopPropagation();
    if(on) on.classList.remove("on");
    if(on===b){on=null;tip.hidden=true;return;}
    on=b;b.classList.add("on");
    tip.textContent=b.textContent+" — "+b.dataset.t;tip.hidden=false;
    const r=b.getBoundingClientRect(),p=tip.parentElement.getBoundingClientRect();
    tip.style.top=(r.bottom-p.top+6)+"px";tip.style.left=Math.max(8,Math.min(r.left-p.left,p.width-tip.offsetWidth-8))+"px";
  }));
  document.addEventListener("click",()=>{if(on){on.classList.remove("on");on=null;tip.hidden=true;}});
  let right=0,done=0;const qs=document.querySelectorAll(".story .q"),score=document.querySelector(".story .score");
  qs.forEach((q)=>q.querySelectorAll("button").forEach((b)=>b.addEventListener("click",()=>{
    if(q.dataset.done) return;q.dataset.done=1;done++;
    const ok=b.dataset.i===q.dataset.answer;if(ok) right++;
    b.classList.add(ok?"ok":"bad");q.querySelector('[data-i="'+q.dataset.answer+'"]').classList.add("ok");
    if(done===qs.length) score.textContent=right+" of "+qs.length+" right"+(right===qs.length?" — perfect! 🌱":"");
  })));
});`;

function sitemap() {
  const urls = ["/", "/heritage/", "/fr/", "/fr/heritage/", "/es/", "/es/heritage/", "/ja/", "/ja/heritage/", "/chinese/", "/japanese/", "/slovenian/"];
  for (const [key, L] of Object.entries(LANGS)) {
    for (const lv of L.levels) urls.push(levelUrl(key, lv));
    for (const e of SLUGS[key].values()) urls.push(wordUrl(e));
    if (L.points.length) urls.push(grammarUrl(key), ...L.points.map((pt) => grammarUrl(key, pt)));
    if (L.storyList.length) urls.push(storyUrl(key), ...L.storyList.map((st) => storyUrl(key, st)));
  }
  return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls.map((u) => `<url><loc>${SITE}${u}</loc></url>`).join("\n")}\n</urlset>\n`;
}

// ------------------------------------------------------------------ routing

const html = (body, status = 200) =>
  new Response(body, { status, headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "public, max-age=300" } });

/** A page for this URL, or null when it isn't one of ours. */
export function seo(url) {
  const path = url.pathname;
  if (path === "/sitemap.xml") {
    return new Response(sitemap(), { headers: { "Content-Type": "application/xml; charset=utf-8", "Cache-Control": "public, max-age=300" } });
  }
  const m = path.match(/^\/(chinese|japanese|slovenian)(?:\/([^/]+))?(?:\/([^/]+))?\/?$/);
  if (!m) return null;
  const [, key, rawSlug, rawSub] = m;
  // Canonical form ends with a slash.
  if (!path.endsWith("/")) return Response.redirect(`${url.origin}${path}/`, 301);
  if (!rawSlug) return html(langPage(key));
  const L = LANGS[key];
  if (rawSlug === "grammar" && L.points.length) {
    if (!rawSub) return html(grammarIndex(key));
    const pt = L.points.find((x) => x.id === rawSub);
    if (pt) return html(grammarPage(key, pt));
    // A grammar point that is only in the app now: send old links to the grammar list.
    if ((L.grammar || []).some((g) => g.data.points.some((x) => x.id === rawSub))) return Response.redirect(`${url.origin}${grammarUrl(key)}`, 301);
    return null;
  }
  if (rawSlug === "stories" && L.storyList.length) {
    if (!rawSub) return html(storiesIndex(key));
    const st = L.storyList.find((x) => x.id === rawSub);
    if (st) return html(storyPage(key, st));
    if ((L.stories || []).some((g) => g.data.stories.some((x) => x.id === rawSub))) return Response.redirect(`${url.origin}${storyUrl(key)}`, 301);
    return null;
  }
  if (rawSub) return null;
  let slug;
  try {
    slug = decodeURIComponent(rawSlug);
  } catch {
    return null;
  }
  const level = LANGS[key].levels.find((lv) => lv.slug === slug);
  if (level) return html(levelPage(key, level));
  const entry = SLUGS[key].get(slug);
  return entry ? html(wordPage(entry)) : null;
}

// ------------------------------------------------------------------ page assets

const CSS = `
:root{--bg:#1c3026;--surface:#233a2e;--surface-2:#2a4235;--border:#36503f;--text:#e6e1d3;--strong:#f4efe2;--muted:#a9b5a6;--sage:#8cc06b;--gold:#c2a63f;--gold-dark:#8e7a2b}
*{box-sizing:border-box}
body{margin:0;font-family:"Nunito",system-ui,sans-serif;color:var(--text);line-height:1.6;background:radial-gradient(ellipse 90% 45% at 15% -5%,rgba(226,189,78,.08),transparent 70%),linear-gradient(180deg,#213a2d,#1c3026 45%,#172a20);min-height:100vh}
a{color:inherit}
.wrap{max-width:860px;margin:0 auto;padding:0 18px}
h1,h2{color:var(--strong);line-height:1.2;margin:0 0 10px}
h2{font-size:20px}
.top{display:flex;align-items:center;gap:14px;padding:18px 0}
.brand{display:flex;align-items:center;gap:10px;font-weight:900;font-size:22px;color:var(--strong);text-decoration:none}
.links{margin-left:auto;display:flex;gap:16px;font-weight:800}
.links a{text-decoration:none;color:var(--muted)}
.links a:hover{color:var(--strong)}
.crumbs{display:flex;flex-wrap:wrap;gap:6px;font-size:14px;color:var(--muted);margin:0 0 14px}
.crumbs a{text-decoration:none}
.crumbs b{color:var(--text)}
.card{background:var(--surface);border:2px solid var(--border);border-radius:20px;padding:20px;margin:0 0 16px}
.hero{text-align:center;padding:26px 20px}
.hero h1{font-size:clamp(54px,14vw,96px);font-weight:800;margin:4px 0}
.level .sample,.grid b{font-size:20px}
.tag{display:inline-block;font-size:13px;font-weight:800;color:var(--sage);text-transform:uppercase;letter-spacing:.06em}
.reading{font-size:24px;color:#9fc1d6;margin:0;font-weight:700}
.meaning{font-size:20px;color:var(--strong);margin:6px 0 0;font-weight:700}
.muted{color:var(--muted)}
.writers{display:flex;flex-wrap:wrap;gap:14px;justify-content:center;margin:14px 0}
.writer{display:flex;flex-direction:column;align-items:center;gap:8px}
.writer .box{width:180px;height:180px;border-radius:16px;background:var(--surface-2) linear-gradient(transparent 49.5%,rgba(255,255,255,.08) 49.5%,rgba(255,255,255,.08) 50.5%,transparent 50.5%),linear-gradient(90deg,transparent 49.5%,rgba(255,255,255,.08) 49.5%,rgba(255,255,255,.08) 50.5%,transparent 50.5%)}
.wbtns{display:flex;gap:8px}
.wbtns button,.notify button{font:inherit;font-weight:800;border:none;border-radius:12px;padding:8px 14px;cursor:pointer;background:var(--surface-2);color:var(--strong);border:2px solid var(--border)}
.chars{display:flex;flex-wrap:wrap;gap:8px;justify-content:center;margin:0}
.chars a,.chars span{padding:4px 12px;border-radius:99px;background:var(--surface-2);text-decoration:none;font-weight:700;font-size:15px}
.parts{margin:0;padding-left:20px}.parts li{margin:4px 0}.parts a{font-size:20px;font-weight:800;text-decoration:none;color:var(--strong)}
.hook p:first-of-type{font-size:18px;color:var(--strong)}
.ex{font-size:24px;color:var(--strong);margin:0}
.pager{display:flex;justify-content:space-between;gap:10px;margin:0 0 16px;font-weight:800}
.pager a{text-decoration:none;padding:10px 14px;border-radius:14px;background:var(--surface);border:2px solid var(--border)}
.grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(150px,1fr));gap:10px}
.grid a{display:flex;flex-direction:column;padding:10px 12px;border-radius:14px;background:var(--surface-2);text-decoration:none}
.grid a:hover,.pager a:hover,.level:hover{border-color:var(--sage)}
.grid small{color:var(--muted);font-size:13px;line-height:1.3;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.levels{display:grid;gap:14px}
.level{display:block;text-decoration:none}
.level p{margin:4px 0}
.cta{display:flex;gap:16px;align-items:flex-start;border-color:#4b6a4f;background:linear-gradient(135deg,#2a4535,#233a2e)}
.cta p{margin:4px 0 12px;color:var(--muted)}
.notify{display:flex;gap:8px;flex-wrap:wrap}
.notify input[type=email]{flex:1;min-width:200px;font:inherit;padding:10px 14px;border-radius:12px;border:2px solid var(--border);background:#1a2c22;color:var(--strong)}
.notify button{background:var(--gold);color:#17241b;border-color:var(--gold);box-shadow:0 4px 0 var(--gold-dark)}
.hp{position:absolute;left:-9999px}
.note{font-weight:800;color:var(--sage)}
footer{border-top:2px solid var(--border);padding:20px 0 36px;color:var(--muted);font-size:13px;display:flex;flex-wrap:wrap;gap:8px 20px;justify-content:space-between}
.sl{font-size:clamp(44px,11vw,72px)!important}
mark{background:rgba(226,189,78,.25);color:#f2d27a;border-radius:4px;padding:0 2px}
.glist{list-style:none;margin:0;padding:0;display:grid;gap:8px}
.glist a{display:flex;flex-direction:column;padding:10px 12px;border-radius:14px;background:var(--surface-2);text-decoration:none;border:2px solid transparent}
.glist a:hover{border-color:var(--sage)}.glist small{color:var(--muted)}
.gtitle{font-size:clamp(28px,6vw,40px)!important;font-weight:900!important}
.pattern{font-size:22px;font-weight:800;color:#9fc1d6;margin:6px 0 0}
.explain p{margin:0 0 12px}
.exs{list-style:none;margin:0;padding:0}.exs li{padding:10px 0;border-bottom:1px solid var(--border)}.exs li:last-child{border:0}.exs p{margin:2px 0}.exs .ex{font-size:22px}
.stitle{font-size:clamp(34px,8vw,56px)!important}
.story section{position:relative}
.sent{margin:0 0 12px}.st{font-size:22px;color:var(--strong);margin:0;line-height:1.8}
.tok{font:inherit;color:inherit;background:none;border:0;padding:0 1px;margin:0;cursor:pointer;border-bottom:2px dotted rgba(140,192,107,.45);border-radius:3px}
.tok:hover,.tok.on{background:rgba(140,192,107,.18)}
.tip{position:absolute;z-index:3;max-width:min(320px,90%);background:#0f1a14;color:var(--strong);border:2px solid var(--sage);border-radius:12px;padding:8px 12px;font-weight:700;box-shadow:0 10px 30px rgba(0,0,0,.4)}
details summary{cursor:pointer;color:var(--muted);font-size:14px;font-weight:700}details p{margin:4px 0 0;color:var(--text)}
.q{border:0;padding:0;margin:0 0 16px}.q legend{font-weight:800;color:var(--strong);margin-bottom:8px}
.q button{font:inherit;font-weight:700;display:block;width:100%;text-align:left;margin:0 0 6px;padding:9px 12px;border-radius:12px;border:2px solid var(--border);background:var(--surface-2);color:var(--text);cursor:pointer}
.q button.ok{border-color:var(--sage);background:rgba(140,192,107,.18)}.q button.bad{border-color:#c4654a;background:rgba(196,101,74,.15)}
@media(max-width:520px){.top{flex-wrap:wrap;gap:6px 14px}.links{margin-left:0;gap:14px;font-size:15px;width:100%}.cta{flex-direction:column}.writer .box{width:150px;height:150px}}
`;

const WRITER_JS = `
addEventListener("DOMContentLoaded",()=>{
  const wrap=document.querySelector(".writers"); if(!wrap||!window.HanziWriter) return;
  const lang=wrap.dataset.lang;
  wrap.querySelectorAll(".writer").forEach((el,i)=>{
    const size=el.querySelector(".box").clientWidth;
    const w=HanziWriter.create(el.querySelector(".box"),el.dataset.char,{
      width:size,height:size,padding:10,strokeColor:"#f4efe2",radicalColor:"#8cc06b",outlineColor:"rgba(244,239,226,.16)",
      drawingColor:"#e2bd4e",highlightColor:"#8cc06b",strokeAnimationSpeed:1.1,delayBetweenStrokes:180,showCharacter:false,
      charDataLoader:(c,ok,fail)=>fetch("/strokes/"+lang+"/"+el.dataset.code+".json").then(r=>r.json()).then(ok).catch(fail)
    });
    setTimeout(()=>w.animateCharacter(),400+i*900);
    el.querySelector("[data-act=play]").onclick=()=>{w.cancelQuiz();w.animateCharacter();};
    el.querySelector("[data-act=quiz]").onclick=()=>{w.hideCharacter();w.quiz({showHintAfterMisses:2,leniency:1.8,averageDistanceThreshold:450});};
  });
});`;

const NOTIFY_JS = `
document.querySelectorAll("[data-notify]").forEach((form)=>{
  form.addEventListener("submit",async(e)=>{
    e.preventDefault();
    const btn=form.querySelector("button"),note=form.parentElement.querySelector(".note");
    btn.disabled=true;
    try{
      const r=await fetch("/api/notify",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({email:form.email.value.trim(),website:form.website.value})});
      if(!r.ok) throw 0;
      form.hidden=true; note.hidden=false; note.textContent="🌱 Thanks! We'll let you know when Bloomko launches.";
    }catch{ btn.disabled=false; note.hidden=false; note.textContent="Something went wrong — please try again."; }
  });
});`;
