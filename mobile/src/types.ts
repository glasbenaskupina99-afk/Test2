// The app's data, as stored on the device (localStorage / Preferences) and synced between devices.

export type Lang = "zh" | "ja" | "sl";
export type Skill = "write" | "speak" | "recall";

/** Memory hook and example sentence for a word (ready-made or written by Gemma). */
export interface Extras {
  mnemonic?: string;
  components?: string;
  example_zh?: string;
  example_pinyin?: string;
  example_en?: string;
  [key: string]: unknown;
}

export interface Word {
  id: number;
  lang: Lang;
  /** Section (level or list): "HSK 1", "JLPT N5", "A1", or the name of your own list. */
  section: string;
  /** The word as written (characters for Chinese/Japanese, the word itself for Slovenian). */
  hanzi: string;
  /** Pinyin, kana reading or pronunciation guide. */
  pinyin: string;
  english: string;
  gender?: string | null;
  unit?: string;
  position: number;
  /** "custom" for your own words, otherwise the built-in list it came from. */
  source: string;
  extras?: Extras | null;
  created_at?: string;
}

/** Spaced-repetition state of one skill of one word (FSRS; older saves carry SM-2 fields). */
export interface Card {
  word_id: number;
  skill: Skill;
  due: string;
  interval: number;
  reps: number;
  lapses: number;
  last_review: string | null;
  ease?: number;
  stability?: number;
  difficulty?: number;
}

/** FSRS state of a learned grammar point. */
export interface GrammarCard {
  due: string;
  interval?: number;
  reps?: number;
  lapses?: number;
  last_review?: string | null;
  stability?: number;
  difficulty?: number;
}

export interface Activity {
  xp: number;
  new_words?: number;
  reviews?: number;
  sentences?: number;
  seconds?: number;
}

export interface Settings {
  course: Lang;
  section_zh: string;
  section_ja: string;
  section_sl: string;
  ai_enabled: boolean;
  gemma_backend: string;
  display_name: string;
  gemma_card_hidden: boolean;
  reminder_on: boolean;
  reminder_time: string;
  gemma_preload: boolean;
  llm_base_url: string;
  llm_model: string;
  llm_api_key: string;
  hf_repo: string;
  hf_token: string;
  speech_mode: string;
  ui_lang: string;
  daily_goal: number;
  new_per_lesson: number;
  review_size: number;
  sentence_count: number;
  leniency: number;
  hint_after_misses: number;
  tts_rate: number;
  [key: string]: unknown;
}

export interface SyncState {
  code: string;
  version: number;
  hash: string;
  last: string | null;
  changed_at: string;
  deleted: string[];
  error?: string;
}

/** Encrypted cloud backup: the key stays on the device (and with you), the server only sees ciphertext. */
export interface BackupState {
  key: string;
  last: string | null;
  error?: string;
  auto: boolean;
}

export interface ExamResult {
  level: string;
  lang: string;
  short: boolean;
  at: string;
  total: number;
  max: number;
  passed: boolean;
  parts: unknown[];
}

export interface ForestWeek {
  write_perfect: number;
  revived: number;
  revived_ids: number[];
  spoken: number;
  finished: number;
  [key: string]: unknown;
}

export interface Db {
  version: number;
  nextId: number;
  words: Word[];
  cards: Card[];
  activity: Record<string, Activity>;
  sentenceLog: any[];
  settings: Partial<Settings>;
  garden: { raindrops: number; saved: string[]; awarded: string[]; notice: any; lostNoticed: any };
  lookalikes: Record<string, { seen: number; wrong: number }>;
  grammar: { learned: Record<string, GrammarCard> };
  stories?: Record<string, { done: boolean; best: number; [key: string]: unknown }>;
  storiesAi?: any[];
  forest?: { weeks: Record<string, ForestWeek>; glade: any[] };
  exams?: ExamResult[];
  placement?: Record<string, { at: string; known: number }>;
  sync?: SyncState | null;
  backup?: BackupState | null;
  /** Signed in with an account (2.0): only the email is kept on the device. */
  account?: { email: string; since: string } | null;
  [key: string]: unknown;
}
