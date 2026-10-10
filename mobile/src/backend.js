// The whole server (app/main.py) re-implemented to run inside the app.
// Data is a single JSON document persisted on the phone.
import seedZh from "../../app/data/hsk1.json";
import seedJa from "../../app/data/japanese_n5.json";
import seedJaN3 from "../../app/data/japanese_n3.json";
import FALLBACK_ZH from "../../app/data/sentences.json";
import FALLBACK_JA from "../../app/data/japanese_sentences.json";
import FALLBACK_JA_N3 from "../../app/data/japanese_n3_sentences.json";
import * as ai from "./ai.js";
import { compareSpoken, comparePinyin, hanziOnly, toPinyin } from "./pinyin.js";
import { compareReading, compareSpokenJa, isKanji, normKana, writable } from "./japanese.js";

// Built-in word lists. Each is a "section" of its course (e.g. JLPT N5 / JLPT N3).
const SEED_SETS = [
  { lang: "zh", data: seedZh, section: "HSK 1", source: "hsk1", base: 0 },
  { lang: "ja", data: seedJa, section: "JLPT N5", source: "n5", base: 0 },
  { lang: "ja", data: seedJaN3, section: "JLPT N3", source: "n3", base: 10000 },
];
const SECTION_OF_SOURCE = Object.fromEntries(SEED_SETS.map((x) => [x.source, x.section]));
const MY_WORDS = "My words";
// Fallback sentences as [english, text, reading]
const FALLBACK = { zh: FALLBACK_ZH.map(([en, zh]) => [en, zh, null]), ja: [...FALLBACK_JA, ...FALLBACK_JA_N3] };

const SKILLS = ["write", "speak", "recall"];

const DEFAULTS = {
  course: "zh", // "zh" Mandarin (hanzi) or "ja" Japanese (kanji)
  section_zh: "", // section chosen for "Learn new words" ("" = first unfinished)
  section_ja: "",
  ai_enabled: true,
  gemma_backend: "cpu",
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
    for (const [hanzi, pinyin, english] of unit.words) {
      words.push({ id: id++, lang: set.lang, section: set.section, hanzi, pinyin, english, unit: unit.name, position: pos++, source: set.source, extras: null, created_at: fmt(now()) });
    }
  }
  return words;
}

function freshDb() {
  return { version: 3, nextId: 1, words: [], cards: [], activity: {}, sentenceLog: [], settings: {} };
}

/** Bring older saves up to date: tag languages/sections and add any new built-in word lists. */
function migrate() {
  for (const w of db.words) {
    w.lang ||= "zh";
    w.section ||= w.source === "custom" ? MY_WORDS : SECTION_OF_SOURCE[w.source] || "HSK 1";
  }
  for (const r of db.sentenceLog) r.lang ||= "zh";
  for (const set of SEED_SETS) {
    if (db.words.some((w) => w.lang === set.lang && w.source === set.source)) continue;
    const words = seedWords(set, db.nextId);
    db.words.push(...words);
    db.nextId += words.length;
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

function addActivity({ xp = 0, new_words = 0, reviews = 0, sentences = 0 }) {
  const k = dayKey();
  const a = (db.activity[k] ||= { xp: 0, new_words: 0, reviews: 0, sentences: 0 });
  a.xp += xp;
  a.new_words += new_words;
  a.reviews += reviews;
  a.sentences += sentences;
  persist();
}

function streak() {
  const d = new Date();
  if (!(db.activity[dayKey(d)]?.xp > 0)) d.setDate(d.getDate() - 1);
  let n = 0;
  while (db.activity[dayKey(d)]?.xp > 0) {
    n++;
    d.setDate(d.getDate() - 1);
  }
  return n;
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
    if (!sec) list.push((sec = { name: w.section, total: 0, learned: 0 }));
    sec.total++;
    if (ids.has(w.id)) sec.learned++;
  }
  const chosen = settingsAll()[`section_${course()}`];
  const current = list.find((x) => x.name === chosen) || list.find((x) => x.learned < x.total && x.name !== MY_WORDS) || list[0];
  return { list, current: current?.name };
}
const C = () => {
  const ids = new Set(W().map((w) => w.id));
  return db.cards.filter((c) => ids.has(c.word_id));
};
const wordById = (id) => db.words.find((w) => w.id === id);
const cardsOf = (id) => db.cards.filter((c) => c.word_id === id);
const learnedIds = () => new Set(C().map((c) => c.word_id));
const byPosition = (a, b) => a.position - b.position || a.id - b.id;
const pick = ({ id, hanzi, pinyin, english }) => ({ id, hanzi, pinyin, english });
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

function schedule(card, grade) {
  let { ease, interval, reps, lapses } = card;
  let due;
  if (grade === 0) {
    lapses++;
    ease = Math.max(1.3, ease - 0.2);
    interval = 0;
    due = addMs(10 * 60000);
  } else {
    if (grade === 1) {
      ease = Math.max(1.3, ease - 0.15);
      interval = Math.max(1, interval * 1.2);
    } else if (grade === 2) {
      interval = interval < 1 ? 1 : interval < 3 ? 3 : interval * ease;
    } else {
      ease += 0.15;
      interval = interval < 1 ? 3 : interval * ease * 1.3;
    }
    interval = Math.min(interval, 365);
    due = addMs(interval * DAY);
    reps++;
  }
  return { ease: +ease.toFixed(3), interval: +interval.toFixed(3), reps, lapses, due: fmt(due), last_review: fmt(now()) };
}

// ------------------------------------------------------------------ sentences

// Sentences keep the field names zh (target text) and pinyin (reading) for both courses.
function decorate(sent, knownChars, source) {
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
    const chars = [...zh].filter(isKanji);
    return chars.length ? chars.filter((c) => knownChars.has(c)).length / chars.length : 1;
  };
  let cands = all.filter((s) => !avoid.has(s[1]));
  if (!cands.length) cands = all;
  cands = shuffled(cands).sort((a, b) => coverage(b) - coverage(a));
  return cands.slice(0, count).map(([en, zh, reading]) => ({ en, zh, reading }));
}

// ------------------------------------------------------------------ routes

const routes = {
  "GET /api/home": () => {
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
    const cards = C();
    const future = cards.filter((c) => c.due > n).map((c) => c.due).sort();
    const courses = ["zh", "ja"].map((lang) => {
      const ws = db.words.filter((w) => w.lang === lang);
      const all = new Set(db.cards.map((c) => c.word_id));
      return { lang, total: ws.length, learned: ws.filter((w) => all.has(w.id)).length };
    });
    return {
      streak: streak(),
      xp_today: db.activity[dayKey()]?.xp || 0,
      daily_goal: s.daily_goal,
      course: course(),
      courses,
      sections: secs.list,
      section: secs.current,
      due: cards.filter((c) => c.due <= n).length,
      next_due: future[0] || null,
      learned: ids.size,
      total: W().length,
      units,
      week: Object.entries(db.activity).filter(([d]) => d >= ws).map(([day, a]) => ({ day, xp: a.xp })),
    };
  },

  "GET /api/words": () =>
    W().sort(byPosition).map((w) => {
      const cs = cardsOf(w.id);
      return {
        id: w.id, hanzi: w.hanzi, pinyin: w.pinyin, english: w.english, unit: w.unit, section: w.section, source: w.source,
        cards: cs.length,
        due: cs.length ? cs.map((c) => c.due).sort()[0] : null,
        strength: cs.length ? cs.reduce((a, c) => a + c.interval, 0) / cs.length : null,
        lapses: cs.length ? cs.reduce((a, c) => a + c.lapses, 0) : null,
      };
    }),

  "POST /api/words": (_, body) => {
    const ja = course() === "ja";
    const hanzi = ja ? writable(body.hanzi) : hanziOnly(body.hanzi);
    if (!hanzi || !String(body.english || "").trim()) throw new HttpError(400, `Need ${ja ? "Japanese" : "Chinese characters"} and an English meaning`);
    if (W().some((w) => w.hanzi === hanzi)) throw new HttpError(409, `${hanzi} is already in your list`);
    let reading = String(body.pinyin || "").trim();
    if (ja) {
      reading = normKana(reading || (/^[\u3041-\u30ff]+$/.test(hanzi) ? hanzi : "")).replace(/[^\u3041-\u3096ー]/g, "");
      if (!reading) throw new HttpError(400, "Enter the reading in hiragana or romaji");
    }
    const w = {
      id: db.nextId++, lang: course(), hanzi, pinyin: ja ? reading : reading || toPinyin(hanzi), english: body.english.trim(),
      unit: MY_WORDS, section: MY_WORDS, position: 100000, source: "custom", extras: null, created_at: fmt(now()),
    };
    db.words.push(w);
    persist();
    return { ...w };
  },

  "POST /api/words/ai-fill": async (_, body) => {
    const d = await ai.fillWord(body.query);
    if (!d.hanzi) throw new HttpError(422, "Couldn't figure that word out");
    return course() === "ja" ? d : { ...d, pinyin: toPinyin(d.hanzi) };
  },

  "POST /api/words/pinyin": (_, body) => ({ pinyin: course() === "ja" ? "" : toPinyin(body.query) }),

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
    if (w.extras && !query.get("refresh")) return w.extras;
    const d = await ai.wordExtras(w);
    if (d.example_zh && course() === "zh") d.example_pinyin = toPinyin(d.example_zh);
    w.extras = d;
    persist();
    return d;
  },

  "GET /api/learn/next": (_, __, query) => {
    const n = Number(query.get("n")) || settingsAll().new_per_lesson;
    const ids = learnedIds();
    const sec = sections().current;
    const words = W().filter((w) => !ids.has(w.id) && w.section === sec).sort(byPosition).slice(0, n).map((w) => ({ ...w }));
    return { words, pool: shuffled(W()).slice(0, 40).map(pick) };
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
    const cards = query.get("extra")
      ? C().sort((a, b) => b.lapses * 2 - b.interval - (a.lapses * 2 - a.interval) || (a.due < b.due ? -1 : 1)).slice(0, size)
      : C().filter((c) => c.due <= n).sort((a, b) => (a.due < b.due ? -1 : 1)).slice(0, size);
    const items = shuffled(cards.map((c) => ({ skill: c.skill, word: getWord(c.word_id) })));
    for (let i = 1; i < items.length; i++) {
      if (items[i].word.id !== items[i - 1].word.id) continue;
      const j = items.findIndex((x, k) => k > i && x.word.id !== items[i - 1].word.id);
      if (j > 0) [items[i], items[j]] = [items[j], items[i]];
    }
    const learned = shuffled(learnedWords()).slice(0, 60);
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

  "POST /api/check/pinyin": (_, body) =>
    course() === "ja"
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
    course() === "ja" ? compareSpokenJa(body.heard, body.expected, body.reading) : compareSpoken(body.heard, body.expected),

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

  "GET /api/ai/status": () => ai.status(),
  "POST /api/ai/test": () => ai.test(),

  "GET /api/stats": () => {
    const days = Object.entries(db.activity).sort((a, b) => (a[0] < b[0] ? 1 : -1)).slice(0, 60).map(([day, a]) => ({ day, ...a }));
    const skills = SKILLS.map((skill) => {
      const cs = C().filter((c) => c.skill === skill);
      return { skill, n: cs.length, avg_interval: cs.length ? cs.reduce((a, c) => a + c.interval, 0) / cs.length : 0, lapses: cs.reduce((a, c) => a + c.lapses, 0) };
    }).filter((k) => k.n);
    const hardest = W()
      .map((w) => ({ ...pick(w), lapses: cardsOf(w.id).reduce((a, c) => a + c.lapses, 0) }))
      .filter((w) => w.lapses > 0)
      .sort((a, b) => b.lapses - a.lapses)
      .slice(0, 10);
    return { days, skills, hardest, streak: streak() };
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
