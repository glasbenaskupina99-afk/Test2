// The journey (3.0): a level of the course as one path through the garden, shown on the home
// screen. A level's themed units are grouped into chapters of about 60 words (kana: by script,
// then by dakuten), and each chapter is a row of stones: 5 new words at a time, a grammar lesson
// where the grammar rule unlocks it, and a story once 85 % of its words have been learned.
// Every chapter ends with a gate: put sentences with its words back in order.
// This module only plans the path; whether a stone is done is worked out by the backend from
// what has been learned, so older progress and placement tests show up as stones already walked.

export const STONE_WORDS = 5;
export const STORY_KNOWN = 0.85;
/** Chapters grow to about this many words (a short leftover at the end joins the one before). */
const CHAPTER_WORDS = 60;
/** In the kana level a chapter starts with each script and again where the dakuten (が, ガ …) begin. */
const KANA_CHAPTER = /^(Hiragana|Katakana): (a, ka|ga, za, da)\b/;

export interface PlanWord { id: number; unit: string }
export interface PlanPoint { id: string; title: string }
/** A story and the number of the level's words (in course order) needed to know 85 % of it. */
export interface PlanStory { id: string; title: string; title_en: string; need: number }

export interface Stone {
  id: string;
  kind: "words" | "grammar" | "story" | "gate";
  chapter: number;
  /** words: the stone's words, in course order */
  ids?: number[];
  /** grammar: which lesson of the level (0-based) and its points */
  lesson?: number;
  points?: string[];
  /** story */
  story?: string;
  title?: string;
  title_en?: string;
}
export interface Chapter { n: number; units: string[]; ids: number[]; stones: Stone[] }
export interface Plan { section: string; chapters: Chapter[] }

/** The level's units (in course order) grouped into chapters. */
export function groupChapters(units: { name: string; ids: number[] }[], kana = false): { units: string[]; ids: number[] }[] {
  const out: { units: string[]; ids: number[] }[] = [];
  for (const u of units) {
    const last = out[out.length - 1];
    if (!last || (kana ? KANA_CHAPTER.test(u.name) : last.ids.length >= CHAPTER_WORDS)) out.push({ units: [u.name], ids: [...u.ids] });
    else {
      last.units.push(u.name);
      last.ids.push(...u.ids);
    }
  }
  if (!kana && out.length > 1 && out[out.length - 1].ids.length < CHAPTER_WORDS / 2) {
    const tail = out.pop();
    out[out.length - 1].units.push(...tail.units);
    out[out.length - 1].ids.push(...tail.ids);
  }
  return out;
}

/**
 * How many of the level's words (in course order) must be learned to know `share` of a story.
 * `at` holds, for every word of the story, its 1-based place in the level's order: 0 for a word of
 * an earlier level (already known), Infinity for one the level doesn't teach.
 */
export function wordsNeeded(at: number[], share = STORY_KNOWN): number {
  if (!at.length) return 0;
  const sorted = [...at].sort((a, b) => a - b);
  return sorted[Math.max(0, Math.ceil(share * sorted.length) - 1)];
}

/** Grammar lesson k unlocks after this many of the level's words — the rule grammarStatus uses. */
export function grammarUnlocks(words: number, points: number, perLesson = 3): number[] {
  const lessons = Math.ceil(points / perLesson);
  if (!lessons) return [];
  const interval = Math.max(8, Math.floor(words / lessons));
  const first = Math.min(10, interval);
  return Array.from({ length: lessons }, (_, k) => first + k * interval);
}

/** The whole path of one level. `words` are the level's words in course order. */
export function buildPlan({ section, words, points = [], stories = [], perLesson = 3 }: { section: string; words: PlanWord[]; points?: PlanPoint[]; stories?: PlanStory[]; perLesson?: number }): Plan {
  const units: { name: string; ids: number[] }[] = [];
  for (const w of words) {
    let u = units[units.length - 1];
    if (!u || u.name !== w.unit) units.push((u = { name: w.unit, ids: [] }));
    u.ids.push(w.id);
  }
  const chapters: Chapter[] = groupChapters(units, section === "Kana").map((c, n) => ({ n, ...c, stones: [] }));
  const order = new Map(words.map((w, i) => [w.id, i + 1]));

  // Word stones, and how many of the level's words have been met once each one is walked.
  const ends: { at: number; stone: Stone }[] = [];
  for (const c of chapters) {
    for (let i = 0; i < c.ids.length; i += STONE_WORDS) {
      const ids = c.ids.slice(i, i + STONE_WORDS);
      const stone: Stone = { id: `w${ids[0]}`, kind: "words", chapter: c.n, ids };
      c.stones.push(stone);
      ends.push({ at: order.get(ids[ids.length - 1]), stone });
    }
  }
  if (!ends.length) return { section, chapters };
  /** The word stone after which at least n of the level's words have been learned. */
  const after = (n: number) => ends.find((e) => e.at >= n) || ends[ends.length - 1];
  const extra: { after: Stone; stone: Stone }[] = [];

  grammarUnlocks(words.length, points.length, perLesson).forEach((n, k) => {
    const pts = points.slice(k * perLesson, (k + 1) * perLesson);
    const e = after(n);
    extra.push({ after: e.stone, stone: { id: `g${section}:${k}`, kind: "grammar", chapter: e.stone.chapter, lesson: k, points: pts.map((p) => p.id), title: pts.map((p) => p.title).join(" · ") } });
  });

  // Stories where 85 % of their words are known; one per chapter, a second one moves on to the
  // middle of the next chapter that has none (by then even more of its words are known).
  const withStory = new Set<number>();
  for (const st of [...stories].sort((a, b) => a.need - b.need)) {
    let at = Number.isFinite(st.need) ? after(st.need).stone : ends[ends.length - 1].stone;
    if (withStory.has(at.chapter)) {
      const free = chapters.find((c) => c.n > at.chapter && !withStory.has(c.n));
      if (free) at = free.stones[Math.floor((free.stones.length - 1) / 2)];
    }
    withStory.add(at.chapter);
    extra.push({ after: at, stone: { id: `s${st.id}`, kind: "story", chapter: at.chapter, story: st.id, title: st.title, title_en: st.title_en } });
  }

  for (const c of chapters) {
    const out: Stone[] = [];
    for (const s of c.stones) {
      out.push(s);
      for (const x of extra) if (x.after === s) out.push({ ...x.stone, chapter: c.n });
    }
    // The chapter gate: build sentences with the chapter's words. (Kana gets its own gate later.)
    if (section !== "Kana") out.push({ id: `x${section}:${c.n}`, kind: "gate", chapter: c.n });
    c.stones = out;
  }
  return { section, chapters };
}
