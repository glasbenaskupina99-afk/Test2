// On-device Gemma prompts (JS port of app/ai.py). Inference runs in the native GemmaPlugin.
import { hanziOnly } from "./pinyin.js";
import { normKana, writable } from "./japanese.js";

const ENGLISH_RULE =
  "The student only reads English: write every explanation, memory hook, breakdown, translation and piece of feedback " +
  "in ENGLISH. Use the target language only inside example sentences and when quoting the word or its parts.";
const SYSTEMS = {
  zh:
    "You are a patient Mandarin Chinese tutor for an English-speaking beginner. " +
    "Chinese text uses Simplified characters. " + ENGLISH_RULE + " Always answer with a single JSON object and nothing else.",
  ja:
    "You are a patient Japanese tutor for an English-speaking beginner. Japanese text uses standard " +
    "kanji with hiragana, polite です/ます style. " + ENGLISH_RULE + " Always answer with a single JSON object and nothing else.",
};

/**
 * True when text is (mostly) English. Quoted characters such as 亻 or 学 are fine,
 * but an explanation written in Chinese/Japanese is not.
 */
export function isEnglish(text) {
  const t = String(text || "");
  const latin = (t.match(/[A-Za-z]/g) || []).length;
  const cjk = (t.match(/[\u3040-\u30ff\u3400-\u9fff\uf900-\ufaff]/g) || []).length;
  return latin >= 2 && latin >= cjk * 3;
}

export class AIError extends Error {
  constructor(msg) {
    super(msg);
    this.aiError = true;
    this.status = 503;
  }
}

let getSettings = () => ({});
const lang = () => (getSettings().course === "ja" ? "ja" : "zh");
export function configure(settingsFn) {
  getSettings = settingsFn;
}

const gemma = () => window.__native?.gemma;

export function parseJson(text) {
  let t = (text || "").trim().replace(/<think>[\s\S]*?<\/think>/g, "").trim();
  const fence = t.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (fence) t = fence[1].trim();
  try {
    return JSON.parse(t);
  } catch {
    const starts = [t.indexOf("{"), t.indexOf("[")].filter((i) => i >= 0);
    const start = starts.length ? Math.min(...starts) : -1;
    const end = Math.max(t.lastIndexOf("}"), t.lastIndexOf("]"));
    if (start >= 0 && end > start) {
      try {
        return JSON.parse(t.slice(start, end + 1));
      } catch { /* fall through */ }
    }
    throw new AIError(`Gemma didn't return valid JSON: ${t.slice(0, 120)}`);
  }
}

// ------------------------------------------------------------------ providers
// Android app: Gemma runs on the phone (native plugin).
// Browser (computer): Gemma via an OpenAI-compatible server such as Ollama on this computer.

async function webGenerate({ prompt, system, temperature, json = true }) {
  const s = getSettings();
  const url = s.llm_base_url.replace(/\/+$/, "") + "/chat/completions";
  const headers = { "Content-Type": "application/json" };
  if (s.llm_api_key) headers.Authorization = `Bearer ${s.llm_api_key}`;
  const body = {
    model: s.llm_model,
    messages: [{ role: "system", content: system }, { role: "user", content: prompt }],
    temperature,
    stream: false,
    ...(json ? { response_format: { type: "json_object" } } : {}),
  };
  let r;
  try {
    r = await fetch(url, { method: "POST", headers, body: JSON.stringify(body) });
    if (r.status === 400 && json) {
      delete body.response_format;
      r = await fetch(url, { method: "POST", headers, body: JSON.stringify(body) });
    }
  } catch (e) {
    throw new AIError(`Can't reach ${s.llm_base_url}. Is Ollama running, with OLLAMA_ORIGINS allowing this site? (${e.message})`);
  }
  if (!r.ok) throw new AIError(`Model server error ${r.status}: ${(await r.text()).slice(0, 200)}`);
  const data = await r.json();
  return { text: data.choices?.[0]?.message?.content || "" };
}

function generate(opts) {
  const s = getSettings();
  return gemma() ? gemma().generate({ ...opts, backend: s.gemma_backend || "cpu" }) : webGenerate(opts);
}

export const available = () => !!getSettings().ai_enabled && (!!gemma() || !!getSettings().llm_base_url);

export async function chat(prompt, { temperature = 0.7 } = {}) {
  const s = getSettings();
  if (!s.ai_enabled) throw new AIError("AI is turned off in settings");
  let res;
  try {
    res = await generate({ prompt, system: SYSTEMS[lang()], temperature });
  } catch (e) {
    throw e instanceof AIError ? e : new AIError(e.message || String(e));
  }
  return parseJson(res.text);
}

async function webStatus() {
  const s = getSettings();
  const headers = s.llm_api_key ? { Authorization: `Bearer ${s.llm_api_key}` } : {};
  try {
    const r = await fetch(s.llm_base_url.replace(/\/+$/, "") + "/models", { headers });
    const models = ((await r.json()).data || []).map((m) => m.id);
    const found = models.includes(s.llm_model) || models.some((m) => m && m.split(":")[0] === s.llm_model);
    return { ok: found, enabled: true, model: s.llm_model, models, message: found ? "Connected" : `Server is up but model '${s.llm_model}' isn't installed` };
  } catch {
    return { ok: false, enabled: true, message: `Can't reach ${s.llm_base_url} — start Ollama (see Settings)` };
  }
}

export async function status() {
  const s = getSettings();
  if (!s.ai_enabled) return { ok: false, enabled: false, message: "AI is turned off" };
  if (!gemma()) return webStatus();
  const st = await gemma().status();
  return { ok: st.hasModel, enabled: true, model: st.modelName, message: st.hasModel ? "Gemma ready on device" : "No model downloaded — see Settings" };
}

export async function test() {
  const res = await generate({
    json: false,
    prompt: lang() === "ja"
      ? "Greet a beginner in one short Japanese sentence with its reading and English. Plain text, one line."
      : "Greet a beginner in one short Chinese sentence with pinyin and English. Plain text, one line.",
    system: lang() === "ja" ? "You are a friendly Japanese tutor." : "You are a friendly Mandarin tutor.",
    temperature: 0.7,
  });
  return { reply: (res.text || "").trim().slice(0, 200) };
}

// ------------------------------------------------------------------ features

export async function generateSentences(known, focus, count, avoid) {
  // Keep the prompt short: small on-device models are slow at reading long inputs.
  const sample = [...focus, ...known.filter((w) => !focus.some((f) => f.hanzi === w.hanzi)).sort(() => Math.random() - 0.5)].slice(0, 120);
  const vocab = sample.map((w) => `${w.hanzi} (${w.english})`).join("; ");
  if (lang() === "ja") return generateSentencesJa(vocab, focus, count, avoid);
  const prompt = `Create ${count} short, natural Mandarin practice sentences for a beginner.

Rules:
- Use ONLY words from this vocabulary list (plus very common particles if unavoidable): ${vocab}
- Try to include these focus words: ${focus.map((w) => w.hanzi).join(", ") || "any"}
- 3 to 10 Chinese characters each. Everyday, natural sentences a native speaker would say.
- Vary the grammar (statements, questions with 吗/什么/哪儿, negation with 不/没).
- Don't repeat these recent sentences: ${avoid.slice(0, 15).join(" / ") || "none"}
- "en" is a natural English translation. "zh" is the Chinese in simplified characters, no spaces.

Return JSON: {"sentences": [{"en": "...", "zh": "..."}]}`;
  const data = await chat(prompt, { temperature: 0.9 });
  const items = Array.isArray(data) ? data : data.sentences;
  const out = (Array.isArray(items) ? items : [])
    .filter((it) => it && it.en && hanziOnly(it.zh))
    .map((it) => ({ en: String(it.en).trim(), zh: String(it.zh).trim() }));
  if (!out.length) throw new AIError("Gemma returned no usable sentences");
  return out;
}

async function generateSentencesJa(vocab, focus, count, avoid) {
  const n3 = String(getSettings().section_ja || "").includes("N3");
  const prompt = `Create ${count} natural Japanese practice sentences for ${n3 ? "an intermediate learner (JLPT N3 level)" : "a beginner"}.

Rules:
- Use mainly words from this vocabulary list, plus ${n3 ? "N3-level grammar (〜ために, 〜てしまう, 〜そうだ, 〜なければならない, conditionals)" : "basic particles, です/ます verb forms and simple kana words"}: ${vocab}
- Try to include these focus words: ${focus.map((w) => w.hanzi).join(", ") || "any"}
- ${n3 ? "8 to 24 characters each, polite or plain style" : "Polite style, 4 to 14 characters each"}, everyday sentences a native speaker would say.
- Vary the grammar (statements, questions with か, negatives with ません).
- Don't repeat these recent sentences: ${avoid.slice(0, 15).join(" / ") || "none"}
- "en": natural English. "ja": the Japanese with normal kanji and kana. "reading": the whole sentence in hiragana only.

Return JSON: {"sentences": [{"en": "...", "ja": "...", "reading": "..."}]}`;
  const data = await chat(prompt, { temperature: 0.9 });
  const items = Array.isArray(data) ? data : data.sentences;
  const out = (Array.isArray(items) ? items : [])
    .filter((it) => it && it.en && writable(it.ja || it.zh))
    .map((it) => ({ en: String(it.en).trim(), zh: String(it.ja || it.zh).trim(), reading: normKana(String(it.reading || "")) }));
  if (!out.length) throw new AIError("Gemma returned no usable sentences");
  return out;
}

export async function gradeTranslation(english, reference, answer) {
  const target = lang() === "ja" ? "Japanese" : "Chinese";
  const prompt = `A student translated an English sentence into ${target}.

English: ${english}
Reference translation: ${reference}
Student's answer: ${answer}

Decide whether the student's answer is a correct, natural translation. Different but valid
wordings are correct. Ignore punctuation and spacing. Be encouraging but honest.

Return JSON: {"correct": true/false, "score": 0-100, "feedback": "one or two short sentences in English",
"corrected": "the best correct ${target} version closest to the student's answer"}`;
  const d = await chat(prompt, { temperature: 0.2 });
  const feedback = String(d.feedback || "");
  return {
    correct: !!d.correct,
    score: Number(d.score) || 0,
    feedback: isEnglish(feedback) ? feedback : d.correct ? "Correct!" : "Not quite — compare with the corrected version.",
    corrected: String(d.corrected || reference),
  };
}

// Fields of a memory hook that must be written in English.
export const EXTRAS_ENGLISH = ["mnemonic", "components", "example_en"];

export async function wordExtras(word) {
  const ja = lang() === "ja";
  const langName = ja ? "Japanese" : "Chinese";
  const example = ja
    ? `{"example_zh": "毎日学校へ行きます。", "example_pinyin": "まいにちがっこうへいきます", "example_en": "I go to school every day.",
 "mnemonic": "A child (子) under a roof full of sparks of knowledge is learning.",
 "components": "⺍ sparks + 冖 roof + 子 child"}  (example for 学, "to study")`
    : `{"example_zh": "我在学校学习汉语。", "example_en": "I study Chinese at school.",
 "mnemonic": "A child (子) under a roof full of sparks of knowledge is learning.",
 "components": "⺍ sparks + 冖 roof + 子 child"}  (example for 学, "to study")`;
  const base = `Help an English-speaking beginner remember the ${langName} word ${word.hanzi} (${word.pinyin}) meaning "${word.english}".

Return JSON with these fields:
 "example_zh": a short, simple ${ja ? "polite Japanese sentence (kanji and kana)" : "Chinese sentence (simplified characters)"} that uses the word
${ja ? ' "example_pinyin": that sentence written in hiragana only\n' : ""} "example_en": the English translation of that sentence
 "mnemonic": ONE vivid sentence IN ENGLISH linking the shape or parts of the character(s) to the meaning
 "components": a short breakdown IN ENGLISH of the parts/radicals, e.g. "亻 person + 尔 you"

"mnemonic", "components" and "example_en" MUST be written in English (characters may only be quoted).
Format example: ${example}`;

  const keys = ["example_zh", ...(ja ? ["example_pinyin"] : []), "example_en", "mnemonic", "components"];
  const clean = (d) => Object.fromEntries(keys.map((k) => [k, String((d && d[k]) || "").trim()]));
  const badFields = (o) => EXTRAS_ENGLISH.filter((k) => o[k] && !isEnglish(o[k]));

  let out = clean(await chat(base, { temperature: 0.5 }));
  if (badFields(out).length) {
    // Small models sometimes slip into the target language: ask again, firmly.
    const retry = clean(
      await chat(`${base}\n\nYour previous answer explained things in ${langName}. Write "mnemonic", "components" and "example_en" in plain English this time.`, { temperature: 0.2 })
    );
    for (const k of keys) if (retry[k] && (!EXTRAS_ENGLISH.includes(k) || isEnglish(retry[k]))) out[k] = retry[k];
  }
  // Never show an explanation the student can't read.
  for (const k of badFields(out)) out[k] = "";
  if (!out.mnemonic && !out.example_zh) throw new AIError("Gemma didn't manage an English memory hook — try again");
  return out;
}

export async function fillWord(query) {
  if (lang() === "ja") {
    const prompt = `The user wants to add a word to their Japanese study list. Their input: "${query}"
It may be English, romaji, kana or kanji. Pick the most common everyday Japanese word.

Return JSON: {"word": "the word as normally written (kanji + kana)", "reading": "hiragana reading", "english": "short English meaning(s)"}`;
    const d = await chat(prompt, { temperature: 0.2 });
    return { hanzi: writable(String(d.word || d.kanji || "")), pinyin: normKana(String(d.reading || "")).replace(/[^\u3041-\u3096ー]/g, ""), english: String(d.english || "").trim() };
  }
  const prompt = `The user wants to add a word to their Chinese study list. Their input: "${query}"
It may be English, pinyin or Chinese characters. Pick the most common everyday Mandarin word.

Return JSON: {"hanzi": "simplified characters", "english": "short English meaning(s)"}`;
  const d = await chat(prompt, { temperature: 0.2 });
  return { hanzi: hanziOnly(String(d.hanzi || "")), english: String(d.english || "").trim() };
}
