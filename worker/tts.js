// Neural text-to-speech (/api/tts?lang=sl&text=…) for words and AI-made sentences.
// Uses Microsoft Edge's natural voices (sl-SI-PetraNeural, zh-CN-XiaoxiaoNeural, ja-JP-NanamiNeural)
// and caches each spoken phrase at the Cloudflare edge.

const TRUSTED_CLIENT_TOKEN = "6A5AA1D4EAFF4E9FB37E23D68491D6F4";
const SEC_MS_GEC_VERSION = "2-143.0.3650.75";
const WIN_EPOCH = 11644473600;

const VOICES = {
  sl: { voice: "sl-SI-PetraNeural", lang: "sl-SI" },
  "sl-si": { voice: "sl-SI-PetraNeural", lang: "sl-SI" },
  zh: { voice: "zh-CN-XiaoxiaoNeural", lang: "zh-CN" },
  "zh-cn": { voice: "zh-CN-XiaoxiaoNeural", lang: "zh-CN" },
  ja: { voice: "ja-JP-NanamiNeural", lang: "ja-JP" },
  "ja-jp": { voice: "ja-JP-NanamiNeural", lang: "ja-JP" },
};

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
};

const SHA256_INITIAL = [0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a, 0x510e527f, 0x9b05688c, 0x1f83d9ab, 0x5be0cd19];
const SHA256_STATE = [0xfd9fbea2, 0x91243ce7, 0xbe499094, 0xcd2e1e0a, 0x6c006f49, 0x04bd35ab, 0xfeb0a7e4, 0x03effbd2];
const SHA256_SCHEDULE = [
  0xeb24bf9e, 0x1558691f, 0xa0c09ee2, 0x0cfa32ba, 0xa622ee8c, 0xd1dd9491, 0xc0dd25a0,
  0xf9e70ab6, 0xf0c31573, 0x7058ce4e, 0x7188e606, 0x00e5ab33, 0xd258b060, 0x72766564,
];
const SHA256_ROUND_CONSTANTS = [
  0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5,
  0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174,
  0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
  0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967,
  0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85,
  0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
  0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3,
  0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208, 0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2,
];
const SHA256_ADJUSTMENT = 0xc9dc06a7;
const SHA256_BLOCK_CONSTANTS = [...SHA256_ROUND_CONSTANTS.slice(0, 14), SHA256_ADJUSTMENT, ...SHA256_ROUND_CONSTANTS.slice(15)];
const SHA256_SIGMA0_ADJUSTMENT = 0x059c0b80;
const SHA256_SIGMA1_ADJUSTMENT = 0x000b92c0;

const CS64_COEFFICIENTS = [
  [0xe82e91b1, 0xb32700d0], [0x44de24c6, 0x88dff51d], [0x3beb65bc, 0x29514038], [0xc89c5933, 0xb328cbdf],
  [0x8d1ec211, 0xd405b4d5], [0x314ef5d5, 0x26e55f3c], [0xe92491b1, 0x607801c6], [0xf0a5b9d5, 0x82b2c1fb],
  [0x06064cf3, 0xfa51a3da], [0xda79fa60, 0x207cc464], [0xbed20560, 0x3c3c74f3], [0x89f9c9f8, 0xd2d14b61],
  [0x35fa38c6, 0xbb04a2c1], [0xcb49e3c6, 0xc5626167],
];
const CS64_FACTOR = 0x82893933;
const CS64_ADJUSTMENT0 = 0xf2f90b1a;
const CS64_ADJUSTMENT1 = 0x0b1a0000;

const mul32 = (a, b) => Math.imul(a, b) >>> 0;
const rotr = (v, n) => ((v >>> n) | (v << (32 - n))) >>> 0;
const rol16 = (v) => (((v >>> 0) << 16) | ((v >>> 0) >>> 16)) >>> 0;
const sigma0 = (v) => (rotr(v, 7) ^ rotr(v, 18) ^ (v >>> 3)) >>> 0;
const sigma1 = (v) => (rotr(v, 17) ^ rotr(v, 19) ^ (v >>> 10)) >>> 0;

function sha256Rounds(state, words, firstRound = 0) {
  let [a, b, c, d, e, f, g, h] = state;
  const constants = firstRound === 14 ? SHA256_BLOCK_CONSTANTS : SHA256_ROUND_CONSTANTS;
  for (let i = firstRound; i < 64; i++) {
    const s1 = (rotr(e, 6) ^ rotr(e, 11) ^ rotr(e, 25)) >>> 0;
    const ch = (g ^ (e & (f ^ g))) >>> 0;
    const t1 = (h + s1 + ch + constants[i] + words[i]) >>> 0;
    const s0 = (rotr(a, 2) ^ rotr(a, 13) ^ rotr(a, 22)) >>> 0;
    const maj = ((a & b) | (c & (a | b))) >>> 0;
    const t2 = (s0 + maj) >>> 0;
    h = g; g = f; f = e; e = (d + t1) >>> 0; d = c; c = b; b = a; a = (t1 + t2) >>> 0;
  }
  return [a, b, c, d, e, f, g, h];
}

function expandSchedule(words, firstWord = 16) {
  for (let i = firstWord; i < 64; i++) {
    words[i] = (sigma1(words[i - 2]) + words[i - 7] + sigma0(words[i - 15]) + words[i - 16]) >>> 0;
  }
}

function sha256Init(data7) {
  const words = new Array(64).fill(0);
  words[14] = ((data7[0] << 16) | (data7[1] << 8) | data7[2]) >>> 0;
  words[15] = ((data7[3] << 24) | (data7[4] << 16) | (data7[5] << 8) | data7[6]) >>> 0;
  for (let i = 16; i < 30; i++) {
    let val = SHA256_SCHEDULE[i - 16];
    if (i - 2 >= 14) val = (val + (i === 16 ? (sigma1(words[i - 2]) ^ SHA256_SIGMA1_ADJUSTMENT) >>> 0 : sigma1(words[i - 2]))) >>> 0;
    if (i - 7 >= 14) val = (val + words[i - 7]) >>> 0;
    if (i - 15 >= 14) val = (val + (i === 29 ? (sigma0(words[i - 15]) ^ SHA256_SIGMA0_ADJUSTMENT) >>> 0 : sigma0(words[i - 15]))) >>> 0;
    words[i] = val >>> 0;
  }
  words[30] = (sigma1(words[28]) + words[23] + sigma0(words[15]) + words[14] + SHA256_ADJUSTMENT - SHA256_ROUND_CONSTANTS[14]) >>> 0;
  expandSchedule(words, 31);
  const working = sha256Rounds(SHA256_STATE, words, 14);
  return SHA256_INITIAL.map((x, idx) => (x + working[idx]) >>> 0);
}

function sha256Digest(data) {
  const length = 57 + data.length;
  const tail = data.slice(7);
  const padZeroes = (((55 - length) % 64) + 64) % 64;
  const padded = new Uint8Array(tail.length + 1 + padZeroes + 8);
  padded.set(tail, 0);
  padded[tail.length] = 0x80;
  const dv = new DataView(padded.buffer);
  dv.setBigUint64(padded.length - 8, BigInt(length * 8), false);
  let state = sha256Init(data.slice(0, 7));
  for (let off = 0; off < padded.length; off += 64) {
    const words = new Array(64).fill(0);
    for (let j = 0; j < 16; j++) words[j] = dv.getUint32(off + j * 4, false);
    expandSchedule(words, 16);
    const working = sha256Rounds(state, words, 0);
    state = state.map((x, idx) => (x + working[idx]) >>> 0);
  }
  const out = new Uint8Array(32);
  const outDv = new DataView(out.buffer);
  state.forEach((v, i) => outDv.setUint32(i * 4, v, false));
  return out;
}

function cs64Digest(data, digest) {
  const dDv = new DataView(digest.buffer, digest.byteOffset, digest.byteLength);
  const keyA = (dDv.getUint32(0, true) | 1) >>> 0;
  const keyB = (dDv.getUint32(4, true) | 1) >>> 0;
  const factors = [mul32(keyA, CS64_FACTOR), mul32(keyB, CS64_FACTOR)];
  const terms = CS64_COEFFICIENTS.map(([c], i) => mul32(c, factors[i % 2]));
  const offsets = CS64_COEFFICIENTS.map(([, o]) => o >>> 0);

  const raw = new Uint8Array(1 + data.length);
  raw.set(data, 1);
  const rem = (4 - (raw.length % 4)) % 4;
  const padded = new Uint8Array(raw.length + rem);
  padded.set(raw, 0);
  const pDv = new DataView(padded.buffer);
  const words = [];
  for (let i = 0; i < padded.length; i += 4) words.push(pDv.getUint32(i, true));
  if (words.length % 2 === 1) words.push(0);

  for (let i = 0; i < words.length; i++) {
    const w = words[i];
    let term = mul32(w, i % 2 === 0 ? keyA : keyB);
    let offset = mul32(rol16(w), i % 2 === 0 ? 0xef0569fb : 0xc31713db);
    if (i === 0) {
      term = (term + mul32(CS64_ADJUSTMENT0, factors[0])) >>> 0;
      offset = (offset + CS64_ADJUSTMENT1) >>> 0;
    }
    terms.push(term);
    offsets.push(offset);
  }

  let swapAcc = 0, swapLast = 0, state = 0, acc = 0;
  for (let i = 0; i < terms.length; i += 2) {
    const x = terms[i], y = terms[i + 1];
    let t = rol16((offsets[i] + x) >>> 0);
    let q = mul32(t, 0x76f50f34);
    swapAcc = (swapAcc + ((mul32(rol16(q), 0xc3efea97) + q) >>> 0)) >>> 0;
    t = rol16((offsets[i + 1] + y) >>> 0);
    q = mul32(t, 0x1881ce3c);
    swapLast = (mul32(rol16(q), 0x35bd1ec9) + q) >>> 0;
    swapAcc = (swapAcc + swapLast) >>> 0;

    state = (mul32(state, keyA) + x) >>> 0;
    state = mul32(rol16(state), 0xcf98b111);
    state = mul32(rol16(state), 0x87085b9f);
    state = mul32(rol16(state), 0x12ceb96d);
    state = mul32(rol16(state), 0x257e1d83);
    acc = (acc + state) >>> 0;
    t = (mul32(state, keyB) + y) >>> 0;
    t = mul32(rol16(t), 0xa27416f5);
    t = mul32(rol16(t), 0xd38396ff);
    state = mul32(rol16(mul32(rol16(t), 0x7c932b89)), 0xbfa49f69);
    acc = (acc + state) >>> 0;
  }
  const out = new Uint8Array(8);
  const outDv = new DataView(out.buffer);
  outDv.setUint32(0, (swapLast ^ state) >>> 0, true);
  outDv.setUint32(4, (swapAcc ^ acc) >>> 0, true);
  return out;
}

const hex = (u8) => Array.from(u8, (b) => b.toString(16).padStart(2, "0")).join("").toUpperCase();

let skewSec = 0;

export function generateSecMsGecV2(unixSec = Math.floor(Date.now() / 1000) + skewSec) {
  let ticks = Math.floor(unixSec) + WIN_EPOCH;
  ticks -= ticks % 300;
  const str = `${ticks}0000000${TRUSTED_CLIENT_TOKEN}`;
  const data = new TextEncoder().encode(str);
  const digest = sha256Digest(data);
  const cs64 = cs64Digest(data, digest);
  return `${hex(cs64)}-${hex(digest)}`;
}

function concatBytes(arrays) {
  const total = arrays.reduce((s, a) => s + a.byteLength, 0);
  const out = new Uint8Array(total);
  let off = 0;
  for (const a of arrays) {
    out.set(a, off);
    off += a.byteLength;
  }
  return out;
}

function trimMp3(raw, boundaries) {
  if (!boundaries.length || raw.byteLength < 288) return raw;
  const firstStartSec = Math.max(0, boundaries[0].offset / 1e7 - 0.04);
  const last = boundaries[boundaries.length - 1];
  const lastEndSec = (last.offset + last.duration) / 1e7 + 0.16;
  const startFrame = Math.max(0, Math.floor((firstStartSec * 6000) / 144));
  const endFrame = Math.min(Math.floor(raw.byteLength / 144), Math.ceil((lastEndSec * 6000) / 144));
  if (endFrame <= startFrame + 2) return raw;
  return raw.subarray(startFrame * 144, endFrame * 144);
}

async function synthesizeOnce(text, voice, lang) {
  const connId = crypto.randomUUID().replace(/-/g, "");
  const secMsGec = generateSecMsGecV2();
  const muid = hex(crypto.getRandomValues(new Uint8Array(16)));
  const url = `https://speech.platform.bing.com/consumer/speech/synthesize/readaloud/edge/v1?TrustedClientToken=${TRUSTED_CLIENT_TOKEN}&Sec-MS-GEC=${secMsGec}&Sec-MS-GEC-Version=${SEC_MS_GEC_VERSION}&ConnectionId=${connId}`;

  const res = await fetch(url, {
    headers: {
      Upgrade: "websocket",
      Pragma: "no-cache",
      "Cache-Control": "no-cache",
      Cookie: `muid=${muid};`,
      Origin: "chrome-extension://jdiccldimpdaibmpdkjnbmckianbfold",
      "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/143.0.0.0 Safari/537.36 Edg/143.0.0.0",
    },
  });

  if (res.status !== 101 || !res.webSocket) {
    const serverDate = res.headers.get("Date");
    if (serverDate) {
      const parsed = Date.parse(serverDate);
      if (!Number.isNaN(parsed)) skewSec = Math.round(parsed / 1000) - Math.floor(Date.now() / 1000);
    }
    throw new Error(`TTS upstream ${res.status}`);
  }

  const ws = res.webSocket;
  ws.accept();

  return new Promise((resolve, reject) => {
    const chunks = [];
    const bounds = [];
    const timer = setTimeout(() => {
      try { ws.close(); } catch {}
      reject(new Error("TTS timeout"));
    }, 8000);

    ws.addEventListener("message", (ev) => {
      if (typeof ev.data === "string") {
        if (ev.data.includes("Path:audio.metadata")) {
          try {
            const j = JSON.parse(ev.data.split("\r\n\r\n")[1]);
            for (const m of j.Metadata || []) {
              if (m.Type === "WordBoundary" && m.Data) bounds.push({ offset: m.Data.Offset, duration: m.Data.Duration });
            }
          } catch {}
        } else if (ev.data.includes("Path:turn.end")) {
          clearTimeout(timer);
          try { ws.close(); } catch {}
          resolve(trimMp3(concatBytes(chunks), bounds));
        }
      } else if (ev.data instanceof ArrayBuffer) {
        const buf = new Uint8Array(ev.data);
        if (buf.byteLength < 2) return;
        const hLen = (buf[0] << 8) | buf[1];
        if (buf.byteLength <= 2 + hLen) return;
        const header = new TextDecoder().decode(buf.subarray(2, 2 + hLen));
        if (header.includes("Path:audio")) chunks.push(buf.subarray(2 + hLen));
      }
    });
    ws.addEventListener("error", (e) => {
      clearTimeout(timer);
      reject(e);
    });
    ws.addEventListener("close", () => {
      clearTimeout(timer);
      if (chunks.length) resolve(trimMp3(concatBytes(chunks), bounds));
      else reject(new Error("TTS closed"));
    });

    ws.send(
      `X-Timestamp:${new Date().toUTCString()}\r\nContent-Type:application/json; charset=utf-8\r\nPath:speech.config\r\n\r\n` +
        JSON.stringify({
          context: {
            synthesis: {
              audio: {
                metadataoptions: { sentenceBoundaryEnabled: "false", wordBoundaryEnabled: "true" },
                outputFormat: "audio-24khz-48kbitrate-mono-mp3",
              },
            },
          },
        })
    );

    const reqId = crypto.randomUUID().replace(/-/g, "");
    const escaped = text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
    ws.send(
      `X-RequestId:${reqId}\r\nContent-Type:application/ssml+xml\r\nX-Timestamp:${new Date().toUTCString()}Z\r\nPath:ssml\r\n\r\n` +
        `<speak version='1.0' xmlns='http://www.w3.org/2001/10/synthesis' xml:lang='${lang}'>` +
        `<voice name='${voice}'><prosody pitch='+0Hz' rate='+0%' volume='+0%'>${escaped}</prosody></voice></speak>`
    );
  });
}

export async function handleTts(request, ctx) {
  if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: CORS });
  if (request.method !== "GET") return new Response("Use GET", { status: 405, headers: CORS });

  const url = new URL(request.url);
  const langKey = String(url.searchParams.get("lang") || "sl").toLowerCase();
  const cfg = VOICES[langKey] || VOICES[langKey.split("-")[0]] || VOICES.sl;
  const text = String(url.searchParams.get("text") || "").replace(/\s+/g, " ").trim();
  if (!text || text.length > 240) {
    return new Response(JSON.stringify({ error: "text must be 1–240 chars" }), {
      status: 400,
      headers: { ...CORS, "Content-Type": "application/json" },
    });
  }

  const cache = typeof caches !== "undefined" ? caches.default : null;
  const cacheReq = new Request(`https://bloomko.eu/api/tts?v=1&lang=${cfg.lang}&text=${encodeURIComponent(text.toLowerCase())}`);
  if (cache) {
    const hit = await cache.match(cacheReq);
    if (hit) return hit;
  }

  try {
    let mp3;
    try {
      mp3 = await synthesizeOnce(text, cfg.voice, cfg.lang);
    } catch {
      mp3 = await synthesizeOnce(text, cfg.voice, cfg.lang);
    }
    if (!mp3 || !mp3.byteLength) throw new Error("empty audio");
    const response = new Response(mp3, {
      status: 200,
      headers: {
        ...CORS,
        "Content-Type": "audio/mpeg",
        "Cache-Control": "public, max-age=31536000, immutable",
      },
    });
    if (cache && ctx?.waitUntil) ctx.waitUntil(cache.put(cacheReq, response.clone()));
    return response;
  } catch (e) {
    return new Response(JSON.stringify({ error: "tts unavailable" }), {
      status: 502,
      headers: { ...CORS, "Content-Type": "application/json", "Cache-Control": "no-store" },
    });
  }
}
