// Slovenian helpers: spelling checks (with/without č š ž), grading of typed sentences,
// spoken-answer scoring and finding the basic form of a word (kavo → kava).

const strip = (t) => t.replace(/č/g, "c").replace(/ć/g, "c").replace(/š/g, "s").replace(/ž/g, "z").replace(/đ/g, "d");

/** Lower case, no punctuation, single spaces (digits stay: "ura je 8"). */
export const normSl = (text) =>
  String(text || "")
    .toLowerCase()
    .replace(/[^a-zčćšžđ0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();

// ------------------------------------------------------------------ numbers
// Speech recognition (and some learners) write "2" where the sentence has "dva" / "dve".
const NUMBERS: Record<number, string[]> = {
  0: ["nič"], 1: ["ena", "en", "eno", "enega", "eni"], 2: ["dva", "dve"], 3: ["tri"], 4: ["štiri"], 5: ["pet"], 6: ["šest"], 7: ["sedem"], 8: ["osem"], 9: ["devet"], 10: ["deset"],
  11: ["enajst"], 12: ["dvanajst"], 13: ["trinajst"], 14: ["štirinajst"], 15: ["petnajst"], 16: ["šestnajst"], 17: ["sedemnajst"], 18: ["osemnajst"], 19: ["devetnajst"],
  20: ["dvajset"], 30: ["trideset"], 40: ["štirideset"], 50: ["petdeset"], 60: ["šestdeset"], 70: ["sedemdeset"], 80: ["osemdeset"], 90: ["devetdeset"], 100: ["sto"], 1000: ["tisoč"],
};
/** Word form(s) of a number (0–1000), including compound ones ("25" → "petindvajset"). */
function numberForms(n: number): string[] | null {
  if (NUMBERS[n]) return NUMBERS[n];
  if (n > 20 && n < 100) {
    const u = n % 10;
    return [`${NUMBERS[u][0]}in${NUMBERS[n - u][0]}`];
  }
  if (n > 100 && n < 1000) {
    const h = Math.floor(n / 100);
    const rem = n % 100;
    const hWord = h === 1 ? "sto" : h === 2 ? "dvesto" : `${NUMBERS[h][0]}sto`;
    if (!rem) return [hWord];
    const tail = numberForms(rem);
    return tail ? tail.map((r) => `${hWord} ${r}`) : null;
  }
  return null;
}

/** "stane 2 evra" → "stane dva evra", choosing the form the expected sentence uses (dva / dve). */
function digitsToWords(text: string, expected: string): string {
  if (!/\d/.test(text)) return text;
  const want = new Set(expected.split(" "));
  return text
    .split(" ")
    .map((tok) => {
      if (!/^\d+$/.test(tok)) return tok;
      const forms = numberForms(Number(tok));
      return forms ? forms.find((f) => want.has(f)) || forms[0] : tok;
    })
    .join(" ");
}

/** correct | tones_wrong (only č/š/ž missing) | wrong — same result names as the pinyin check. */
export function compareSpelling(answer, expected) {
  const e = normSl(expected);
  const a = digitsToWords(normSl(answer), e);
  if (a && a === e) return { result: "correct" };
  if (a && strip(a) === strip(e)) return { result: "tones_wrong" };
  return { result: "wrong" };
}

// ------------------------------------------------------------------ typed sentences
// A sentence can be right in more than one way: "Lačen sem" / "Lačna sem" (the speaker's
// gender), with or without "jaz", with or without the question word "ali", and often in
// another word order. `alts` are other accepted translations of the same English sentence.

const NOT_2SG = /^(danes|čas|cas|glas|pas|vas|nas|les|pes|res)$/;
const NOT_1PL = /^(samo|pismo)$/;

/** Without the words that may be left out or added freely: subject pronouns and opening "ali" / "a". */
function core(norm: string): string[] {
  const raw = norm.split(" ").filter(Boolean);
  // "ti" / "mi" can also mean "to you" / "to me" ("Kako ti je ime?", "Ali mi lahko pomagaš?"):
  // only drop them when the verb is in their person ("živiš", "si", "gremo", "smo").
  const has2sg = raw.some((w) => w === "si" || w === "nisi" || w === "boš" || w === "bos" || (w.length >= 3 && !NOT_2SG.test(w) && /(aš|iš|eš|as|is|es)$/.test(w)));
  const has1pl = raw.some((w) => w === "smo" || w === "nismo" || (w.length >= 4 && !NOT_1PL.test(w) && w.endsWith("mo")));
  const words = raw.filter((w) => w !== "jaz" && w !== "vi" && !(w === "ti" && has2sg) && !(w === "mi" && has1pl));
  if (words.length > 1 && (words[0] === "ali" || words[0] === "a")) words.shift();
  return words;
}
const sorted = (words: string[]) => words.slice().sort().join(" ");

function distance(a: string, b: string): number {
  if (Math.abs(a.length - b.length) > 2) return 3;
  let prev = Array.from({ length: b.length + 1 }, (_, j) => j);
  for (let i = 1; i <= a.length; i++) {
    const cur = [i];
    for (let j = 1; j <= b.length; j++) cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    prev = cur;
  }
  return prev[b.length];
}

/**
 * Grades a typed Slovenian sentence without the AI.
 * Returns { correct, score, feedback, corrected } — or null when it is plainly different
 * (the caller may then ask the AI, or mark it wrong).
 */
export function gradeSentenceSl(answer: string, expected: string, alts: string[] = []) {
  const targets = [expected, ...alts].map(normSl).filter(Boolean);
  if (!targets.length) return null;
  const raw = normSl(answer);
  if (!raw) return null;
  const forms = targets.map((t) => ({ t, a: digitsToWords(raw, t) }));
  const done = (score: number, feedback: string, correct = true, corrected = expected) => ({ correct, score, feedback, corrected });
  const shown = (t: string) => [expected, ...alts].find((x) => normSl(x) === t) || expected;

  // 1) Exactly the expected sentence, or another accepted one.
  if (forms[0].a === forms[0].t) return done(100, "Perfect!");
  for (const { t, a } of forms.slice(1)) if (a === t) return done(100, "Correct — that's another good way to say it.", true, shown(t));
  // 2) The same, give or take "jaz" / "ali".
  for (const { t, a } of forms) if (core(a).join(" ") === core(t).join(" ")) return done(100, "Correct!", true, shown(t));
  // 3) Only č, š, ž are missing.
  for (const { t, a } of forms) if (strip(core(a).join(" ")) === strip(core(t).join(" "))) return done(90, "Correct — just mind č, š and ž.", true, shown(t));
  // 4) The right words in another order: Slovenian word order is flexible.
  for (const { t, a } of forms) if (core(a).length > 1 && sorted(core(a)) === sorted(core(t))) return done(90, "Correct — the more usual word order is shown below.", true, shown(t));
  for (const { t, a } of forms) if (core(a).length > 1 && strip(sorted(core(a))) === strip(sorted(core(t)))) return done(85, "Right words — mind č, š, ž and the word order.", true, shown(t));
  // 5) One slip of the keyboard: not right yet, but say how close it was.
  for (const { t, a } of forms) {
    const x = strip(core(a).join(" "));
    const y = strip(core(t).join(" "));
    if (y.length >= 6 && distance(x, y) === 1) return done(70, "Almost — one letter is off.", false, shown(t));
  }
  return null;
}

// ------------------------------------------------------------------ spoken answers

function spoken(heard: string, expected: string) {
  const e = normSl(expected);
  const exp = e.split(" ").filter(Boolean);
  const got = strip(digitsToWords(normSl(heard), e)).split(" ").filter(Boolean);
  const n = exp.length;
  const m = got.length;
  const dp = Array.from({ length: n + 1 }, () => new Array(m + 1).fill(0));
  for (let i = n - 1; i >= 0; i--)
    for (let j = m - 1; j >= 0; j--) dp[i][j] = strip(exp[i]) === got[j] ? dp[i + 1][j + 1] + 1 : Math.max(dp[i + 1][j], dp[i][j + 1]);
  const result = exp.map((w) => ({ expected: w, status: "missing" }));
  let i = 0;
  let j = 0;
  while (i < n && j < m) {
    if (strip(exp[i]) === got[j]) { result[i].status = "ok"; i++; j++; }
    else if (dp[i + 1][j] >= dp[i][j + 1]) i++;
    else j++;
  }
  const ok = result.filter((r) => r.status === "ok").length;
  return { score: Math.round((100 * ok) / Math.max(n, 1)), syllables: result, heard_pinyin: heard };
}

/**
 * Score recognised speech against the expected words (accent-insensitive). With `alts`
 * (other accepted sentences, e.g. "Lačna sem" for "Lačen sem") the best match counts.
 */
export function compareSpokenSl(heard, expected, alts: string[] = []) {
  let best = spoken(heard, expected);
  for (const alt of alts) {
    if (best.score === 100) break;
    const r = spoken(heard, alt);
    if (r.score > best.score) best = r;
  }
  return best;
}

// ------------------------------------------------------------------ basic forms (kavo → kava)
// Slovenian words change their endings; the course lists the basic form. This finds it for the
// forms a beginner meets, by trying the usual endings — a candidate only counts when it is a
// word of the course, so a wrong guess simply isn't found.

const IRREGULAR: Record<string, string> = {
  sem: "biti", si: "biti", je: "biti", smo: "biti", ste: "biti", so: "biti", sva: "biti", sta: "biti", bil: "biti", bila: "biti", bilo: "biti", bili: "biti", bile: "biti",
  bom: "biti", boš: "biti", bo: "biti", bomo: "biti", boste: "biti", bodo: "biti", bova: "biti", bosta: "biti",
  nisem: "biti", nisi: "biti", ni: "biti", nismo: "biti", niste: "biti", niso: "biti",
  grem: "iti", greš: "iti", gre: "iti", gremo: "iti", greste: "iti", gredo: "iti", grejo: "iti", greva: "iti", gresta: "iti", šel: "iti", šla: "iti", šli: "iti", šle: "iti",
  ima: "imeti", imajo: "imeti", imata: "imeti",
  nimam: "imeti", nimaš: "imeti", nima: "imeti", nimamo: "imeti", nimate: "imeti", nimajo: "imeti",
  hočem: "hoteti", hočeš: "hoteti", hoče: "hoteti", hočemo: "hoteti", hočete: "hoteti", hočejo: "hoteti",
  nočem: "hoteti", nočeš: "hoteti", noče: "hoteti",
  morem: "moči", moreš: "moči", more: "moči", moremo: "moči", morete: "moči", morejo: "moči",
  vem: "vedeti", veš: "vedeti", ve: "vedeti", vemo: "vedeti", veste: "vedeti", vejo: "vedeti", vedo: "vedeti",
  jem: "jesti", ješ: "jesti", jemo: "jesti", jeste: "jesti", jedo: "jesti", jedel: "jesti", jedla: "jesti",
  berem: "brati", bereš: "brati", bere: "brati", beremo: "brati", berete: "brati", berejo: "brati",
  pišem: "pisati", pišeš: "pisati", piše: "pisati", pišemo: "pisati", pišete: "pisati", pišejo: "pisati",
  rečem: "reči", rečeš: "reči", reče: "reči", rekel: "reči", rekla: "reči",
  pridem: "priti", prideš: "priti", pride: "priti", pridemo: "priti", pridete: "priti", pridejo: "priti", prišel: "priti", prišla: "priti", prišli: "priti",
  spim: "spati", spiš: "spati", spi: "spati", spimo: "spati", spite: "spati", spijo: "spati",
  plešem: "plesati", plešeš: "plesati", pleše: "plesati", plešemo: "plesati", plešete: "plesati", plešejo: "plesati",
  pojem: "peti", poješ: "peti", poje: "peti", pojemo: "peti", pojete: "peti", pojejo: "peti",
  cerkve: "cerkev", cerkvi: "cerkev", cerkvijo: "cerkev", s: "z", h: "k",
  vstanem: "vstati", vstaneš: "vstati", vstane: "vstati", vstanemo: "vstati",
  mene: "jaz", meni: "jaz", me: "jaz", menoj: "jaz", tebe: "ti", tebi: "ti", te: "ti", njega: "on", ga: "on", mu: "on", njemu: "on", njo: "ona", jo: "ona", ji: "ona", njej: "ona",
  nas: "mi", nam: "mi", vas: "vi", vam: "vi", njih: "oni", jih: "oni", jim: "oni",
  ljudje: "človek", ljudi: "človek", otroci: "otrok", otroke: "otrok", otrok: "otrok", dneva: "dan", dnevu: "dan", dnevi: "dan", dni: "dan", dnevom: "dan",
  mater: "mati", matere: "mati", materi: "mati", hčer: "hči", hčere: "hči", očeta: "oče", očetu: "oče", očetom: "oče",
};
// Everyday words that look like a form of something else (potem is not "with the path").
const NOT_A_FORM = new Set("potem tudi zelo samo kako tako zato ker ali ampak pa še že ko če kje kam kdaj kdo kaj tam tukaj zdaj nato vedno nikoli lahko treba več manj okoli skozi brez med pred nad pod pri proti zaradi kot da ne ja in na za od do iz po ob pri mogoče seveda morda skoraj spet prav res tukaj nekaj nič vse vsi".split(" "));
const VOWEL = /[aeiou]/;

/** Stem → the stems it may really be: "kozarc" → "kozarec", "dobr" → "dober" (the vowel that drops out). */
function stems(stem: string): string[] {
  const out = [stem];
  const n = stem.length;
  if (n >= 3 && !VOWEL.test(stem[n - 1]) && !VOWEL.test(stem[n - 2])) out.push(stem.slice(0, n - 1) + "e" + stem[n - 1]);
  return out;
}

/** Basic forms this word could come from, the likeliest first. */
export function lemmaCandidates(word: string): string[] {
  const w = String(word || "").toLowerCase();
  const out: string[] = [];
  const add = (...c: string[]) => c.forEach((x) => x && x !== w && !out.includes(x) && out.push(x));
  if (IRREGULAR[w]) add(IRREGULAR[w]);
  if (NOT_A_FORM.has(w)) return out;
  const cut = (ending: string, ...put: string[]) => {
    if (!w.endsWith(ending) || w.length - ending.length < (ending.length >= 3 ? 1 : 2)) return;
    const stem = w.slice(0, w.length - ending.length);
    for (const p of put) for (const s of p === "" ? stems(stem) : [stem]) add(s + p);
  };
  // Verbs: delam, delaš, dela, delamo, delate, delajo, delal(a) → delati; govorim → govoriti; vidim → videti …
  for (const [e, ...p] of [
    ["ijem", "iti"], ["iješ", "iti"], ["ije", "iti"], ["ijemo", "iti"], ["ijete", "iti"], ["ijejo", "iti"], ["ijte", "iti"], ["ij", "iti"],
    ["ujem", "ovati", "evati"], ["uješ", "ovati", "evati"], ["uje", "ovati", "evati"], ["ujemo", "ovati", "evati"], ["ujete", "ovati", "evati"], ["ujejo", "ovati", "evati"],
    ["amo", "ati", "eti"], ["ate", "ati", "eti"], ["ajo", "ati", "eti"], ["am", "ati", "eti"], ["aš", "ati", "eti"],
    ["imo", "iti", "eti"], ["ite", "iti", "eti"], ["ijo", "iti", "eti"], ["im", "iti", "eti"], ["iš", "iti", "eti"],
    ["emo", "eti", "ati", "iti"], ["ete", "eti", "ati", "iti"], ["ejo", "eti", "ati", "iti"], ["em", "eti", "ati", "iti"], ["eš", "eti", "ati", "iti"],
    ["la", "ti"], ["li", "ti"], ["lo", "ti"], ["le", "ti"], ["l", "ti"],
  ] as string[][]) cut(e, ...p);
  // Nouns and adjectives: kavo, kave, kavi → kava; brata, bratu, bratom → brat; mleka → mleko; morja → morje;
  // velika, velikega → velik; lačna → lačen.
  for (const [e, ...p] of [
    ["ega", ""], ["emu", ""], ["imi", "", "a"], ["ami", "a", ""], ["ama", "a", ""], ["oma", "", "o"], ["ema", "", "e"],
    ["ih", "", "a", "o", "e"], ["im", "", "a"], ["ah", "a"], ["am", "a"], ["om", "", "o"], ["em", "", "e"], ["ov", "", "o"], ["ev", "", "e"], ["je", ""],
    ["o", "a", ""], ["e", "a", ""], ["i", "a", "", "o", "e"], ["u", "", "o", "e"], ["a", "", "o", "e"],
  ] as string[][]) cut(e, ...p);
  // A verb in the third person without an ending of its own: dela → delati, govori → govoriti, stane → stati.
  cut("a", "ati");
  cut("i", "iti", "eti");
  cut("e", "eti", "ati", "iti");
  cut("ne", "ti");
  // Of many, with no ending at all: let → leto, jabolk → jabolko, hiš → hiša.
  if (w.length >= 3 && !VOWEL.test(w[w.length - 1])) add(w + "o", w + "a", w + "e");
  return out;
}

/** The course word this form belongs to (kavo → kava, delam → delati), or "" when none is found. */
export function lemmaSl(word: string, has: (w: string) => boolean): string {
  const w = String(word || "").toLowerCase();
  if (!w || has(w)) return w && has(w) ? w : "";
  return lemmaCandidates(w).find(has) || "";
}

// ------------------------------------------------------------------ dynamic grammar from learned words
// Builds 100% grammatically verified exercises using nouns the learner has actually studied,
// so grammar practice applies the rule to fresh vocabulary instead of repeating 4 fixed sentences.

const VOICELESS = /^[cčfhksšpt]/i;
const prepSZ = (w: string) => (VOICELESS.test(w) ? "s" : "z");
const prepKH = (w: string) => (/^[kg]/i.test(w) ? "h" : "k");
const firstGloss = (en: string) => String(en || "").split(/[;,]/)[0].replace(/\s*\([^)]*\)/g, "").trim();

const SL_PLACES_V_FEM = new Set(["kavarna", "restavracija", "hiša", "soba", "kuhinja", "kopalnica", "spalnica", "pekarna", "lekarna", "banka", "bolnišnica", "knjižnica", "pisarna", "Evropa"]);
const SL_PLACES_NA_FEM = new Set(["tržnica", "postaja", "fakulteta", "ulica", "cesta", "gora"]);
const SL_PLACES_V_NEUT = new Set(["stanovanje", "podjetje", "mesto"]);
const SL_PLACES_NA_NEUT = new Set(["letališče", "jezero"]);
const SL_PEOPLE_FEM = new Set(["prijateljica", "soseda", "babica", "teta", "sestrična", "zdravnica", "učiteljica", "študentka", "žena"]);
const SL_OBJECTS_FEM = new Set(["skodelica", "steklenica", "miza", "postelja", "omara", "slika", "vozovnica", "karta", "obleka", "majica", "srajca", "jakna", "kapa", "torba", "kartica", "vrečka", "roža", "mačka", "ptica", "riba", "banana", "pomaranča", "solata", "juha", "pica", "torta", "potica"]);
const SL_FOOD_NEUT = new Set(["meso", "maslo", "sadje", "jabolko", "kosilo", "pivo", "vino"]);
const SL_ADJ_NEUT = new Set(["mesto", "stanovanje", "okno", "letalo", "jezero", "darilo", "kosilo", "krilo", "pisalo", "vprašanje", "podjetje", "jabolko", "pivo", "vino"]);

const GENDER_WHY: Record<string, string> = { m: "masculine (m · moški)", ž: "feminine (ž · ženski)", s: "neuter (s · srednji)" };
const STATIC_GENDER_NOUNS = new Set(["stol", "hiša", "mesto", "morje"]);

function shuffleArr<T>(arr: T[]): T[] {
  const out = arr.slice();
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

export interface DynamicSlWord {
  hanzi: string;
  english: string;
  gender?: string | null;
}

/** Generate up to `limit` verified grammar examples from the learner's own studied Slovenian nouns. */
export function dynamicSlExamples(pointId: string, learnedWords: DynamicSlWord[], limit = 3): any[] {
  const words = shuffleArr(learnedWords.filter((w) => w.hanzi && !/\s/.test(w.hanzi) && ["m", "ž", "s"].includes(w.gender || "")));
  const out: any[] = [];

  if (pointId === "sl-gender") {
    const byG: Record<string, DynamicSlWord[]> = { m: [], ž: [], s: [] };
    for (const w of words) {
      if (STATIC_GENDER_NOUNS.has(w.hanzi.toLowerCase())) continue;
      byG[w.gender!].push(w);
    }
    const picked: DynamicSlWord[] = [];
    for (let i = 0; picked.length < limit && i < 3; i++) {
      for (const g of ["m", "ž", "s"]) if (byG[g][i] && picked.length < limit) picked.push(byG[g][i]);
    }
    for (const w of picked) {
      const h = w.hanzi;
      const g = w.gender!;
      const last = h.slice(-1);
      const marked = g === "ž" && last === "a" ? `${h.slice(0, -1)}[a]` : g === "s" && (last === "o" || last === "e") ? `${h.slice(0, -1)}[${last}]` : `[${h}]`;
      const regular = (g === "ž" && last === "a") || (g === "s" && (last === "o" || last === "e")) || (g === "m" && !/[aeiou]$/i.test(h));
      const why = regular
        ? `${h} ends in ${g === "m" ? "a consonant" : `-${last}`} → ${GENDER_WHY[g]}`
        : `${h} is an exception: ${GENDER_WHY[g]} even though it ends in ${/[aeiou]$/i.test(h) ? `-${last}` : "a consonant"}`;
      out.push({ text: marked, en: firstGloss(w.english), gender: g, audio: h, fresh: true, why });
    }
    return out;
  }

  for (const w of words) {
    if (out.length >= limit) break;
    const h = w.hanzi;
    const low = h.toLowerCase();
    const g = w.gender!;
    const en = firstGloss(w.english);

    if (pointId === "sl-acc-fem" && g === "ž" && h.endsWith("a") && SL_OBJECTS_FEM.has(low)) {
      const st = h.slice(0, -1);
      out.push({
        text: `Imam ${st}[o].`,
        en: `I have a ${en}.`,
        audio: h,
        fresh: true,
        drill: { base: h, options: [`${st}o`, h, `${st}e`, `${st}i`] },
        transform: { from: `To je ${h}.`, from_en: `This is a ${en}.`, prompt: "Say you have it:" },
        why: `imam + what? (4. tožilnik): feminine -a → -o (${h} → ${st}o)`,
      });
    } else if (pointId === "sl-kam-acc" && g === "ž" && h.endsWith("a") && (SL_PLACES_V_FEM.has(low) || SL_PLACES_NA_FEM.has(low))) {
      const st = h.slice(0, -1);
      const prep = SL_PLACES_NA_FEM.has(low) ? "na" : "v";
      out.push({
        text: `Grem ${prep} ${st}[o].`,
        en: `I'm going to the ${en}.`,
        audio: h,
        fresh: true,
        drill: { base: h, options: [`${st}o`, h, `${st}i`, `${st}e`] },
        dialogue: { q: "Kam greš?", q_en: "Where are you going?" },
        why: `Kam? (direction) → ${prep} + 4. tožilnik: -a → -o (${h} → ${st}o)`,
      });
    } else if (pointId === "sl-locative" && g === "ž" && h.endsWith("a") && (SL_PLACES_V_FEM.has(low) || SL_PLACES_NA_FEM.has(low))) {
      const st = h.slice(0, -1);
      const prep = SL_PLACES_NA_FEM.has(low) ? "na" : "v";
      out.push({
        text: `Sem ${prep} ${st}[i].`,
        en: `I'm at the ${en}.`,
        audio: h,
        fresh: true,
        drill: { base: h, options: [`${st}i`, `${st}o`, h, `${st}e`] },
        transform: { from: `Grem ${prep} ${st}o.`, from_en: `I'm going to the ${en} (Kam?).`, prompt: "Now you're already there (Kje?):" },
        why: `Kje? (location) → ${prep} + 5. mestnik: -a → -i (${h} → ${st}i)`,
      });
    } else if (pointId === "sl-locative" && g === "s" && (SL_PLACES_V_NEUT.has(low) || SL_PLACES_NA_NEUT.has(low))) {
      const st = h.slice(0, -1);
      const prep = SL_PLACES_NA_NEUT.has(low) ? "na" : "v";
      out.push({
        text: `Sem ${prep} ${st}[u].`,
        en: `I'm at the ${en}.`,
        audio: h,
        fresh: true,
        drill: { base: h, options: [`${st}u`, h, `${st}a`, `${st}i`] },
        dialogue: { q: "Kje si?", q_en: "Where are you?" },
        why: `Kje? (location) → ${prep} + 5. mestnik: neuter -${h.slice(-1)} → -u (${h} → ${st}u)`,
      });
    } else if (pointId === "sl-gen-neg" && g === "ž" && h.endsWith("a") && SL_OBJECTS_FEM.has(low)) {
      const st = h.slice(0, -1);
      out.push({
        text: `Nimam ${st}[e].`,
        en: `I don't have a ${en}.`,
        audio: h,
        fresh: true,
        drill: { base: h, options: [`${st}e`, `${st}o`, h, `${st}i`] },
        transform: { from: `Imam ${st}o.`, from_en: `I have a ${en}.`, prompt: "Say the negative:" },
        why: `nimam (negation) → 2. rodilnik: feminine -a → -e (${h} → ${st}e)`,
      });
    } else if (pointId === "sl-gen-neg" && g === "s" && SL_FOOD_NEUT.has(low)) {
      const st = h.slice(0, -1);
      out.push({
        text: `Tukaj ni ${st}[a].`,
        en: `There is no ${en} here.`,
        audio: h,
        fresh: true,
        drill: { base: h, options: [`${st}a`, h, `${st}u`, `${st}e`] },
        transform: { from: `Tukaj je ${h}.`, from_en: `There is ${en} here.`, prompt: "Say there isn't any:" },
        why: `ni (negation) → 2. rodilnik: neuter -${h.slice(-1)} → -a (${h} → ${st}a)`,
      });
    } else if (pointId === "sl-instrumental" && g === "ž" && h.endsWith("a") && SL_PEOPLE_FEM.has(low)) {
      const st = h.slice(0, -1);
      const prep = prepSZ(h);
      out.push({
        text: `Govorim ${prep} ${st}[o].`,
        en: `I'm talking with the ${en}.`,
        audio: h,
        fresh: true,
        drill: { base: h, options: [`${st}o`, h, `${st}i`, `${st}e`] },
        dialogue: { q: "S kom govoriš?", q_en: "Who are you talking with?" },
        why: `${prep} (with) → 6. orodnik: feminine -a → -o (${h} → ${st}o)`,
      });
    } else if (pointId === "sl-dative" && g === "ž" && h.endsWith("a") && SL_PEOPLE_FEM.has(low)) {
      const st = h.slice(0, -1);
      const prep = prepKH(h);
      out.push({
        text: `Grem ${prep} ${st}[i].`,
        en: `I'm going to the ${en}'s place.`,
        audio: h,
        fresh: true,
        drill: { base: h, options: [`${st}i`, `${st}o`, h, `${st}e`] },
        dialogue: { q: "Kam greš?", q_en: "Where are you going?" },
        why: `${prep} (to a person) → 3. dajalnik: feminine -a → -i (${h} → ${st}i)`,
      });
    } else if (pointId === "sl-plural" && g === "ž" && h.endsWith("a") && SL_OBJECTS_FEM.has(low)) {
      const st = h.slice(0, -1);
      out.push({
        text: `Tukaj so tri ${st}[e].`,
        en: `Here are three (${en}).`,
        audio: h,
        fresh: true,
        drill: { base: h, options: [`${st}e`, h, `${st}i`, `${st}o`] },
        transform: { from: `Tukaj je ena ${h}.`, from_en: `Here is one ${en}.`, prompt: "Now say three (tri):" },
        why: `3–4 uses normal plural: feminine -a → -e (${h} → ${st}e)`,
      });
    } else if (pointId === "sl-adjectives" && g === "ž" && h.endsWith("a") && SL_OBJECTS_FEM.has(low)) {
      out.push({
        text: `To je lep[a] ${h}.`,
        en: `This is a nice ${en}.`,
        audio: h,
        fresh: true,
        drill: { base: "lep", options: ["lepa", "lep", "lepo", "lepi"] },
        transform: { from: "To je lep stol.", from_en: "This is a nice chair (m).", prompt: `Now describe ${h} (ž):` },
        why: `${h} is feminine (ž) → adjective takes -a (lepa)`,
      });
    } else if (pointId === "sl-adjectives" && g === "s" && SL_ADJ_NEUT.has(low)) {
      out.push({
        text: `To je lep[o] ${h}.`,
        en: `This is a nice ${en}.`,
        audio: h,
        fresh: true,
        drill: { base: "lep", options: ["lepo", "lep", "lepa", "lepi"] },
        transform: { from: "To je lep stol.", from_en: "This is a nice chair (m).", prompt: `Now describe ${h} (s):` },
        why: `${h} is neuter (s) → adjective takes -o (lepo)`,
      });
    }
  }
  return out;
}
