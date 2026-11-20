// Tiles for "build the sentence" (the chapter gate of the journey): a sentence cut into words to
// put back in order, and one wrong tile as a distractor in later chapters. The closing . ! ? stays
// in place, it isn't a tile. Slovenian splits at spaces; Chinese and Japanese have none, so they are
// cut by the longest match with the course's words (Japanese particles apart, verb endings joined).

const END = /[.!?。！？…]+$/u;
const COMMA = /^[,，、]$/u;
const KANJI = /[㐀-鿿]/u;
const HIRAGANA = /[ぁ-ゟ]/u;
const KATAKANA = /[゠-ヿー]/u;
/** Japanese particles that stand on their own between words (longest first). */
const PARTICLES = ["から", "まで", "より", "は", "が", "を", "に", "で", "と", "も", "へ", "の", "や"];
/** The copula and its forms are a tile of their own: 病院 | です. */
const COPULA = ["ではありません", "じゃありません", "でしょう", "でした", "です"];

export interface Cut { tiles: string[]; end: string }

function split(text: string): { body: string; end: string } {
  const t = String(text || "").trim();
  const end = t.match(END)?.[0] || "";
  return { body: t.slice(0, t.length - end.length).trim(), end };
}

/** Slovenian: words at spaces. The first word is lower-cased unless it is a name (Ana, Ljubljana). */
export function cutSl(text: string, names: Set<string> = new Set()): Cut {
  const { body, end } = split(text);
  const tiles = body.split(/\s+/).filter(Boolean);
  if (tiles.length && !names.has(tiles[0].replace(/[,;:]$/, ""))) tiles[0] = tiles[0][0].toLowerCase() + tiles[0].slice(1);
  return { tiles, end };
}

/** Chinese or Japanese: the longest course word at each place (up to 6 characters). */
export function cutCjk(text: string, words: Set<string>, lang: "zh" | "ja"): Cut {
  const { body, end } = split(text);
  const s = [...body.replace(/\s+/g, "")];
  const out: { t: string; known: boolean; particle?: boolean }[] = [];
  let i = 0;
  while (i < s.length) {
    const ch = s[i];
    const last = out[out.length - 1];
    if (COMMA.test(ch)) {
      if (last) last.t += ch;
      i++;
      continue;
    }
    let len = 0;
    for (let n = Math.min(6, s.length - i); n >= 2 && !len; n--) if (words.has(s.slice(i, i + n).join(""))) len = n;
    if (len) {
      out.push({ t: s.slice(i, i + len).join(""), known: true });
      i += len;
      continue;
    }
    if (lang === "ja") {
      const at = (x: string) => s.slice(i, i + x.length).join("") === x;
      // A word still being built (食べ…, 行き…) keeps its kana: endings like ます, ました, て.
      const building = last && !last.known && !last.particle && !COMMA.test(last.t.slice(-1));
      const cop = last && COPULA.find(at);
      if (cop) {
        out.push({ t: cop, known: true, particle: true });
        i += cop.length;
        continue;
      }
      // で right after a verb being built is its te-form (読んで, 泳いで), not the particle.
      const p = !(building && ch === "で" && HIRAGANA.test(last.t.slice(-1))) && last && PARTICLES.find(at);
      if (p) {
        out.push({ t: p, known: true, particle: true });
        i += p.length;
        continue;
      }
      if (building && (HIRAGANA.test(ch) || (KANJI.test(ch) && KANJI.test(last.t.slice(-1))))) {
        last.t += ch;
        i++;
        continue;
      }
      // Kana right after a kanji word (食 + べる) belongs to it.
      if (HIRAGANA.test(ch) && last && !last.particle && KANJI.test(last.t.slice(-1))) {
        last.t += ch;
        last.known = false;
        i++;
        continue;
      }
      if (KATAKANA.test(ch) && last && !last.known && KATAKANA.test(last.t.slice(-1))) {
        last.t += ch;
        i++;
        continue;
      }
    }
    if (words.has(ch)) out.push({ t: ch, known: true });
    else out.push({ t: ch, known: false });
    i++;
  }
  return { tiles: out.map((x) => x.t), end };
}

const ZH_EXTRA = ["的", "了", "不", "很", "吗", "在", "是", "有", "也", "都", "和", "去"];
const JA_EXTRA = ["は", "が", "を", "に", "で", "と", "も", "へ"];
/** Slovenian endings swapped for a wrong form of the same word: delam → delaš, hiša → hišo. */
const SL_SWAP: Record<string, string> = { m: "š", š: "m", a: "o", o: "a", e: "i", i: "e", u: "a" };

/** One wrong tile that looks like it could belong: another ending, another little word or particle. */
export function extraTile(tiles: string[], lang: string, seed = 0): string | null {
  const has = new Set(tiles.map((t) => t.toLowerCase()));
  if (lang === "sl") {
    const order = tiles.map((_, k) => (k + seed) % tiles.length);
    for (const k of order) {
      const t = tiles[k];
      const m = t.match(/^(\p{L}{3,})([maoeiuš])$/u);
      if (!m) continue;
      const w = m[1] + SL_SWAP[m[2]];
      if (!has.has(w.toLowerCase())) return w;
    }
    return null;
  }
  const list = lang === "ja" ? JA_EXTRA : ZH_EXTRA;
  const free = list.filter((x) => !has.has(x));
  return free.length ? free[seed % free.length] : null;
}

/** Whether tiles put in this order make the sentence (case and spacing aside). */
export function rightOrder(answer: string[], expected: string[], lang: string): boolean {
  const join = (a: string[]) => (lang === "sl" ? a.join(" ").toLowerCase() : a.join(""));
  return join(answer) === join(expected);
}

/**
 * Whether a cut makes a good puzzle: 3–6 Slovenian words or 3–8 Chinese/Japanese tiles, no stray
 * syllable (a lone ん or す where the cut went wrong), no dialogue (A：… B：…).
 */
export function goodCut(cut: Cut, lang: string): boolean {
  const n = cut.tiles.length;
  if (n < 3 || n > (lang === "sl" ? 6 : 8)) return false;
  if (lang === "sl") return cut.tiles.every((t) => /\p{L}/u.test(t));
  if (cut.tiles.some((t) => /[A-Za-z:：]/.test(t))) return false;
  if (lang === "ja") return cut.tiles.every((t) => t.length > 1 || KANJI.test(t) || PARTICLES.includes(t));
  return true;
}
