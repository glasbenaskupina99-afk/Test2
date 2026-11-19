// Builds the voice packs the apps play offline (app/data/audio/<lang>.bin + <lang>.json) with
// Microsoft Azure AI Speech — the official service, used under its terms with your own key.
//
//   AZURE_SPEECH_KEY=… AZURE_SPEECH_REGION=westeurope npx tsx scripts/make-audio.ts sl [--sample 25] [--only-new]
//
// Languages: sl (Heritage), zh, ja (East). Every clip is kept in mobile/.audio-cache/, so a second
// run only asks Azure for what is new (and costs nothing for the rest). --sample N writes N clips to
// mobile/.audio-sample/<lang>/ to listen to before building the whole pack.
// Pack format: <lang>.bin is the MP3 clips one after another; <lang>.json maps each text
// (lower case, no [ ], no trailing . ! ?) to [offset, length] in the .bin — see app/static/js/audio.ts.
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = fileURLToPath(new URL("../..", import.meta.url));
const DATA = join(ROOT, "app", "data");
const CACHE = join(ROOT, "mobile", ".audio-cache");
const read = (p: string) => JSON.parse(readFileSync(join(DATA, p), "utf8"));

const VOICES: Record<string, { voice: string; lang: string }> = {
  sl: { voice: "sl-SI-PetraNeural", lang: "sl-SI" },
  zh: { voice: "zh-CN-XiaoxiaoNeural", lang: "zh-CN" },
  ja: { voice: "ja-JP-NanamiNeural", lang: "ja-JP" },
};
const FORMAT = "audio-24khz-48kbitrate-mono-mp3";

/** The key the app looks a text up by (audio.ts: normAudioKey + stripAudioPunct). */
export const audioKey = (t: string) =>
  String(t || "")
    .toLowerCase()
    .replace(/[[\]]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/[.!?。！？、，]+$/g, "")
    .trim();

const hasLetters = (t: string) => /[\p{L}]/u.test(t);

/** Every text of a course that the app can read aloud. */
function texts(lang: string): string[] {
  const out = new Set<string>();
  const add = (t: unknown) => {
    const k = audioKey(String(t ?? ""));
    if (k && hasLetters(k)) out.add(k);
  };
  if (lang === "sl") {
    for (const u of read("slovenian_a1.json").units) for (const w of u.words) add(w[0]);
    for (const r of read("slovenian_sentences.json")) for (const s of [r[1], ...(r[3] || [])]) add(s);
    for (const p of read("grammar/sl_a1.json").points) for (const ex of p.examples || []) add(ex.text);
    for (const st of read("stories/sl_a1.json").stories) {
      add(st.title);
      for (const s of st.sentences) {
        add(s.text);
        for (const [tok] of s.tokens) add(tok); // a word tapped in a story is read in its own form (kavo)
      }
    }
    for (const x of Object.values<any>(read("extras/sl.json"))) add(x.example_zh);
  }
  if (lang === "zh") {
    for (const u of read("hsk1.json").units) for (const w of u.words) add(w[0]);
  }
  if (lang === "ja") {
    for (const f of ["japanese_kana.json", "japanese_n5.json"]) for (const u of read(f).units) for (const w of u.words) add(w[0]);
  }
  // Everything the current pack already covers stays covered.
  const old = join(DATA, "audio", `${lang}.json`);
  if (existsSync(old)) for (const k of Object.keys(JSON.parse(readFileSync(old, "utf8")))) add(k);
  return [...out].sort();
}

const esc = (t: string) => t.replace(/[<>&'"]/g, (c) => ({ "<": "&lt;", ">": "&gt;", "&": "&amp;", "'": "&apos;", '"': "&quot;" })[c]!);
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function synthesize(text: string, lang: string): Promise<Buffer> {
  const key = process.env.AZURE_SPEECH_KEY;
  const region = process.env.AZURE_SPEECH_REGION;
  if (!key || !region) throw new Error("Set AZURE_SPEECH_KEY and AZURE_SPEECH_REGION (e.g. westeurope)");
  const v = VOICES[lang];
  const ssml = `<speak version="1.0" xml:lang="${v.lang}"><voice name="${v.voice}">${esc(text)}</voice></speak>`;
  for (let attempt = 0; ; attempt++) {
    const r = await fetch(`https://${region}.tts.speech.microsoft.com/cognitiveservices/v1`, {
      method: "POST",
      headers: { "Ocp-Apim-Subscription-Key": key, "Content-Type": "application/ssml+xml", "X-Microsoft-OutputFormat": FORMAT, "User-Agent": "bloomko-make-audio" },
      body: ssml,
    });
    if (r.ok) {
      const buf = Buffer.from(await r.arrayBuffer());
      if (buf.length < 200) throw new Error(`"${text}": empty audio`);
      return buf;
    }
    // The free tier (F0) allows only a few requests a minute: wait and try again.
    if ((r.status === 429 || r.status >= 500) && attempt < 8) {
      await sleep(Number(r.headers.get("retry-after")) * 1000 || 4000 * (attempt + 1));
      continue;
    }
    throw new Error(`Azure ${r.status} for "${text}": ${(await r.text()).slice(0, 200)}`);
  }
}

async function main() {
  const args = process.argv.slice(2);
  const lang = args.find((a) => VOICES[a]);
  if (!lang) throw new Error("Which language? sl, zh or ja");
  const sample = args.includes("--sample") ? Number(args[args.indexOf("--sample") + 1]) || 25 : 0;
  let list = texts(lang);
  if (sample) {
    // A spread of short words and whole sentences.
    const words = list.filter((t) => !t.includes(" "));
    const sents = list.filter((t) => t.split(" ").length >= 3);
    const pick = (a: string[], n: number) => Array.from({ length: Math.min(n, a.length) }, (_, i) => a[Math.floor((i * a.length) / Math.min(n, a.length))]);
    list = [...pick(words, Math.ceil(sample * 0.7)), ...pick(sents, Math.floor(sample * 0.3))];
  }
  const dir = join(CACHE, lang);
  mkdirSync(dir, { recursive: true });
  const file = (t: string) => join(dir, createHash("sha1").update(`${VOICES[lang].voice}|${FORMAT}|${t}`).digest("hex") + ".mp3");
  const todo = list.filter((t) => !existsSync(file(t)));
  const chars = todo.reduce((n, t) => n + t.length, 0);
  console.log(`${lang}: ${list.length} texts, ${todo.length} to synthesize (${chars} characters)`);
  let done = 0;
  for (const t of todo) {
    writeFileSync(file(t), await synthesize(t, lang));
    if (++done % 25 === 0 || done === todo.length) console.log(`  ${done}/${todo.length}`);
    await sleep(Number(process.env.AZURE_DELAY_MS || 250));
  }
  if (sample) {
    const out = join(ROOT, "mobile", ".audio-sample", lang);
    mkdirSync(out, { recursive: true });
    list.forEach((t, i) => writeFileSync(join(out, `${String(i + 1).padStart(2, "0")} ${t.replace(/[\\/:*?"<>|]/g, "").slice(0, 60)}.mp3`), readFileSync(file(t))));
    console.log(`sample → ${out}`);
    return;
  }
  // The pack: clips one after another, and where each one is.
  const parts: Buffer[] = [];
  const index: Record<string, [number, number]> = {};
  let off = 0;
  for (const t of list) {
    const b = readFileSync(file(t));
    index[t] = [off, b.length];
    parts.push(b);
    off += b.length;
  }
  mkdirSync(join(DATA, "audio"), { recursive: true });
  writeFileSync(join(DATA, "audio", `${lang}.bin`), Buffer.concat(parts));
  writeFileSync(join(DATA, "audio", `${lang}.json`), JSON.stringify(index));
  writeFileSync(join(DATA, "audio", "SOURCE.md"), `# Voice packs\n\nMade with Microsoft Azure AI Speech (official API, own subscription) by mobile/scripts/make-audio.ts.\nVoices: ${Object.entries(VOICES).map(([l, v]) => `${l} = ${v.voice}`).join(", ")}. Format: ${FORMAT}.\n`);
  console.log(`${lang}: ${list.length} clips, ${(off / 1e6).toFixed(1)} MB → app/data/audio/${lang}.bin`);
}

main().catch((e) => {
  console.error(e.message || e);
  process.exit(1);
});
