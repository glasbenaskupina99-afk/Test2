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
  },
};

// ------------------------------------------------------------------ index of all words

const WORDS = {}; // "chinese" → Map(word → entry)
const WITH_CHAR = {}; // "chinese" → Map(character → entries)
for (const [key, L] of Object.entries(LANGS)) {
  const map = new Map();
  for (const level of L.levels) {
    level.units = [];
    for (const u of level.data.units) {
      const unit = { name: u.name, words: [] };
      for (const [word, reading, english] of u.words) {
        if (map.has(word)) continue;
        const entry = { word, reading, english, level, unit, langKey: key };
        map.set(word, entry);
        unit.words.push(entry);
      }
      if (unit.words.length) level.units.push(unit);
    }
    level.count = level.units.reduce((n, u) => n + u.words.length, 0);
  }
  WORDS[key] = map;
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
const wordUrl = (e) => `/${e.langKey}/${encodeURIComponent(e.word)}/`;
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
<nav class="links"><a href="/chinese/">Chinese</a><a href="/japanese/">Japanese</a></nav></header>
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
  return page({
    title: `Learn ${L.name} words: stroke order, meanings & memory tricks (${total} words) | Bloomko`,
    description: `${L.intro} Free, by level.`,
    canonical: `/${key}/`,
    breadcrumbs: [{ name: "Bloomko", url: "/" }, { name: L.name, url: `/${key}/` }],
    body: `<div class="card hero"><div class="tag">${L.flag} ${esc(L.native)}</div><h1>${esc(L.name)} words</h1><p class="meaning">${esc(L.intro)}</p></div><div class="levels">${levels}</div>`,
  });
}

function sitemap() {
  const urls = ["/", "/chinese/", "/japanese/"];
  for (const [key, L] of Object.entries(LANGS)) {
    for (const lv of L.levels) urls.push(levelUrl(key, lv));
    for (const e of WORDS[key].values()) urls.push(wordUrl(e));
  }
  return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls.map((u) => `<url><loc>${SITE}${u}</loc></url>`).join("\n")}\n</urlset>\n`;
}

// ------------------------------------------------------------------ routing

const html = (body, status = 200) =>
  new Response(body, { status, headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "public, max-age=3600, s-maxage=86400" } });

/** A page for this URL, or null when it isn't one of ours. */
export function seo(url) {
  const path = url.pathname;
  if (path === "/sitemap.xml") {
    return new Response(sitemap(), { headers: { "Content-Type": "application/xml; charset=utf-8", "Cache-Control": "public, max-age=3600" } });
  }
  const m = path.match(/^\/(chinese|japanese)(?:\/([^/]+))?\/?$/);
  if (!m) return null;
  const [, key, rawSlug] = m;
  // Canonical form ends with a slash.
  if (!path.endsWith("/")) return Response.redirect(`${url.origin}${path}/`, 301);
  if (!rawSlug) return html(langPage(key));
  let slug;
  try {
    slug = decodeURIComponent(rawSlug);
  } catch {
    return null;
  }
  const level = LANGS[key].levels.find((lv) => lv.slug === slug);
  if (level) return html(levelPage(key, level));
  const entry = WORDS[key].get(slug);
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
@media(max-width:520px){.cta{flex-direction:column}.writer .box{width:150px;height:150px}}
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
    el.querySelector("[data-act=quiz]").onclick=()=>{w.hideCharacter();w.quiz({showHintAfterMisses:2});};
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
