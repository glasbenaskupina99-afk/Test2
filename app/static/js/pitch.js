// Pitch tracking for Chinese tone practice: records a short clip from the microphone,
// follows the voice's pitch (autocorrelation) and turns it into a tone contour.

export const canTrackPitch = () => !!(navigator.mediaDevices?.getUserMedia && (window.AudioContext || window.webkitAudioContext));

/** Pitch (Hz) of one audio frame, or null when it's silent or not voiced. */
export function detect(buf, sr) {
  let rms = 0;
  for (let i = 0; i < buf.length; i++) rms += buf[i] * buf[i];
  if (Math.sqrt(rms / buf.length) < 0.012) return null;
  const minLag = Math.floor(sr / 420);
  const maxLag = Math.floor(sr / 70);
  const n = buf.length - maxLag;
  const rs = new Float32Array(maxLag + 2);
  let best = 0;
  for (let lag = minLag; lag <= maxLag; lag++) {
    let s = 0;
    let e1 = 0;
    let e2 = 0;
    for (let i = 0; i < n; i += 2) {
      s += buf[i] * buf[i + lag];
      e1 += buf[i] * buf[i];
      e2 += buf[i + lag] * buf[i + lag];
    }
    rs[lag] = s / Math.sqrt(e1 * e2 + 1e-12);
    if (rs[lag] > best) best = rs[lag];
  }
  if (best < 0.72) return null;
  // The shortest period that correlates almost as well as the best one is the real pitch
  // (multiples of the period correlate too and would read an octave low).
  for (let lag = minLag + 1; lag < maxLag; lag++) {
    if (rs[lag] >= best * 0.9 && rs[lag] >= rs[lag - 1] && rs[lag] >= rs[lag + 1]) {
      // Parabolic interpolation for a finer estimate.
      const a = rs[lag - 1], b = rs[lag], c = rs[lag + 1];
      const shift = (a - c) / (2 * (a - 2 * b + c) || 1);
      return sr / (lag + (Math.abs(shift) < 1 ? shift : 0));
    }
  }
  return null;
}

/** Records for `ms` and resolves with the pitch of each ~25 ms frame (null = unvoiced). */
export async function recordPitch(ms = 1600, onFrame) {
  const stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: true } });
  const Ctx = window.AudioContext || window.webkitAudioContext;
  const ctx = new Ctx();
  try {
    const src = ctx.createMediaStreamSource(stream);
    const an = ctx.createAnalyser();
    an.fftSize = 2048;
    src.connect(an);
    const buf = new Float32Array(an.fftSize);
    const frames = [];
    const t0 = performance.now();
    await new Promise((resolve) => {
      const tick = () => {
        an.getFloatTimeDomainData(buf);
        const f = detect(buf, ctx.sampleRate);
        frames.push(f);
        onFrame?.(f, frames);
        if (performance.now() - t0 < ms) setTimeout(tick, 25);
        else resolve();
      };
      tick();
    });
    return frames;
  } finally {
    stream.getTracks().forEach((t) => t.stop());
    ctx.close().catch(() => {});
  }
}

const median = (a) => { const s = [...a].sort((x, y) => x - y); return s[Math.floor(s.length / 2)]; };

/**
 * Voiced part of the recording as points {t: 0..1, v: semitones from the speaker's middle pitch},
 * smoothed and with octave jumps folded back. Null when too little was voiced.
 */
export function contour(frames) {
  const voiced = frames.filter((f) => f);
  if (voiced.length < 5) return null;
  let st = voiced.map((f) => 12 * Math.log2(f));
  const mid = median(st);
  st = st.map((v) => { while (v - mid > 7) v -= 12; while (mid - v > 7) v += 12; return v - mid; });
  const smooth = st.map((_, i) => median(st.slice(Math.max(0, i - 2), i + 3)));
  return smooth.map((v, i) => ({ t: smooth.length > 1 ? i / (smooth.length - 1) : 0, v }));
}

/** Best guess of the Mandarin tone (1–4) a contour shows. */
export function classify(points) {
  const v = points.map((p) => p.v);
  const n = v.length;
  const avg = (a) => a.reduce((s, x) => s + x, 0) / a.length;
  const q = Math.max(1, Math.floor(n / 4));
  const start = avg(v.slice(0, q));
  const end = avg(v.slice(-q));
  const min = Math.min(...v);
  const max = Math.max(...v);
  const minPos = v.indexOf(min) / Math.max(1, n - 1);
  if (max - min < 2.2) return 1;
  if (minPos > 0.2 && minPos < 0.8 && start - min > 1.2 && end - min > 1.2) return 3;
  if (start - end > 2.5) return 4;
  if (end - start > 2) return 2;
  return start > end ? 4 : 2;
}

/** Textbook shape of each tone on the 1–5 pitch scale (Chao numbers 55, 35, 214, 51). */
export const TONE_SHAPES = { 1: [[0, 5], [1, 5]], 2: [[0, 3], [1, 5]], 3: [[0, 2], [0.55, 1], [1, 4]], 4: [[0, 5], [1, 1]] };

/** SVG with the textbook tone (dashed) and your voice (solid). */
export function toneChart(tone, points) {
  const W = 260;
  const H = 150;
  const x = (t) => 20 + t * (W - 40);
  const y = (lvl) => H - 15 - ((lvl - 1) / 4) * (H - 30);
  const ideal = (TONE_SHAPES[tone] || TONE_SHAPES[1]).map(([t, l], i) => `${i ? "L" : "M"}${x(t).toFixed(1)} ${y(l).toFixed(1)}`).join(" ");
  const mine = points?.length
    ? points.map((p, i) => `${i ? "L" : "M"}${x(p.t).toFixed(1)} ${y(Math.max(1, Math.min(5, 3 + p.v / 2.5))).toFixed(1)}`).join(" ")
    : "";
  const grid = [1, 2, 3, 4, 5].map((l) => `<line x1="20" x2="${W - 20}" y1="${y(l)}" y2="${y(l)}" class="tc-grid"/>`).join("");
  return `<svg viewBox="0 0 ${W} ${H}" class="tone-chart">${grid}<path d="${ideal}" class="tc-ideal"/>${mine ? `<path d="${mine}" class="tc-mine"/>` : ""}</svg>`;
}
