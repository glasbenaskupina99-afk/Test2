// The whole server (app/main.py) re-implemented to run inside the app.
// Data is a single JSON document persisted on the phone.
import seedZh from "../../app/data/hsk1.json";
import seedJa from "../../app/data/japanese_n5.json";
import seedJaN3 from "../../app/data/japanese_n3.json";
import seedJaN4 from "../../app/data/japanese_n4.json";
import seedKana from "../../app/data/japanese_kana.json";
import seedZh2 from "../../app/data/hsk2.json";
import seedZh3 from "../../app/data/hsk3.json";
import FALLBACK_ZH from "../../app/data/sentences.json";
import FALLBACK_JA from "../../app/data/japanese_sentences.json";
import FALLBACK_JA_N3 from "../../app/data/japanese_n3_sentences.json";
import seedSl from "../../app/data/slovenian_a1.json";
import FALLBACK_SL from "../../app/data/slovenian_sentences.json";
import { compareSpelling, compareSpokenSl, normSl } from "./slovenian.js";
import * as ai from "./ai.js";
import * as fsrs from "./fsrs.js";
import LOOKALIKES from "../../app/data/lookalikes.json";
import { compareSpoken, comparePinyin, hanziOnly, toPinyin } from "./pinyin.js";
import { compareReading, compareSpokenJa, isKanji, normKana, writable } from "./japanese.js";

// Built-in word lists. Each is a "section" of its course (e.g. JLPT N5 / JLPT N3).
const SEED_SETS = [
  { lang: "zh", data: seedZh, section: "HSK 1", source: "hsk1", base: 0 },
  { lang: "zh", data: seedZh2, section: "HSK 2", source: "hsk2", base: 1000 },
  { lang: "zh", data: seedZh3, section: "HSK 3", source: "hsk3", base: 2000 },
  { lang: "ja", data: seedKana, section: "Kana", source: "kana", base: -10000 },
  { lang: "ja", data: seedJa, section: "JLPT N5", source: "n5", base: 0 },
  { lang: "ja", data: seedJaN4, section: "JLPT N4", source: "n4", base: 5000 },
  { lang: "ja", data: seedJaN3, section: "JLPT N3", source: "n3", base: 10000 },
  { lang: "sl", data: seedSl, section: "A1", source: "sl_a1", base: 0 },
];
const SECTION_OF_SOURCE = Object.fromEntries(SEED_SETS.map((x) => [x.source, x.section]));
const MY_WORDS = "My words";
// Fallback sentences as [english, text, reading]
const FALLBACK = { zh: FALLBACK_ZH.map(([en, zh]) => [en, zh, null]), ja: [...FALLBACK_JA, ...FALLBACK_JA_N3], sl: FALLBACK_SL };

const SKILLS = ["write", "speak", "recall"];

const DEFAULTS = {
  course: "zh", // "zh" Mandarin (hanzi) or "ja" Japanese (kanji)
  section_zh: "", // section chosen for "Learn new words" ("" = first unfinished)
  section_ja: "",
  section_sl: "",
  ai_enabled: true,
  gemma_backend: "cpu",
  display_name: "",
  gemma_card_hidden: false,
  reminder_on: false, // daily practice reminder (Android app)
  reminder_time: "19:00", // "Add your AI tutor" card on the home screen dismissed
  gemma_preload: true, // load the model in the background when the app starts
  // Browser version: Gemma through an OpenAI-compatible server (e.g. Ollama on this computer).
  llm_base_url: "http://localhost:11434/v1",
  llm_model: "gemma4:e4b",
  llm_api_key: "",
  hf_repo: "litert-community/gemma-4-E2B-it-litert-lm",
  hf_token: "",
  speech_mode: "browser",
  daily_goal: 30,
  new_per_lesson: 5,
  review_size: 15,
  sentence_count: 4,
  leniency: 1.0,
  hint_after_misses: 3,
  tts_rate: 0.8,
};

class HttpError extends Error {
  constructor(status, msg) {
    super(msg);
    this.status = status;
  }
}

// ------------------------------------------------------------------ time helpers

const pad = (n) => String(n).padStart(2, "0");
const fmt = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
const dayKey = (d = new Date()) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const now = () => new Date();
const addMs = (ms) => new Date(Date.now() + ms);
const DAY = 86400000;

// ------------------------------------------------------------------ storage

let db = null;
let store = null;
let saveTimer = null;

function seedWords(set, startId) {
  const words = [];
  let id = startId;
  let pos = set.base;
  for (const unit of set.data.units) {
    for (const [hanzi, pinyin, english, gender] of unit.words) {
      words.push({ id: id++, lang: set.lang, section: set.section, hanzi, pinyin, english, gender: gender || null, unit: unit.name, position: pos++, source: set.source, extras: null, created_at: fmt(now()) });
    }
  }
  return words;
}

/** Streak plant: raindrops (streak freezes) and the days they saved. */
function freshGarden() {
  return { raindrops: 1, saved: [], awarded: [], notice: null, lostNoticed: null };
}

function freshDb() {
  return { version: 3, nextId: 1, words: [], cards: [], activity: {}, sentenceLog: [], settings: {}, garden: freshGarden(), lookalikes: {}, grammar: { learned: {} } };
}

/** Bring older saves up to date: tag languages/sections and add any new built-in word lists. */
function migrate() {
  for (const w of db.words) {
    w.lang ||= "zh";
    w.section ||= w.source === "custom" ? MY_WORDS : SECTION_OF_SOURCE[w.source] || "HSK 1";
  }
  for (const r of db.sentenceLog) r.lang ||= "zh";
  // Someone already studying keeps their level when new levels (e.g. Kana before N5) arrive.
  db.settings ||= {};
  const learned = new Set(db.cards.map((c) => c.word_id));
  for (const lang of new Set(SEED_SETS.map((x) => x.lang))) {
    const key = `section_${lang}`;
    const ws = db.words.filter((w) => w.lang === lang && w.source !== "custom").sort(byPosition);
    if (db.settings[key] || !ws.some((w) => learned.has(w.id))) continue;
    const open = ws.find((w) => !learned.has(w.id));
    if (open) db.settings[key] = open.section;
  }
  // Built-in words follow the current lists (matched by the word itself): a word an update moves
  // to another level (e.g. HSK 3 → new HSK 2) moves there with its progress; new words are added.
  const seeded = new Map();
  for (const set of SEED_SETS) for (const w of seedWords(set, 0)) if (!seeded.has(w.lang + w.hanzi)) seeded.set(w.lang + w.hanzi, w);
  const have = new Set();
  for (const w of db.words) {
    if (w.source === "custom") continue;
    const s = seeded.get(w.lang + w.hanzi);
    if (s) Object.assign(w, { section: s.section, source: s.source, unit: s.unit, position: s.position, pinyin: s.pinyin, english: s.english });
    have.add(w.lang + w.hanzi);
  }
  for (const w of seeded.values()) {
    if (have.has(w.lang + w.hanzi)) continue;
    w.id = db.nextId++;
    db.words.push(w);
  }
  db.version = 3;
}

export async function init(storage) {
  store = storage;
  const raw = await store.load();
  try {
    db = raw ? JSON.parse(raw) : null;
  } catch {
    db = null;
  }
  if (!db || !Array.isArray(db.words)) db = freshDb();
  migrate();
  db.garden ||= freshGarden();
  db.lookalikes ||= {};
  db.grammar ||= { learned: {} };
  db.stories ||= {};
  ai.configure(settingsAll);
  document.addEventListener("visibilitychange", () => document.visibilityState === "hidden" && flush());
}

function persist() {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(flush, 300);
}

function flush() {
  clearTimeout(saveTimer);
  if (store && db) store.save(JSON.stringify(db));
}

// ------------------------------------------------------------------ helpers

function settingsAll() {
  return { ...DEFAULTS, ...db.settings };
}

function settingsUpdate(values) {
  for (const [k, v] of Object.entries(values || {})) {
    if (!(k in DEFAULTS)) continue;
    const d = DEFAULTS[k];
    db.settings[k] = typeof d === "boolean" ? !!v : typeof d === "number" ? Number(v) : String(v ?? "").trim();
  }
  persist();
  return settingsAll();
}

function addActivity({ xp = 0, new_words = 0, reviews = 0, sentences = 0, seconds = 0 }) {
  const k = dayKey();
  const a = (db.activity[k] ||= { xp: 0, new_words: 0, reviews: 0, sentences: 0 });
  a.seconds = (a.seconds || 0) + seconds;
  a.xp += xp;
  a.new_words += new_words;
  a.reviews += reviews;
  a.sentences += sentences;
  if (xp > 0) awardRaindrop();
  persist();
}

const practiced = (k) => db.activity[k]?.xp > 0;
/** A day keeps the streak alive if you practised or a raindrop watered it. */
const covered = (k) => practiced(k) || db.garden.saved.includes(k);
const shiftDay = (d, n) => { const x = new Date(d); x.setDate(x.getDate() + n); return x; };

function streak() {
  let d = new Date();
  if (!covered(dayKey(d))) d = shiftDay(d, -1);
  let n = 0;
  while (covered(dayKey(d))) {
    if (practiced(dayKey(d))) n++;
    d = shiftDay(d, -1);
  }
  return n;
}

/** Longest streak ever (days saved by raindrops bridge the gap but don't count). */
function bestStreak() {
  const keys = [...new Set([...Object.keys(db.activity).filter(practiced), ...db.garden.saved])].sort();
  let best = 0, run = 0, prev = null;
  for (const k of keys) {
    const d = new Date(k + "T12:00:00");
    if (!(prev && Math.round((d - prev) / DAY) === 1)) run = 0;
    if (practiced(k)) run++;
    best = Math.max(best, run);
    prev = d;
  }
  return Math.max(best, streak());
}

const MAX_RAINDROPS = 2;
function awardRaindrop() {
  const g = db.garden;
  const today = dayKey();
  const s = streak();
  if (s > 0 && s % 7 === 0 && !g.awarded.includes(today) && g.raindrops < MAX_RAINDROPS) {
    g.raindrops++;
    g.awarded.push(today);
    g.notice = { kind: "earned", streak: s, raindrops: g.raindrops };
  }
}

/**
 * Called when the app opens: if you missed days since your last practice and have enough
 * raindrops to cover all of them, they water the plant on those days and the streak lives on.
 * Otherwise the streak is lost (raindrops are kept for next time).
 */
function waterMissedDays() {
  const g = db.garden;
  const today = new Date();
  let last = null;
  for (let i = 1; i <= 60; i++) {
    const k = dayKey(shiftDay(today, -i));
    if (covered(k)) { last = shiftDay(today, -i); break; }
  }
  if (!last) return;
  const missed = [];
  for (let d = shiftDay(last, 1); dayKey(d) < dayKey(today); d = shiftDay(d, 1)) missed.push(dayKey(d));
  if (!missed.length) return;
  const before = (() => { let n = 0, d = last; while (covered(dayKey(d))) { if (practiced(dayKey(d))) n++; d = shiftDay(d, -1); } return n; })();
  if (!before) return;
  if (missed.length <= g.raindrops) {
    g.raindrops -= missed.length;
    g.saved.push(...missed);
    g.saved = g.saved.slice(-60);
    g.notice = { kind: "saved", days: missed.length, streak: before, raindrops: g.raindrops };
  } else if (g.lostNoticed !== dayKey(last)) {
    g.lostNoticed = dayKey(last);
    g.notice = { kind: "lost", streak: before, raindrops: g.raindrops };
  }
  persist();
}

/** healthy (watered today) · thirsty (streak waiting for today's practice) · seed (no streak) */
function plantState() {
  if (practiced(dayKey())) return "healthy";
  return streak() > 0 ? "thirsty" : "seed";
}

const course = () => settingsAll().course;
/** Words / cards of the course being studied. */
const W = () => db.words.filter((w) => w.lang === course());
/** Sections of the current course in path order, with the one picked for new words. */
function sections() {
  const ids = learnedIds();
  const list = [];
  for (const w of W().sort(byPosition)) {
    let sec = list.find((x) => x.name === w.section);
    if (!sec) list.push((sec = { name: w.section, total: 0, learned: 0, custom: w.source === "custom" }));
    sec.total++;
    if (ids.has(w.id)) sec.learned++;
  }
  const chosen = settingsAll()[`section_${course()}`];
  const current = list.find((x) => x.name === chosen) || list.find((x) => x.learned < x.total && !x.custom) || list[0];
  return { list, current: current?.name };
}
const C = () => {
  const ids = new Set(W().map((w) => w.id));
  return db.cards.filter((c) => ids.has(c.word_id));
};
/** Cards of the selected level only (e.g. JLPT N3), so Practice doesn't repeat another level. */
const SC = () => {
  const secs = sections();
  if (secs.list.length < 2) return C();
  const ids = new Set(W().filter((w) => w.section === secs.current).map((w) => w.id));
  return db.cards.filter((c) => ids.has(c.word_id));
};
const wordById = (id) => db.words.find((w) => w.id === id);
/** The word's memory hook: one generated earlier, else the ready-made one for course words. */
// Ready-made hooks shipped with the app; Chinese examples get their pinyin here.
// Ready-made memory hooks + examples for every course word (www/extras/<lang>.json), loaded
// per language the first time they're needed so app start stays fast.
const READY = {};
const readyJobs = {};
function loadReady(lang) {
  readyJobs[lang] ||= fetch(`extras/${lang}.json`)
    .then((r) => (r.ok ? r.json() : {}))
    .catch(() => ({}))
    .then((x) => (READY[lang] = x));
  return readyJobs[lang];
}
function prebuilt(w) {
  const x = READY[w.lang]?.[w.hanzi];
  if (!x) return null;
  return w.lang === "zh" && x.example_zh && !x.example_pinyin ? { ...x, example_pinyin: toPinyin(x.example_zh) } : x;
}
const extrasOf = (w) => w.extras || prebuilt(w);
const cardsOf = (id) => db.cards.filter((c) => c.word_id === id);
const learnedIds = () => new Set(C().map((c) => c.word_id));
const byPosition = (a, b) => a.position - b.position || a.id - b.id;
const pick = ({ id, hanzi, pinyin, english, source }) => ({ id, hanzi, pinyin, english, source });
const shuffled = (arr) => arr.map((x) => [Math.random(), x]).sort((a, b) => a[0] - b[0]).map((x) => x[1]);

function getWord(id) {
  const w = wordById(Number(id));
  if (!w) throw new HttpError(404, "word not found");
  return { ...w };
}

function learnedWords() {
  const ids = learnedIds();
  return W().filter((w) => ids.has(w.id)).sort(byPosition).map(pick);
}

/** FSRS scheduling. grade 0..3 = Again, Hard, Good, Easy. */
function schedule(card, grade) {
  const rating = grade + 1;
  let { reps = 0, lapses = 0 } = card;
  // Cards reviewed with the old SM-2 scheduler carry over their interval and ease.
  const prev = card.stability ? card : card.reps > 0 ? fsrs.fromSm2(card) : {};
  const last = card.last_review ? new Date(card.last_review.replace(" ", "T")) : null;
  const elapsed = last ? (Date.now() - last) / DAY : 0;
  const { stability, difficulty } = fsrs.next(prev, rating, elapsed);
  let interval;
  let due;
  if (rating === 1) {
    lapses++;
    interval = 0;
    due = addMs(10 * 60000); // see it again later in the day
  } else {
    interval = fsrs.scheduleDays(stability, rating);
    due = addMs(interval * DAY);
    reps++;
  }
  return {
    stability: +stability.toFixed(4), difficulty: +difficulty.toFixed(3), interval: +interval.toFixed(3),
    reps, lapses, due: fmt(due), last_review: fmt(now()),
  };
}

// ------------------------------------------------------------------ sentences

// Sentences keep the field names zh (target text) and pinyin (reading) for both courses.
function decorate(sent, knownChars, source) {
  if (course() === "sl") {
    // Latin script: no handwriting guide, no separate reading.
    return { en: sent.en, zh: sent.zh, chars: [], pinyin: sent.reading || "", source };
  }
  if (course() === "ja") {
    return {
      en: sent.en,
      zh: sent.zh,
      // Kana are assumed known; kanji you haven't learned get a tracing guide.
      chars: [...writable(sent.zh)].map((c) => ({ c, known: !isKanji(c) || knownChars.has(c) })),
      pinyin: sent.reading || "",
      source,
    };
  }
  return {
    en: sent.en,
    zh: sent.zh,
    chars: [...hanziOnly(sent.zh)].map((c) => ({ c, known: knownChars.has(c) })),
    pinyin: toPinyin(sent.zh),
    source,
  };
}

function fallbackSentences(knownChars, count, avoid) {
  const all = FALLBACK[course()];
  const coverage = ([, zh]) => {
    if (course() === "sl") return 1;
    const chars = [...zh].filter(isKanji);
    return chars.length ? chars.filter((c) => knownChars.has(c)).length / chars.length : 1;
  };
  let cands = all.filter((s) => !avoid.has(s[1]));
  if (!cands.length) cands = all;
  cands = shuffled(cands).sort((a, b) => coverage(b) - coverage(a));
  return cands.slice(0, count).map(([en, zh, reading]) => ({ en, zh, reading }));
}



// ------------------------------------------------------------------ grammar

// Grammar points per level (www/grammar/<file>.json), loaded when first needed.
const GRAMMAR_FILE = { "HSK 1": "hsk1", "HSK 2": "hsk2", "HSK 3": "hsk3", "JLPT N5": "n5", "JLPT N4": "n4", "JLPT N3": "n3" };
const GRAMMAR = {};
const grammarJobs = {};
function loadGrammar(section) {
  const file = GRAMMAR_FILE[section];
  if (!file) return Promise.resolve(null);
  grammarJobs[file] ||= fetch(`grammar/${file}.json`)
    .then((r) => (r.ok ? r.json() : null))
    .catch(() => null)
    .then((g) => (GRAMMAR[section] = g?.points || null));
  return grammarJobs[file];
}
const PER_LESSON = 3;

/** Where grammar stands at the current level: lessons unlock as you learn the level's words. */
async function grammarStatus() {
  const sec = sections().current;
  const points = await loadGrammar(sec);
  if (!points?.length) return { available: false, section: sec };
  const words = W().filter((w) => w.section === sec);
  const ids = learnedIds();
  const learnedWords_ = words.filter((w) => ids.has(w.id)).length;
  const lessons = Math.ceil(points.length / PER_LESSON);
  // Spread the lessons over the level's words, so grammar and vocabulary finish together.
  const interval = Math.max(8, Math.floor(words.length / lessons));
  const first = Math.min(10, interval);
  const done = points.filter((p) => db.grammar.learned[p.id]).length;
  const lessonNo = Math.floor(done / PER_LESSON); // lessons finished
  const needed = first + lessonNo * interval;
  const finished = done >= points.length;
  const due = Object.entries(db.grammar.learned).filter(([id, c]) => c.due <= fmt(now()) && points.some((p) => p.id === id)).length;
  return {
    available: true, section: sec, total: points.length, learned: done, lessons, lesson: lessonNo + 1, finished,
    unlocked: !finished && learnedWords_ >= needed, words_to_next: Math.max(0, needed - learnedWords_), due,
  };
}

/** Characters of the words you've learned, to pick examples you can read. */
const knownChars = () => new Set(learnedWords().flatMap((w) => [...w.hanzi]));
function grammarPoint(p, known) {
  const score = (t) => { const cs = [...t].filter((c) => /[㐀-鿿]/.test(c)); return cs.length ? cs.filter((c) => known.has(c)).length / cs.length : 1; };
  const examples = p.examples
    .map((x) => ({ ...x, reading: course() === "zh" ? toPinyin(x.text) : x.reading || "" }))
    .sort((a, b) => score(b.text) - score(a.text));
  return { ...p, examples };
}


// ------------------------------------------------------------------ listening & reading

const STORY_FILE = GRAMMAR_FILE; // stories exist for the same levels as grammar
const STORIES = {};
const storyJobs = {};
function loadStories(section) {
  const file = STORY_FILE[section];
  if (!file) return Promise.resolve(null);
  storyJobs[file] ||= fetch(`stories/${file}.json`)
    .then((r) => (r.ok ? r.json() : null))
    .catch(() => null)
    .then((d) => (STORIES[section] = d?.stories || null));
  return storyJobs[file];
}
const isPunct = (c) => /^[\s。、，！？!?,.:;：；「」『』（）()…—"“”'‘’·・]+$/.test(c);
const WRITABLE_CHAR = /[㐀-鿿ぁ-ヿー]/;

/** Words of this course by spelling, for glossing text (longest match first). */
function courseLexicon() {
  const ids = learnedIds();
  const map = new Map();
  for (const w of W()) if (!map.has(w.hanzi)) map.set(w.hanzi, { id: w.id, reading: w.pinyin, meaning: w.english, learned: ids.has(w.id), level: w.section });
  return map;
}
/** Split text into tokens using the course's words (for stories Gemma writes). */
function tokenize(text, lex) {
  if (course() === "sl") return text.split(/(\s+|[.,!?;:])/).filter(Boolean).map((t) => [t, "", lex.get(t.toLowerCase())?.meaning || ""]);
  const out = [];
  for (let i = 0; i < text.length; ) {
    let len = Math.min(6, text.length - i);
    for (; len > 1; len--) if (lex.has(text.slice(i, i + len))) break;
    const t = text.slice(i, i + len);
    const w = lex.get(t);
    out.push([t, w?.reading || (course() === "zh" && !isPunct(t) ? toPinyin(t) : ""), w?.meaning || ""]);
    i += len;
  }
  return out;
}
/** Tokens annotated with whether the word is in the course and learned (for tap-to-look-up). */
function annotate(tokens, lex) {
  return tokens.map(([t, r, m]) => {
    const w = lex.get(t) || (course() === "sl" ? lex.get(t.toLowerCase()) : null);
    return { t, r, m: m || w?.meaning || "", punct: isPunct(t), word_id: w?.id || null, learned: !!w?.learned, level: w?.level || null };
  });
}
function knownShare(story, lex) {
  const toks = story.sentences.flatMap((s) => s.tokens).filter(([t]) => !isPunct(t));
  if (!toks.length) return 0;
  return Math.round((100 * toks.filter(([t]) => lex.get(t)?.learned).length) / toks.length);
}

// ------------------------------------------------------------------ your own words

/** A word you add yourself (one at a time or from an imported list). Throws with a readable reason. */
function makeWord(text, readingIn, englishIn, list = MY_WORDS, seen = new Set()) {
  const ja = course() === "ja";
  const sl = course() === "sl";
  const hanzi = sl ? normSl(text) : ja ? writable(text) : hanziOnly(text);
  const english = String(englishIn || "").trim();
  if (!hanzi) throw new HttpError(400, sl ? "No Slovenian word" : `No ${ja ? "Japanese" : "Chinese characters"} found`);
  if (!english) throw new HttpError(400, "Missing the English meaning");
  if (seen.has(hanzi) || W().some((w) => w.hanzi === hanzi)) throw new HttpError(409, `${hanzi} is already in your words`);
  let reading = String(readingIn || "").trim();
  if (ja) {
    reading = normKana(reading || (/^[\u3041-\u30ff]+$/.test(hanzi) ? hanzi : "")).replace(/[^\u3041-\u3096ー]/g, "");
    if (!reading) throw new HttpError(400, "Missing the reading (hiragana or romaji)");
  }
  return {
    id: 0, lang: course(), hanzi, pinyin: ja || sl ? reading : reading || toPinyin(hanzi), english,
    unit: list, section: list, position: 100000, source: "custom", extras: null, created_at: fmt(now()),
  };
}

/** One line of an imported list → [word, reading, meaning]. Tabs, ; | = " - " or commas separate the fields. */
function splitLine(line) {
  const sep = ["\t", ";", "|", "=", " - ", " – ", ","].find((x) => line.includes(x));
  const parts = (sep ? line.split(sep) : [line]).map((x) => x.trim()).filter(Boolean);
  const [word, ...rest] = parts;
  if (rest.length >= 2 && looksLikeReading(rest[0])) return [word, rest[0], rest.slice(1).join(sep === "," ? ", " : "; ")];
  return [word, "", rest.join(sep === "," ? ", " : "; ")];
}

/** Pinyin (tone marks or numbers), kana, romaji, or a Slovenian pronunciation such as ZDRA-vo. */
function looksLikeReading(x) {
  if (/^[\u3041-\u30ffー\s]+$/.test(x)) return true;
  if (course() === "zh") return /[āáǎàēéěèīíǐìōóǒòūúǔùǖǘǚǜü]|[a-z]+[1-5]/i.test(x) && x.split(/\s+/).length <= 6;
  if (course() === "ja") return /^[a-z' ]+$/i.test(x) && !/\b(to|the|a|an|of)\b/i.test(x) && x.split(/\s+/).length <= 3;
  return /^[A-ZČŠŽ]+(-[a-zčšžA-ZČŠŽ]+)+$|^[a-zčšž]+(-[A-ZČŠŽ]+)/.test(x);
}

// ------------------------------------------------------------------ routes

const routes = {
  "GET /api/home": async () => {
    waterMissedDays();
    const grammar = await grammarStatus();
    const s = settingsAll();
    const n = fmt(now());
    const ids = learnedIds();
    const secs = sections();
    const units = [];
    for (const w of W().filter((x) => x.section === secs.current).sort(byPosition)) {
      let u = units.find((x) => x.name === w.unit);
      if (!u) units.push((u = { name: w.unit, pos: w.position, total: 0, learned: 0 }));
      u.total++;
      if (ids.has(w.id)) u.learned++;
    }
    const weekStart = new Date();
    weekStart.setDate(weekStart.getDate() - 6);
    const ws = dayKey(weekStart);
    const cards = SC();
    const future = cards.filter((c) => c.due > n).map((c) => c.due).sort();
    const all = new Set(db.cards.map((c) => c.word_id));
    const courses = ["zh", "ja", "sl"].map((lang) => {
      const ws = db.words.filter((w) => w.lang === lang).sort(byPosition);
      // Levels of this course (e.g. JLPT N5, N3) for the level step after picking a language.
      const levels = [];
      for (const w of ws) {
        let l = levels.find((x) => x.name === w.section);
        if (!l) levels.push((l = { name: w.section, total: 0, learned: 0 }));
        l.total++;
        if (all.has(w.id)) l.learned++;
      }
      return { lang, total: ws.length, learned: ws.filter((w) => all.has(w.id)).length, levels, level: lang === course() ? secs.current : s[`section_${lang}`] || "" };
    });
    const today = db.activity[dayKey()] || {};
    const due = cards.filter((c) => c.due <= n).length;
    const newLeft = W().filter((w) => !ids.has(w.id) && w.section === secs.current).length;
    const plan = {
      reviews_done: today.reviews || 0,
      reviews_left: due,
      new_done: today.new_words || 0,
      new_left: Math.min(newLeft, Math.max(0, s.new_per_lesson - (today.new_words || 0))),
    };
    // ~15 s per review, ~1 min per new word (see, trace, write, quiz)
    plan.minutes = Math.ceil((plan.reviews_left * 15 + plan.new_left * 60) / 60);
    const notice = db.garden.notice;
    if (notice) { db.garden.notice = null; persist(); }
    return {
      streak: streak(),
      plant: plantState(),
      raindrops: db.garden.raindrops,
      saved_days: db.garden.saved.slice(-14),
      garden_notice: notice,
      plan,
      lookalikes: (LOOKALIKES[course()] || []).length,
      grammar,
      xp_today: db.activity[dayKey()]?.xp || 0,
      daily_goal: s.daily_goal,
      course: course(),
      courses,
      sections: secs.list,
      section: secs.current,
      due,
      due_by_skill: Object.fromEntries(SKILLS.map((k) => [k, cards.filter((c) => c.skill === k && c.due <= n).length])),
      next_due: future[0] || null,
      learned: ids.size,
      total: W().length,
      units,
      week: Object.entries(db.activity).filter(([d]) => d >= ws).map(([day, a]) => ({ day, xp: a.xp })),
    };
  },

  "GET /api/words": () => {
    // Group cards by word once (a course has thousands of words and cards).
    const byWord = new Map();
    for (const c of db.cards) {
      if (!byWord.has(c.word_id)) byWord.set(c.word_id, []);
      byWord.get(c.word_id).push(c);
    }
    return W().sort(byPosition).map((w) => {
      const cs = byWord.get(w.id) || [];
      return {
        id: w.id, hanzi: w.hanzi, pinyin: w.pinyin, english: w.english, gender: w.gender || null, unit: w.unit, section: w.section, source: w.source,
        cards: cs.length,
        due: cs.length ? cs.map((c) => c.due).sort()[0] : null,
        strength: cs.length ? cs.reduce((a, c) => a + c.interval, 0) / cs.length : null,
        lapses: cs.length ? cs.reduce((a, c) => a + c.lapses, 0) : null,
      };
    });
  },

  "POST /api/words": (_, body) => {
    const w = makeWord(body.hanzi, body.pinyin, body.english);
    w.id = db.nextId++;
    db.words.push(w);
    persist();
    return { ...w };
  },

  // Import a list (pasted or from a .txt/.csv file): one word per line, e.g. "朋友, péng you, friend".
  // preview: true only parses and reports; otherwise the words are added as their own level.
  "POST /api/words/import": (_, body) => {
    const list = String(body.list || "").trim().slice(0, 40) || MY_WORDS;
    if (SEED_SETS.some((x) => x.section === list)) throw new HttpError(400, `“${list}” is a built-in level — pick another name`);
    const added = [];
    const skipped = [];
    const seen = new Set();
    for (const raw of String(body.text || "").split(/\r?\n/)) {
      const line = raw.trim();
      if (!line || line.startsWith("#")) continue;
      try {
        const [word, reading, english] = splitLine(line);
        const w = makeWord(word, reading, english, list, seen);
        seen.add(w.hanzi);
        added.push(w);
      } catch (e) {
        skipped.push({ line, reason: e.message });
      }
    }
    if (!body.preview) {
      added.forEach((w, i) => { w.id = db.nextId++; w.position = 100000 + i; });
      db.words.push(...added);
      persist();
    }
    return { list, added: added.map(pick), skipped };
  },

  "DELETE /api/lists/:name": ({ name }) => {
    const list = name;
    const gone = new Set(W().filter((w) => w.source === "custom" && w.section === list).map((w) => w.id));
    db.words = db.words.filter((w) => !gone.has(w.id));
    db.cards = db.cards.filter((c) => !gone.has(c.word_id));
    if (settingsAll()[`section_${course()}`] === list) db.settings[`section_${course()}`] = "";
    persist();
    return { ok: true, removed: gone.size };
  },

  "POST /api/words/ai-fill": async (_, body) => {
    const d = await ai.fillWord(body.query);
    if (!d.hanzi) throw new HttpError(422, "Couldn't figure that word out");
    return course() === "zh" ? { ...d, pinyin: toPinyin(d.hanzi) } : d;
  },

  "POST /api/words/pinyin": (_, body) => ({ pinyin: course() === "zh" ? toPinyin(body.query) : "" }),

  "DELETE /api/words/:id": ({ id }) => {
    db.words = db.words.filter((w) => w.id !== Number(id));
    db.cards = db.cards.filter((c) => c.word_id !== Number(id));
    persist();
    return { ok: true };
  },

  "POST /api/words/:id/reset": ({ id }) => {
    db.cards = db.cards.filter((c) => c.word_id !== Number(id));
    persist();
    return { ok: true };
  },

  "GET /api/words/:id/extras": async ({ id }, _, query) => {
    const w = wordById(Number(id));
    if (!w) throw new HttpError(404, "word not found");
    // Older versions sometimes saved hooks written in Chinese/Japanese: regenerate those.
    const readable = (x) => x && ai.EXTRAS_ENGLISH.every((k) => !x[k] || ai.isEnglish(x[k]));
    if (!query.get("refresh")) {
      if (w.extras && readable(w.extras)) return w.extras;
      await loadReady(w.lang);
      const ready = prebuilt(w);
      if (ready) return ready;
    }
    const d = await ai.wordExtras(w);
    if (d.example_zh && course() === "zh") d.example_pinyin = toPinyin(d.example_zh);
    w.extras = d;
    persist();
    return d;
  },

  "GET /api/learn/next": async (_, __, query) => {
    await loadReady(course());
    const n = Number(query.get("n")) || settingsAll().new_per_lesson;
    const ids = learnedIds();
    const sec = sections().current;
    const words = W().filter((w) => !ids.has(w.id) && w.section === sec).sort(byPosition).slice(0, n).map((w) => ({ ...w, extras: extrasOf(w) }));
    // Distractors from the same level, so N3 words are quizzed against N3 words, kana against kana.
    const level = W().filter((w) => w.section === sec);
    return { words, pool: shuffled(level.length >= 12 ? level : W()).slice(0, 40).map(pick) };
  },

  "POST /api/learn/complete": (_, body) => {
    const firstDue = fmt(addMs(20 * 3600000));
    for (const wid of body.word_ids || []) {
      for (const skill of SKILLS) {
        if (!db.cards.some((c) => c.word_id === wid && c.skill === skill)) {
          db.cards.push({ word_id: wid, skill, ease: 2.5, interval: 0.8, due: firstDue, reps: 0, lapses: 0, last_review: null });
        }
      }
    }
    addActivity({ xp: body.xp || 0, new_words: (body.word_ids || []).length });
    return { ok: true, streak: streak() };
  },

  "GET /api/review/session": (_, __, query) => {
    const size = settingsAll().review_size;
    const n = fmt(now());
    const only = (query.get("skills") || "").split(",").filter(Boolean);
    const pool = only.length ? SC().filter((c) => only.includes(c.skill)) : SC();
    const cards = query.get("extra")
      ? pool.sort((a, b) => b.lapses * 2 - b.interval - (a.lapses * 2 - a.interval) || (a.due < b.due ? -1 : 1)).slice(0, size)
      : pool.filter((c) => c.due <= n).sort((a, b) => (a.due < b.due ? -1 : 1)).slice(0, size);
    const items = shuffled(cards.map((c) => ({ skill: c.skill, word: getWord(c.word_id) })));
    for (let i = 1; i < items.length; i++) {
      if (items[i].word.id !== items[i - 1].word.id) continue;
      const j = items.findIndex((x, k) => k > i && x.word.id !== items[i - 1].word.id);
      if (j > 0) [items[i], items[j]] = [items[j], items[i]];
    }
    const known = learnedWords();
    const learned = [...new Set([...shuffled(known).slice(0, 60), ...known.filter((w) => w.source === "kana")])];
    return { items, pool: learned.length >= 8 ? learned : shuffled(W()).slice(0, 60).map(pick) };
  },

  "POST /api/review/answer": (_, body) => {
    const grade = Math.max(0, Math.min(3, Number(body.grade)));
    const card = db.cards.find((c) => c.word_id === body.word_id && c.skill === body.skill);
    if (!card) throw new HttpError(404, "card not found");
    Object.assign(card, schedule(card, grade));
    const xp = grade >= 2 ? 3 : 1;
    addActivity({ xp, reviews: 1 });
    return { xp, ...card };
  },

  "GET /api/reminder-info": () => {
    const st = settingsAll();
    return { on: st.reminder_on, time: st.reminder_time, streak: streak(), practiced_today: practiced(dayKey()), due: SC().filter((c) => c.due <= fmt(now())).length };
  },

  "GET /api/garden": () => {
    const days = [];
    for (let i = 13; i >= 0; i--) {
      const k = dayKey(shiftDay(new Date(), -i));
      days.push({ day: k, state: practiced(k) ? "watered" : db.garden.saved.includes(k) ? "saved" : "missed" });
    }
    return { streak: streak(), best: bestStreak(), plant: plantState(), raindrops: db.garden.raindrops, max_raindrops: MAX_RAINDROPS, days };
  },

  // Grammar: lessons of 3 points that unlock while you learn the level's words.
  "GET /api/grammar/status": () => grammarStatus(),

  "GET /api/grammar/lesson": async () => {
    const st = await grammarStatus();
    if (!st.available) throw new HttpError(404, "No grammar for this level yet");
    if (!st.unlocked) throw new HttpError(409, st.finished ? "You've learned all the grammar of this level!" : `Learn ${st.words_to_next} more words to unlock the next grammar lesson`);
    const points = GRAMMAR[st.section];
    const known = knownChars();
    const next = points.filter((p) => !db.grammar.learned[p.id]).slice(0, PER_LESSON).map((p) => grammarPoint(p, known));
    // Other points of the level (learned first) as wrong answers in the quiz.
    const others = points.filter((p) => !next.some((n) => n.id === p.id)).map((p) => ({ id: p.id, short: p.short, mark: p.examples[0].mark }));
    return { lesson: st.lesson, points: next, others };
  },

  // Every grammar point of the level, with the learned ones fully shown (the "grammar book").
  "GET /api/grammar/book": async () => {
    const st = await grammarStatus();
    if (!st.available) return { ...st, points: [] };
    const known = knownChars();
    return { ...st, points: GRAMMAR[st.section].map((p) => (db.grammar.learned[p.id] ? { ...grammarPoint(p, known), learned: true } : { id: p.id, title: p.title, learned: false })) };
  },

  "POST /api/grammar/complete": (_, body) => {
    const tomorrow = fmt(addMs(20 * 3600000));
    for (const id of body.ids || []) db.grammar.learned[id] ||= { due: tomorrow, reps: 0, lapses: 0, last_review: null };
    addActivity({ xp: body.xp || 0 });
    persist();
    return { ok: true, streak: streak() };
  },

  // Grammar due for practice (learned points of the current level).
  "GET /api/grammar/review": async (_, __, query) => {
    const st = await grammarStatus();
    if (!st.available) return { items: [], others: [] };
    const points = GRAMMAR[st.section];
    const n = fmt(now());
    const known = knownChars();
    const learned = points.filter((p) => db.grammar.learned[p.id]);
    const due = learned.filter((p) => db.grammar.learned[p.id].due <= n).sort((a, b) => (db.grammar.learned[a.id].due < db.grammar.learned[b.id].due ? -1 : 1));
    const pool = query.get("extra") ? shuffled(learned) : due;
    const items = pool.slice(0, Number(query.get("n")) || 3).map((p) => grammarPoint(p, known));
    const others = points.map((p) => ({ id: p.id, short: p.short, mark: p.examples[0].mark, learned: !!db.grammar.learned[p.id] }));
    return { items, others };
  },

  "POST /api/grammar/answer": (_, body) => {
    const card = db.grammar.learned[body.id];
    if (!card) throw new HttpError(404, "grammar point not learned");
    Object.assign(card, schedule(card, Math.max(0, Math.min(3, Number(body.grade)))));
    const xp = body.grade >= 2 ? 3 : 1;
    addActivity({ xp, reviews: 1 });
    persist();
    return { xp };
  },

  // A fresh example of a grammar point, built by Gemma from the words you know.
  "POST /api/grammar/example": async (_, body) => {
    const sec = sections().current;
    const p = (await loadGrammar(sec))?.find((x) => x.id === body.id);
    if (!p) throw new HttpError(404, "grammar point not found");
    const known = shuffled(learnedWords()).slice(0, 60).map((w) => w.hanzi);
    const avoid = Array.isArray(body.avoid) ? body.avoid.slice(-12).map(String) : p.examples.map((e) => e.text);
    const x = await ai.grammarExample(p, known, avoid);
    if (course() === "zh") x.reading = toPinyin(x.text);
    return x;
  },

  // Listening: dictation and "what did you hear?" from example sentences of words you know.
  "GET /api/listen/session": async (_, __, query) => {
    await loadReady(course());
    const n = Number(query.get("n")) || 6;
    const known = knownChars();
    const sl = course() === "sl";
    const seen = new Set();
    const pool = [];
    for (const w of shuffled(learnedWords())) {
      const full = wordById(w.id);
      const x = extrasOf(full);
      if (!x?.example_zh || !x.example_en || seen.has(x.example_zh)) continue;
      const writable = [...x.example_zh].filter((c) => WRITABLE_CHAR.test(c));
      if (!sl && (writable.length < 2 || writable.length > 10)) continue;
      if (sl && x.example_zh.split(/\s+/).length > 8) continue;
      seen.add(x.example_zh);
      pool.push({
        text: x.example_zh,
        reading: course() === "zh" ? toPinyin(x.example_zh) : x.example_pinyin || "",
        en: x.example_en,
        chars: writable.map((c) => ({ c, known: known.has(c) || /[ぁ-ヿー]/.test(c) })),
        word: w.hanzi,
      });
      if (pool.length >= n * 3) break;
    }
    // Prefer sentences whose characters you mostly know.
    const share = (it) => (it.chars.length ? it.chars.filter((c) => c.known).length / it.chars.length : 1);
    pool.sort((a, b) => share(b) - share(a));
    const items = pool.slice(0, n);
    return { items, others: pool.map((p) => p.en) };
  },

  "POST /api/listen/answer": (_, body) => {
    const xp = body.ok ? 3 : 1;
    addActivity({ xp, reviews: 0 });
    return { xp };
  },

  // Graded stories for the current level (+ ones Gemma wrote from your words).
  "GET /api/stories": async () => {
    const sec = sections().current;
    const list = (await loadStories(sec)) || [];
    const lex = courseLexicon();
    const mine = (db.storiesAi || []).filter((s) => s.lang === course());
    return {
      section: sec,
      stories: [...mine, ...list].map((s) => ({
        id: s.id, title: s.title, title_en: s.title_en, sentences: s.sentences.length, known: knownShare(s, lex),
        done: !!db.stories[s.id]?.done, best: db.stories[s.id]?.best ?? null, ai: !!s.ai,
      })),
    };
  },

  "GET /api/stories/:id": async ({ id }) => {
    const sec = sections().current;
    const s = (db.storiesAi || []).find((x) => x.id === id) || ((await loadStories(sec)) || []).find((x) => x.id === id);
    if (!s) throw new HttpError(404, "story not found");
    const lex = courseLexicon();
    return {
      ...s,
      sentences: s.sentences.map((x) => ({ ...x, reading: course() === "zh" ? toPinyin(x.text) : x.reading || "", tokens: annotate(x.tokens, lex) })),
    };
  },

  "POST /api/stories/:id/done": ({ id }, body) => {
    const score = Math.max(0, Math.min(100, Number(body.score) || 0));
    const st = (db.stories[id] ||= { done: false, best: 0 });
    st.done = true;
    st.best = Math.max(st.best || 0, score);
    addActivity({ xp: body.xp || 5 });
    persist();
    return { ok: true, streak: streak() };
  },

  // A new short story from the words you know, written by Gemma.
  "POST /api/stories/generate": async () => {
    const known = shuffled(learnedWords()).slice(0, 50).map((w) => w.hanzi);
    if (known.length < 10) throw new HttpError(409, "Learn at least 10 words first");
    const d = await ai.story(known);
    const lex = courseLexicon();
    const story = {
      id: `ai-${Date.now().toString(36)}`, ai: true, lang: course(), title: d.title, title_en: d.title_en,
      sentences: d.sentences.map((x) => ({ text: x.text, reading: x.reading || "", en: x.en, tokens: tokenize(x.text, lex) })),
      questions: d.questions,
    };
    db.storiesAi = [story, ...(db.storiesAi || [])].slice(0, 6);
    persist();
    return { id: story.id };
  },

  // Tone practice (Chinese): learned one- and two-syllable words.
  "GET /api/tones/session": (_, __, query) => {
    if (course() !== "zh") throw new HttpError(404, "Tone practice is for Chinese");
    const n = Number(query.get("n")) || 8;
    const items = shuffled(learnedWords())
      .map((w) => ({ id: w.id, hanzi: w.hanzi, pinyin: w.pinyin, english: w.english, syllables: w.pinyin.split(/\s+/).filter(Boolean) }))
      .filter((w) => w.syllables.length >= 1 && w.syllables.length <= 2 && [...w.hanzi].length === w.syllables.length)
      .slice(0, n);
    return { items };
  },

  // Look-alike characters (未/末, 己/已 …): groups with learned characters and past mistakes come first.
  "GET /api/lookalikes/session": (_, __, query) => {
    const groups = LOOKALIKES[course()] || [];
    const n = Math.min(Number(query.get("n")) || 8, groups.length);
    const known = new Set(learnedWords().flatMap((w) => [...w.hanzi]));
    const scored = groups.map((g, i) => {
      const key = g.chars.map((c) => c[0]).join("");
      const st = db.lookalikes[key] || { seen: 0, wrong: 0 };
      const knownN = g.chars.filter((c) => known.has(c[0])).length;
      return { g, key, score: knownN * 2 + st.wrong * 3 - st.seen * 0.5 + Math.random() * 2, i };
    });
    const items = scored.sort((a, b) => b.score - a.score).slice(0, n).map(({ g, key }) => ({
      key,
      hint: g.hint,
      chars: g.chars.map(([c, meaning, reading]) => ({ c, meaning, reading: course() === "zh" ? toPinyin(c) : reading || "", known: known.has(c) })),
    }));
    return { items: shuffled(items) };
  },

  "POST /api/lookalikes/answer": (_, body) => {
    const st = (db.lookalikes[body.key] ||= { seen: 0, wrong: 0 });
    st.seen++;
    if (!body.ok) st.wrong++;
    const xp = body.ok ? 2 : 1;
    addActivity({ xp, reviews: 0 });
    return { xp };
  },

  "POST /api/check/pinyin": (_, body) =>
    course() === "sl"
      ? compareSpelling(String(body.answer || ""), String(body.expected || ""))
      : course() === "ja"
      ? compareReading(String(body.answer || ""), String(body.expected || ""))
      : comparePinyin(String(body.answer || ""), String(body.expected || "")),

  "GET /api/sentences/session": async (_, __, query) => {
    const s = settingsAll();
    const useAI = query.get("use_ai") !== "0";
    const known = learnedWords();
    const knownChars = new Set(known.flatMap((w) => [...w.hanzi]));
    const recent = db.sentenceLog.filter((r) => r.lang === course()).slice(-40).map((r) => r.hanzi).reverse();
    const lapsesBy = {};
    for (const c of C()) lapsesBy[c.word_id] = (lapsesBy[c.word_id] || 0) + c.lapses;
    const focus = Object.entries(lapsesBy).sort((a, b) => b[1] - a[1]).slice(0, 6).map(([id]) => pick(wordById(Number(id))));
    let note = null;
    let sentences = [];
    if (useAI && s.ai_enabled && known.length >= 5) {
      try {
        const gen = await ai.generateSentences(known, focus, s.sentence_count, recent);
        sentences = gen.slice(0, s.sentence_count).map((x) => decorate(x, knownChars, "ai"));
      } catch (e) {
        console.warn(e);
        note = `Gemma unavailable — using built-in sentences (${e.message})`;
      }
    } else if (useAI && s.ai_enabled) {
      note = "Learn at least 5 words for AI sentences — using built-in ones for now.";
    }
    if (!sentences.length) sentences = fallbackSentences(knownChars, s.sentence_count, new Set(recent)).map((x) => decorate(x, knownChars, "builtin"));
    return { sentences, note };
  },

  "POST /api/sentences/grade": async (_, body) => {
    if (course() === "sl") {
      const r = compareSpelling(body.answer, body.zh);
      if (r.result === "correct") return { correct: true, score: 100, feedback: "Perfect!", corrected: body.zh, by: "exact" };
      if (r.result === "tones_wrong") return { correct: true, score: 90, feedback: "Correct — just mind č, š and ž.", corrected: body.zh, by: "exact" };
    }
    if (course() === "ja") {
      const strip = (t) => (t || "").replace(/[\s。、？！?!.,]/g, "");
      if (strip(body.answer) && strip(body.answer) === strip(body.zh)) return { correct: true, score: 100, feedback: "Perfect!", corrected: body.zh, by: "exact" };
      if (body.reading && normKana(body.answer) === normKana(body.reading)) return { correct: true, score: 100, feedback: "Correct!", corrected: body.zh, by: "reading" };
    }
    const ans = hanziOnly(body.answer);
    const ref = hanziOnly(body.zh);
    if (course() === "zh" && ans && ans === ref) return { correct: true, score: 100, feedback: "Perfect!", corrected: body.zh, by: "exact" };
    if (course() === "zh" && !ans) {
      const r = comparePinyin(body.answer, toPinyin(body.zh));
      if (r.result === "correct") return { correct: true, score: 100, feedback: "Correct pinyin!", corrected: body.zh, by: "pinyin" };
      if (r.result === "tones_wrong") return { correct: false, score: 70, feedback: "Right syllables — check your tones.", corrected: body.zh, by: "pinyin" };
    }
    if (ai.available()) {
      try {
        return { ...(await ai.gradeTranslation(body.en, body.zh, body.answer)), by: "ai" };
      } catch (e) {
        console.warn("AI grading unavailable", e);
      }
    }
    return { correct: false, score: 0, feedback: "Doesn't match the expected answer.", corrected: body.zh, by: "exact" };
  },

  "POST /api/sentences/log": (_, body) => {
    db.sentenceLog.push({ lang: course(), english: body.en, hanzi: body.zh, mode: body.mode, score: body.score, source: body.source || "", created_at: fmt(now()) });
    if (db.sentenceLog.length > 300) db.sentenceLog = db.sentenceLog.slice(-300);
    const xp = body.score >= 80 ? 5 : 2;
    addActivity({ xp, sentences: 1 });
    return { xp };
  },

  "POST /api/speech/compare": (_, body) =>
    course() === "sl"
      ? compareSpokenSl(body.heard, body.expected)
      : course() === "ja" ? compareSpokenJa(body.heard, body.expected, body.reading) : compareSpoken(body.heard, body.expected),

  "POST /api/speech/assess": () => {
    throw new ai.AIError("Gemma audio isn't available in the app — switch pronunciation to Android speech recognition");
  },

  "GET /api/settings": () => {
    const s = settingsAll();
    return { ...s, hf_token: s.hf_token ? "••••" : "", llm_api_key: s.llm_api_key ? "••••" : "" };
  },

  "PUT /api/settings": (_, body) => {
    if (body.hf_token === "••••") delete body.hf_token;
    if (body.llm_api_key === "••••") delete body.llm_api_key;
    settingsUpdate(body);
    return routes["GET /api/settings"]();
  },

  // The settings screen only sees a masked token; the model download needs the real one.
  "GET /api/gemma/token": () => ({ token: db.settings.hf_token || "" }),

  "GET /api/ai/status": () => ai.status(),
  "POST /api/ai/test": () => ai.test(),

  "GET /api/stats": () => {
    // Enough history for the 3-month progress chart (and the period before it, for comparison).
    const days = Object.entries(db.activity).sort((a, b) => (a[0] < b[0] ? 1 : -1)).slice(0, 200).map(([day, a]) => ({ day, ...a }));
    const skills = SKILLS.map((skill) => {
      const cs = C().filter((c) => c.skill === skill);
      return { skill, n: cs.length, avg_interval: cs.length ? cs.reduce((a, c) => a + c.interval, 0) / cs.length : 0, lapses: cs.reduce((a, c) => a + c.lapses, 0) };
    }).filter((k) => k.n);
    const hardest = W()
      .map((w) => ({ ...pick(w), lapses: cardsOf(w.id).reduce((a, c) => a + c.lapses, 0) }))
      .filter((w) => w.lapses > 0)
      .sort((a, b) => b.lapses - a.lapses)
      .slice(0, 10);
    // "My journey" figures
    const all = Object.entries(db.activity).sort((a, b) => (a[0] < b[0] ? -1 : 1));
    const totalXp = all.reduce((a, [, d]) => a + (d.xp || 0), 0);
    const month = dayKey().slice(0, 7);
    const best = bestStreak();
    return {
      days,
      skills,
      hardest,
      streak: streak(),
      best_streak: best,
      total_xp: totalXp,
      level: Math.floor(Math.sqrt(totalXp / 20)) + 1,
      learned_total: learnedIds().size,
      sentences_total: all.reduce((a, [, d]) => a + (d.sentences || 0), 0),
      study_seconds_month: all.filter(([day]) => day.startsWith(month)).reduce((a, [, d]) => a + (d.seconds || 0), 0),
      first_day: all.find(([, d]) => d.xp > 0)?.[0] || null,
      saved_days: db.garden.saved,
      plant: plantState(),
    };
  },

  "POST /api/activity/time": (_, body) => {
    const seconds = Math.max(0, Math.min(Number(body.seconds) || 0, 3 * 3600));
    addActivity({ seconds });
    return { ok: true };
  },

  "GET /api/backup": () => ({ app: "hanzi-home", exported_at: fmt(now()), ...db, settings: { ...db.settings, hf_token: "", llm_api_key: "" } }),

  "POST /api/backup/restore": (_, body) => {
    if (!body || body.app !== "hanzi-home" || !Array.isArray(body.words) || !Array.isArray(body.cards)) throw new HttpError(400, "That isn't a Hanzi Home backup");
    const token = db.settings.hf_token;
    const { app: _a, exported_at: _e, ...rest } = body;
    db = { ...freshDb(), ...rest, settings: { ...rest.settings, hf_token: token || "" } };
    migrate();
    flush();
    return { ok: true };
  },
};

const compiled = Object.entries(routes).map(([key, fn]) => {
  const [method, path] = key.split(" ");
  const names = [];
  const re = new RegExp("^" + path.replace(/:(\w+)/g, (_, n) => (names.push(n), "([^/]+)")) + "$");
  return { method, re, names, fn };
});

export async function handle(url, { method = "GET", body } = {}) {
  const u = new URL(url, "http://local");
  for (const r of compiled) {
    if (r.method !== method) continue;
    const m = u.pathname.match(r.re);
    if (!m) continue;
    const params = Object.fromEntries(r.names.map((n, i) => [n, decodeURIComponent(m[i + 1])]));
    return await r.fn(params, body || {}, u.searchParams);
  }
  throw new HttpError(404, `No route for ${method} ${u.pathname}`);
}
