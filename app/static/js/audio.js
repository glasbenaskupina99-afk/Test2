// Text-to-speech, speech recognition and WAV recording — all in the browser.
import { state } from "./state.js";

let zhVoice = null;
function pickVoice() {
  const voices = speechSynthesis.getVoices();
  zhVoice =
    voices.find((v) => /zh[-_]CN/i.test(v.lang) && /google|xiaoxiao|tingting|natural/i.test(v.name)) ||
    voices.find((v) => /zh[-_]CN/i.test(v.lang)) ||
    voices.find((v) => /^zh/i.test(v.lang)) ||
    null;
}
if ("speechSynthesis" in window) {
  pickVoice();
  speechSynthesis.onvoiceschanged = pickVoice;
}

export function speak(text, { slow = false } = {}) {
  if (!("speechSynthesis" in window)) return Promise.resolve();
  speechSynthesis.cancel();
  return new Promise((resolve) => {
    const u = new SpeechSynthesisUtterance(text);
    u.lang = "zh-CN";
    if (zhVoice) u.voice = zhVoice;
    const rate = Number(state.settings?.tts_rate || 0.8);
    u.rate = slow ? Math.max(0.4, rate - 0.35) : rate;
    u.onend = u.onerror = () => resolve();
    speechSynthesis.speak(u);
  });
}

export const hasTTS = () => "speechSynthesis" in window;

// ---------------------------------------------------------------- recognition

const Recognition = window.SpeechRecognition || window.webkitSpeechRecognition;
export const canRecognize = () => !!Recognition && window.isSecureContext;
export const canRecord = () => !!(navigator.mediaDevices && navigator.mediaDevices.getUserMedia && window.MediaRecorder);

/** Start listening; resolves with an array of hanzi alternatives. Call .stop() to end early. */
export function recognize() {
  const rec = new Recognition();
  rec.lang = "zh-CN";
  rec.interimResults = false;
  rec.maxAlternatives = 4;
  rec.continuous = false;
  let finish;
  const promise = new Promise((resolve, reject) => {
    let results = [];
    rec.onresult = (e) => {
      const r = e.results[e.results.length - 1];
      results = Array.from(r).map((a) => a.transcript);
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
