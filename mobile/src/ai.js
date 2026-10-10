// On-device Gemma prompts (JS port of app/ai.py). Inference runs in the native GemmaPlugin.
import { hanziOnly } from "./pinyin.js";

const SYSTEM =
  "You are a patient Mandarin Chinese tutor for an English-speaking beginner. " +
  "Use Simplified Chinese characters. Always answer with a single JSON object and nothing else.";

export class AIError extends Error {
  constructor(msg) {
    super(msg);
    this.aiError = true;
    this.status = 503;
  }
}

let getSettings = () => ({});
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

export async function chat(prompt, { temperature = 0.7 } = {}) {
  const s = getSettings();
  if (!s.ai_enabled) throw new AIError("AI is turned off in settings");
  if (!gemma()) throw new AIError("On-device AI is only available in the Android app");
  let res;
  try {
    res = await gemma().generate({ prompt, system: SYSTEM, temperature, backend: s.gemma_backend || "cpu" });
  } catch (e) {
    throw new AIError(e.message || String(e));
  }
  return parseJson(res.text);
}

export async function status() {
  const s = getSettings();
  if (!s.ai_enabled) return { ok: false, enabled: false, message: "AI is turned off" };
  if (!gemma()) return { ok: false, enabled: true, message: "On-device AI needs the Android app" };
  const st = await gemma().status();
  return { ok: st.hasModel, enabled: true, model: st.modelName, message: st.hasModel ? "Gemma ready on device" : "No model downloaded — see Settings" };
}

export async function test() {
  const s = getSettings();
  if (!gemma()) throw new AIError("On-device AI is only available in the Android app");
  const res = await gemma().generate({
    prompt: "Greet a beginner in one short Chinese sentence with pinyin and English. Plain text, one line.",
    system: "You are a friendly Mandarin tutor.",
    temperature: 0.7,
    backend: s.gemma_backend || "cpu",
  });
  return { reply: (res.text || "").trim().slice(0, 200) };
}

// ------------------------------------------------------------------ features

export async function generateSentences(known, focus, count, avoid) {
  // Keep the prompt short: small on-device models are slow at reading long inputs.
  const sample = [...focus, ...known.filter((w) => !focus.some((f) => f.hanzi === w.hanzi)).sort(() => Math.random() - 0.5)].slice(0, 120);
  const vocab = sample.map((w) => `${w.hanzi} (${w.english})`).join("; ");
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

export async function gradeTranslation(english, reference, answer) {
  const prompt = `A student translated an English sentence into Chinese.

English: ${english}
Reference translation: ${reference}
Student's answer: ${answer}

Decide whether the student's answer is a correct, natural translation. Different but valid
wordings are correct. Ignore punctuation and spacing. Be encouraging but honest.

Return JSON: {"correct": true/false, "score": 0-100, "feedback": "one or two short sentences in English",
"corrected": "the best correct Chinese version closest to the student's answer"}`;
  const d = await chat(prompt, { temperature: 0.2 });
  return { correct: !!d.correct, score: Number(d.score) || 0, feedback: String(d.feedback || ""), corrected: String(d.corrected || reference) };
}

export async function wordExtras(word) {
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
  const prompt = `The user wants to add a word to their Chinese study list. Their input: "${query}"
It may be English, pinyin or Chinese characters. Pick the most common everyday Mandarin word.

Return JSON: {"hanzi": "simplified characters", "english": "short English meaning(s)"}`;
  const d = await chat(prompt, { temperature: 0.2 });
  return { hanzi: hanziOnly(String(d.hanzi || "")), english: String(d.english || "").trim() };
}
