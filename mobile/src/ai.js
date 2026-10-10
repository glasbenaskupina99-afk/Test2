// On-device Gemma prompts (JS port of app/ai.py). Inference runs in the native GemmaPlugin.
import { hanziOnly } from "./pinyin.js";
import { normKana, writable } from "./japanese.js";

const SYSTEMS = {
  zh:
    "You are a patient Mandarin Chinese tutor for an English-speaking beginner. " +
    "Use Simplified Chinese characters. Always answer with a single JSON object and nothing else.",
  ja:
    "You are a patient Japanese tutor for an English-speaking beginner. Use standard Japanese " +
    "(kanji with hiragana, polite です/ます style). Always answer with a single JSON object and nothing else.",
};

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
  return { correct: !!d.correct, score: Number(d.score) || 0, feedback: String(d.feedback || ""), corrected: String(d.corrected || reference) };
}

export async function wordExtras(word) {
  if (lang() === "ja") {
    const prompt = `Help me remember the Japanese word ${word.hanzi} (read ${word.pinyin}) meaning "${word.english}".

Return JSON: {
 "example_zh": "a short, simple polite example sentence using it (kanji and kana)",
 "example_pinyin": "that sentence in hiragana",
 "example_en": "its English translation",
 "mnemonic": "a vivid one-sentence memory hook linking the shape/parts of the kanji to the meaning",
 "components": "brief breakdown of the kanji's parts/radicals (one line)"
}`;
    const d = await chat(prompt, { temperature: 0.6 });
    const out = {};
    for (const k of ["example_zh", "example_pinyin", "example_en", "mnemonic", "components"]) out[k] = String(d[k] || "");
    return out;
  }
  const prompt = `Help me remember the Chinese word ${word.hanzi} (${word.pinyin}) meaning "${word.english}".

Return JSON: {
 "example_zh": "a short, simple example sentence using it (simplified characters)",
 "example_en": "its English translation",
 "mnemonic": "a vivid one-sentence memory hook linking the shape/components of the character(s) to the meaning",
 "components": "brief breakdown of the character components/radicals (one line)"
}`;
  const d = await chat(prompt, { temperature: 0.6 });
  const out = {};
  for (const k of ["example_zh", "example_en", "mnemonic", "components"]) out[k] = String(d[k] || "");
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
