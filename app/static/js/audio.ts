// Text-to-speech, speech recognition and WAV recording — all in the browser.
import { state, T } from "./state.js";
import { toast } from "./util.js";

function pickVoice(lang) {
  const voices = speechSynthesis.getVoices();
  const [base, region] = lang.split("-");
  const exact = new RegExp(`^${base}[-_]${region}`, "i");
  return (
    voices.find((v) => exact.test(v.lang) && /google|natural|xiaoxiao|tingting|kyoko|nanami/i.test(v.name)) ||
    voices.find((v) => exact.test(v.lang)) ||
    voices.find((v) => new RegExp(`^${base}`, "i").test(v.lang)) ||
    null
  );
}
if ("speechSynthesis" in window) speechSynthesis.getVoices();

// In the Android app, window.__native provides the phone's own TTS / speech recognition.
const native = () => window.__native;

// ------------------------------------------------------------------ natural voice (bundled)
// Each edition ships with pre-recorded voice packs (audio/<lang>.bin + audio/<lang>.json, made by
// mobile/scripts/make-audio.ts): every word, sentence, grammar example and story of the course,
// played offline on any phone. Anything else (custom words, higher levels, AI sentences) uses the
// phone's own voice.

const SILENT_WAV = "data:audio/wav;base64,UklGRigAAABXQVZFZm10IBIAAAABAAEARKwAAIhYAQACABAAAABkYXRhAgAAAAEA";
const packs = new Map<string, Promise<{ index: Record<string, [number, number]>; bin: ArrayBuffer } | null>>();
let player: HTMLAudioElement | null = null;
let activeUrl: string | null = null;
let activeSource: AudioBufferSourceNode | null = null;
let activeDone: ((status: "ok" | "stopped" | "error") => void) | null = null;
let audioCtx: AudioContext | null = null;
let unlocked = false;
let speakId = 0;

const normAudioKey = (t: string) =>
  String(t || "")
    .toLowerCase()
    .replace(/[[\]]/g, "")
    .replace(/\s+/g, " ")
    .trim();

const stripAudioPunct = (t: string) => t.replace(/[.!?。！？、，]+$/g, "").trim();

function loadPack(code: string) {
  if (!packs.has(code)) {
    packs.set(
      code,
      Promise.all([
        fetch(`audio/${code}.json`).then((r) => (r.ok ? r.json() : null)),
        fetch(`audio/${code}.bin`).then((r) => (r.ok ? r.arrayBuffer() : null)),
      ])
        .then(([index, bin]) => (index && bin ? { index, bin } : null))
        .catch(() => null)
    );
  }
  return packs.get(code)!;
}

function getPlayer(): HTMLAudioElement | null {
  if (typeof Audio === "undefined") return null;
  if (!player) {
    player = new Audio();
    (player as any).preservesPitch = true;
    (player as any).webkitPreservesPitch = true;
  }
  return player;
}

function getAudioCtx(): AudioContext | null {
  const Ctx = typeof window !== "undefined" && (window.AudioContext || window.webkitAudioContext);
  if (!Ctx) return null;
  try {
    audioCtx ||= window.__splashAudio || new Ctx();
    if (audioCtx.state === "suspended") audioCtx.resume().catch(() => {});
    return audioCtx;
  } catch {
    return null;
  }
}

// Unlock one shared <audio> element on the first tap so Safari and mobile WebViews allow
// automatic playback in exercises (speakSoon) and multi-sentence story loops.
function unlockAudio() {
  if (unlocked) return;
  unlocked = true;
  const p = getPlayer();
  if (p && !activeDone && !p.src) {
    p.muted = true;
    p.src = SILENT_WAV;
    p.play()
      .then(() => {
        if (!activeDone && p.src === SILENT_WAV) {
          p.pause();
          p.muted = false;
        }
      })
      .catch(() => {
        p.muted = false;
        unlocked = false;
      });
  }
  getAudioCtx();
  // Quietly warm up the current language's voice pack so the first word plays with zero delay.
  const lang = T.speechLang();
  if (lang) loadPack(lang.split("-")[0].toLowerCase());
}
if (typeof document !== "undefined" && !(typeof navigator !== "undefined" && navigator.webdriver)) {
  for (const ev of ["pointerdown", "touchstart", "keydown"]) {
    document.addEventListener(ev, unlockAudio, { capture: true, passive: true });
  }
}

function stopActiveAudio() {
  const done = activeDone;
  activeDone = null;
  if (player) {
    // Clear handlers BEFORE pausing so stopping never fires onerror or triggers a fallback voice.
    player.onended = null;
    player.onerror = null;
    try {
      player.pause();
    } catch {}
  }
  if (activeSource) {
    const src = activeSource;
    activeSource = null;
    src.onended = null;
    try {
      src.stop();
    } catch {}
  }
  if (activeUrl) {
    URL.revokeObjectURL(activeUrl);
    activeUrl = null;
  }
  done?.("stopped");
}

async function playSlice(slice: ArrayBuffer, rate: number, myId: number): Promise<"ok" | "stopped" | "error"> {
  if (typeof navigator !== "undefined" && navigator.webdriver) return "ok";
  if (myId !== speakId) return "stopped";
  stopActiveAudio();

  const p = getPlayer();
  const speed = Math.max(0.5, Math.min(1.5, rate / 0.8));
  if (p) {
    const res = await new Promise<"ok" | "stopped" | "blocked" | "error">((resolve) => {
      const url = URL.createObjectURL(new Blob([slice], { type: "audio/mpeg" }));
      activeUrl = url;
      let settled = false;
      const finish = (status: "ok" | "stopped" | "blocked" | "error") => {
        if (settled) return;
        settled = true;
        p.onended = null;
        p.onerror = null;
        if (activeDone) activeDone = null;
        if (activeUrl === url) {
          URL.revokeObjectURL(url);
          activeUrl = null;
        }
        resolve(status);
      };
      activeDone = (s) => finish(s);
      p.muted = false;
      p.src = url;
      p.playbackRate = speed;
      p.onended = () => finish("ok");
      p.onerror = () => finish("error");
      p.play().catch((err) => finish(err?.name === "NotAllowedError" ? "blocked" : "error"));
    });
    if (res === "ok" || res === "stopped") return res;
  }

  // If <audio> was blocked by autoplay policy, decode and play the same neural MP3 via Web Audio.
  if (myId !== speakId) return "stopped";
  const c = getAudioCtx();
  if (!c) return "error";
  try {
    const audioBuf = await c.decodeAudioData(slice.slice(0));
    if (myId !== speakId) return "stopped";
    return await new Promise<"ok" | "stopped" | "error">((resolve) => {
      const src = c.createBufferSource();
      src.buffer = audioBuf;
      src.playbackRate.value = speed;
      src.connect(c.destination);
      activeSource = src;
      let settled = false;
      const finish = (status: "ok" | "stopped" | "error") => {
        if (settled) return;
        settled = true;
        src.onended = null;
        if (activeSource === src) activeSource = null;
        if (activeDone) activeDone = null;
        resolve(status);
      };
      activeDone = (s) => finish(s);
      src.onended = () => finish("ok");
      src.start(0);
    });
  } catch {
    return "error";
  }
}

async function speakNeural(text: string, lang: string, rate: number, myId: number): Promise<"handled" | "missing"> {
  if (typeof navigator !== "undefined" && navigator.webdriver) return "missing";
  const key = normAudioKey(text);
  if (!key) return "handled";
  const code = lang.split("-")[0].toLowerCase();

  // The bundled voice pack (words, sentences, grammar, stories).
  const pack = await loadPack(code);
  if (myId !== speakId) return "handled";
  if (pack) {
    const slice = pack.index[key] || pack.index[stripAudioPunct(key)];
    if (slice) {
      const [off, len] = slice;
      await playSlice(pack.bin.slice(off, off + len), rate, myId);
      // This text has a bundled neural clip — never fall back to the phone's old system voice.
      return "handled";
    }
  }

  return "missing";
}

export function stopSpeaking() {
  speakId++;
  stopActiveAudio();
  if (native()?.stopSpeaking) native().stopSpeaking();
  if ("speechSynthesis" in window) speechSynthesis.cancel();
}

export async function speak(text, { slow = false } = {}) {
  const raw = String(text || "").trim();
  if (!raw) return;
  stopSpeaking();
  const myId = speakId;
  const rate0 = Number(state.settings?.tts_rate || 0.8);
  const rate = slow ? Math.max(0.4, rate0 - 0.35) : rate0;
  const lang = T.speechLang();
  const status = await speakNeural(raw, lang, rate, myId);
  if (status !== "missing" || myId !== speakId) return;
  warnNoVoice();
  if (native()?.speak) return native().speak(raw, rate, lang).catch(() => {});
  if (!("speechSynthesis" in window)) return;
  speechSynthesis.cancel();
  return new Promise<void>((resolve) => {
    const u = new SpeechSynthesisUtterance(raw);
    u.lang = lang;
    const voice = pickVoice(lang);
    if (voice) u.voice = voice;
    u.rate = rate;
    u.onend = u.onerror = () => resolve();
    speechSynthesis.speak(u);
  });
}

async function nativeOrBrowserVoice(lang: string): Promise<boolean> {
  if (native()?.voiceSupported) return native().voiceSupported(lang);
  if (!("speechSynthesis" in window)) return false;
  let voices = speechSynthesis.getVoices();
  if (!voices.length) {
    await new Promise((r) => { speechSynthesis.addEventListener("voiceschanged", r, { once: true }); setTimeout(r, 1500); });
    voices = speechSynthesis.getVoices();
  }
  return !voices.length || !!pickVoice(lang);
}

/** Is there a voice for the course's language on this device? (true when it can't be told) */
export async function voiceAvailable(): Promise<boolean> {
  const lang = T.speechLang();
  if (/^(zh|ja|sl)/i.test(lang)) return true;
  return nativeOrBrowserVoice(lang);
}
export const canInstallVoice = () => !!native()?.installVoice;
export const installVoice = () => native()?.installVoice?.();

// The first time a word is read aloud without a voice for its language, say so (once per run).
let warned = false;
async function warnNoVoice() {
  if (warned) return;
  warned = true;
  if (!(await voiceAvailable())) toast(NO_VOICE, 6000);
}
export const NO_VOICE = "🔇 This device has no voice for this language yet, so words can't be read aloud. You can add one in Settings → Pronunciation.";

export const hasTTS = () => !!native()?.speak || "speechSynthesis" in window;

// ---------------------------------------------------------------- recognition

const Recognition = window.SpeechRecognition || window.webkitSpeechRecognition;
export const canRecognize = () => (native()?.recognize ? true : !!Recognition && window.isSecureContext);
export const canRecord = () => !!(navigator.mediaDevices && navigator.mediaDevices.getUserMedia && window.MediaRecorder);

/**
 * Safari, and every browser on iPhone and iPad (all WebKit): its own recognition goes through Apple
 * dictation, which has no Slovenian and stays silent unless dictation is turned on. There the word
 * is recorded and recognised on bloomko.eu (Azure AI Speech) instead. Other browsers are unchanged.
 */
export const useServerRecognition = () => !native() && /Apple/.test(navigator.vendor || "") && canRecord();
const SPEECH_URL = () => window.__speechUrl || "https://bloomko.eu/api/speech";

/** Recognises a recording (16 kHz mono WAV, base64) on bloomko.eu; resolves with alternatives, best first. */
export async function recognizeOnServer(wavBase64: string): Promise<string[]> {
  const bytes = Uint8Array.from(atob(wavBase64), (c) => c.charCodeAt(0));
  let r;
  try {
    r = await fetch(`${SPEECH_URL()}?lang=${encodeURIComponent(T.speechLang())}`, { method: "POST", headers: { "Content-Type": "audio/wav" }, body: bytes });
  } catch {
    throw new Error("Can't reach bloomko.eu — check your internet connection");
  }
  const d = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(d.error || `Speech recognition failed (${r.status})`);
  return Array.isArray(d.alternatives) ? d.alternatives.map(String) : [];
}

/** Start listening; resolves with an array of hanzi alternatives. Call .stop() to end early. */
export function recognize() {
  if (native()?.recognize) return native().recognize(T.speechLang());
  const rec = new Recognition();
  rec.lang = T.speechLang();
  rec.interimResults = false;
  rec.maxAlternatives = 4;
  rec.continuous = false;
  let finish;
  const promise: Promise<string[]> & { stop?: () => void } = new Promise<string[]>((resolve, reject) => {
    let results: string[] = [];
    rec.onresult = (e) => {
      const r = e.results[e.results.length - 1];
      results = Array.from(r as ArrayLike<{ transcript: string }>).map((a) => a.transcript);
    };
    rec.onerror = (e) => {
      if (e.error === "no-speech" || e.error === "aborted") resolve([]);
      else reject(new Error(e.error === "not-allowed" ? "Microphone permission denied" : `Speech recognition: ${e.error}`));
    };
    rec.onend = () => resolve(results);
    finish = () => rec.stop();
  });
  rec.start();
  promise.stop = finish;
  return promise;
}

// ---------------------------------------------------------------- recording

export class Recorder {
  stream: MediaStream;
  chunks: Blob[];
  mr: MediaRecorder;
  done: Promise<unknown>;

  async start() {
    this.stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true } });
    this.chunks = [];
    this.mr = new MediaRecorder(this.stream);
    this.mr.ondataavailable = (e) => e.data.size && this.chunks.push(e.data);
    this.done = new Promise((r) => (this.mr.onstop = r));
    this.mr.start();
  }

  /** Stops and returns { url, wavBase64 } — WAV is 16 kHz mono, what speech models expect. */
  async stop() {
    this.mr.stop();
    await this.done;
    this.stream.getTracks().forEach((t) => t.stop());
    const blob = new Blob(this.chunks, { type: this.mr.mimeType || "audio/webm" });
    const url = URL.createObjectURL(blob);
    let wavBase64 = null;
    try {
      wavBase64 = await toWavBase64(blob);
    } catch (e) {
      console.warn("WAV conversion failed", e);
    }
    return { url, wavBase64 };
  }
}

async function toWavBase64(blob) {
  const ctx = new (window.AudioContext || window.webkitAudioContext)();
  const decoded = await ctx.decodeAudioData(await blob.arrayBuffer());
  ctx.close();
  const rate = 16000;
  const offline = new OfflineAudioContext(1, Math.ceil(decoded.duration * rate), rate);
  const src = offline.createBufferSource();
  src.buffer = decoded;
  src.connect(offline.destination);
  src.start();
  const rendered = await offline.startRendering();
  const pcm = rendered.getChannelData(0);

  const buf = new ArrayBuffer(44 + pcm.length * 2);
  const v = new DataView(buf);
  const str = (o, s) => [...s].forEach((c, i) => v.setUint8(o + i, c.charCodeAt(0)));
  str(0, "RIFF"); v.setUint32(4, 36 + pcm.length * 2, true); str(8, "WAVE");
  str(12, "fmt "); v.setUint32(16, 16, true); v.setUint16(20, 1, true); v.setUint16(22, 1, true);
  v.setUint32(24, rate, true); v.setUint32(28, rate * 2, true); v.setUint16(32, 2, true); v.setUint16(34, 16, true);
  str(36, "data"); v.setUint32(40, pcm.length * 2, true);
  for (let i = 0; i < pcm.length; i++) {
    const s = Math.max(-1, Math.min(1, pcm[i]));
    v.setInt16(44 + i * 2, s < 0 ? s * 0x8000 : s * 0x7fff, true);
  }
  let bin = "";
  const bytes = new Uint8Array(buf);
  for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(bin);
}

// ---------------------------------------------------------------- the microphone in use
// A speaking exercise registers how to stop its recording / recognition, so leaving the exercise
// (Continue, Skip, Quit) always turns the microphone off.
let activeMic: (() => void) | null = null;
let generation = 0; // goes up whenever an exercise ends

export function setActiveMic(stop: (() => void) | null) {
  activeMic = stop;
}
export function stopMic() {
  generation++;
  const stop = activeMic;
  activeMic = null;
  try {
    stop?.();
  } catch {
    /* already stopped */
  }
}

/** Say something a moment after an exercise appears — unless it has already been left. */
export function speakSoon(text: () => string, ms: number) {
  const g = generation;
  setTimeout(() => g === generation && speak(text()), ms);
}
