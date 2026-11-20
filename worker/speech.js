// Speech recognition for the browser app where the browser can't do it itself: Safari (and every
// browser on iPhone and iPad, all WebKit) recognises speech through Apple dictation, which has no
// Slovenian and is off unless dictation is turned on. The app records the word (16 kHz mono WAV)
// and posts it here; Azure AI Speech (official API, own subscription) writes down what was said
// and the app grades it like any other recognition result. Nothing is stored.
//
// Secret: AZURE_SPEECH_KEY (npx wrangler secret put AZURE_SPEECH_KEY).
// Optional variable: AZURE_SPEECH_REGION (default northeurope).

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
  "Access-Control-Max-Age": "86400",
};
const json = (status, body) =>
  new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json", "Cache-Control": "no-store", ...CORS } });

/** The course languages the apps practise. */
export const SPEECH_LANGS = ["sl-SI", "zh-CN", "ja-JP"];
/** 10 seconds of 16 kHz 16-bit mono WAV — far more than one word or sentence needs. */
export const MAX_AUDIO = 44 + 10 * 16000 * 2;

/** POST /api/speech?lang=sl-SI with a WAV body → { alternatives: ["…", …] } (best first; [] when nothing was heard). */
export async function handleSpeech(request, env, fetchImpl = fetch) {
  if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: CORS });
  if (request.method !== "POST") return json(405, { error: "use POST" });
  const lang = new URL(request.url).searchParams.get("lang");
  if (!SPEECH_LANGS.includes(lang)) return json(400, { error: "unknown language" });
  if (!env.AZURE_SPEECH_KEY) return json(503, { error: "speech recognition is not set up" });
  if (Number(request.headers.get("Content-Length") || 0) > MAX_AUDIO) return json(413, { error: "recording too long" });
  const audio = await request.arrayBuffer();
  if (audio.byteLength > MAX_AUDIO) return json(413, { error: "recording too long" });
  const head = new Uint8Array(audio, 0, Math.min(12, audio.byteLength));
  const tag = (o) => String.fromCharCode(...head.subarray(o, o + 4));
  if (audio.byteLength < 1000 || tag(0) !== "RIFF" || tag(8) !== "WAVE") return json(400, { error: "send 16 kHz mono WAV" });

  const region = env.AZURE_SPEECH_REGION || "northeurope";
  let r;
  try {
    r = await fetchImpl(`https://${region}.stt.speech.microsoft.com/speech/recognition/conversation/cognitiveservices/v1?language=${lang}&format=detailed`, {
      method: "POST",
      headers: { "Ocp-Apim-Subscription-Key": env.AZURE_SPEECH_KEY, "Content-Type": "audio/wav; codecs=audio/pcm; samplerate=16000", Accept: "application/json" },
      body: audio,
    });
  } catch {
    return json(502, { error: "speech service unreachable" });
  }
  if (r.status === 429) return json(429, { error: "Too many requests — try again in a minute" });
  if (!r.ok) {
    console.error("azure stt", r.status, (await r.text()).slice(0, 200));
    return json(502, { error: "speech service error" });
  }
  const d = await r.json();
  if (d.RecognitionStatus !== "Success") return json(200, { alternatives: [] }); // NoMatch, InitialSilenceTimeout …
  const seen = new Set();
  const alternatives = [];
  for (const n of d.NBest || [{ Display: d.DisplayText }]) {
    for (const t of [n.Display, n.Lexical]) {
      const s = String(t || "").trim();
      if (s && !seen.has(s)) {
        seen.add(s);
        alternatives.push(s);
      }
    }
  }
  return json(200, { alternatives: alternatives.slice(0, 4) });
}
