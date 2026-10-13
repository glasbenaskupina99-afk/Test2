// Short nature-style sounds, synthesised with Web Audio (no audio files): a kalimba pluck and a
// bird chirp for a right answer, a soft wooden knock for a wrong one, wind chimes and a little
// bird trill when a lesson ends, and wind through the leaves when you tap your plant.

let ctx = null;
let noiseBuf = null;

export function soundsOn() {
  try {
    return localStorage.getItem("sounds") !== "off";
  } catch {
    return true;
  }
}
export function setSounds(on) {
  try { localStorage.setItem("sounds", on ? "on" : "off"); } catch { /* ignore */ }
}

function ac() {
  if (!soundsOn()) return null;
  const Ctx = window.AudioContext || window.webkitAudioContext;
  if (!Ctx) return null;
  try {
    ctx ||= new Ctx();
    if (ctx.state === "suspended") ctx.resume();
    return ctx;
  } catch {
    return null;
  }
}

/** Gain node into the speakers at a gentle master volume. */
function out(c, volume = 0.5) {
  const g = c.createGain();
  g.gain.value = volume;
  g.connect(c.destination);
  return g;
}

/** Kalimba / wooden-tine pluck: sine with a quickly fading bright overtone. */
function pluck(c, dest, freq, t, { dur = 0.9, vol = 0.5 } = {}) {
  const env = c.createGain();
  env.gain.setValueAtTime(0.0001, t);
  env.gain.exponentialRampToValueAtTime(vol, t + 0.008);
  env.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  env.connect(dest);
  for (const [mult, amp, d] of [[1, 1, dur], [3.01, 0.35, dur * 0.25], [5.4, 0.12, dur * 0.12]]) {
    const o = c.createOscillator();
    const g = c.createGain();
    o.type = "sine";
    o.frequency.value = freq * mult;
    g.gain.setValueAtTime(amp, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + d);
    o.connect(g).connect(env);
    o.start(t);
    o.stop(t + dur + 0.05);
  }
}

/** A small bird chirp: a fast upward-sweeping whistle. */
function chirp(c, dest, t, { from = 2600, to = 4200, dur = 0.09, vol = 0.12 } = {}) {
  const o = c.createOscillator();
  const g = c.createGain();
  o.type = "sine";
  o.frequency.setValueAtTime(from, t);
  o.frequency.exponentialRampToValueAtTime(to, t + dur);
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(vol, t + dur * 0.3);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  o.connect(g).connect(dest);
  o.start(t);
  o.stop(t + dur + 0.02);
}

function noise(c) {
  if (noiseBuf) return noiseBuf;
  const len = c.sampleRate * 2;
  noiseBuf = c.createBuffer(1, len, c.sampleRate);
  const d = noiseBuf.getChannelData(0);
  let last = 0;
  for (let i = 0; i < len; i++) {
    // Brown-ish noise: softer than white, closer to wind.
    last = (last + 0.02 * (Math.random() * 2 - 1)) / 1.02;
    d[i] = last * 3.5;
  }
  return noiseBuf;
}

/** Right answer: two rising kalimba notes and a tiny chirp. */
export function playCorrect() {
  const c = ac();
  if (!c) return;
  const t = c.currentTime + 0.01;
  const o = out(c, 0.55);
  pluck(c, o, 659.25, t, { dur: 0.6, vol: 0.45 }); // E5
  pluck(c, o, 987.77, t + 0.09, { dur: 0.8, vol: 0.5 }); // B5
  chirp(c, o, t + 0.2, { vol: 0.07 });
}

/** Wrong answer: a soft, low wooden knock — gentle, not a buzzer. */
export function playWrong() {
  const c = ac();
  if (!c) return;
  const t = c.currentTime + 0.01;
  const o = out(c, 0.5);
  for (const [f, dt] of [[196, 0], [155.56, 0.12]]) {
    const osc = c.createOscillator();
    const g = c.createGain();
    osc.type = "triangle";
    osc.frequency.setValueAtTime(f * 1.15, t + dt);
    osc.frequency.exponentialRampToValueAtTime(f, t + dt + 0.05);
    g.gain.setValueAtTime(0.0001, t + dt);
    g.gain.exponentialRampToValueAtTime(0.5, t + dt + 0.006);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dt + 0.22);
    osc.connect(g).connect(o);
    osc.start(t + dt);
    osc.stop(t + dt + 0.25);
  }
}

/** Lesson finished: wind chimes on a pentatonic chord and a little bird trill. */
export function playComplete() {
  const c = ac();
  if (!c) return;
  const t = c.currentTime + 0.02;
  const o = out(c, 0.5);
  [523.25, 659.25, 783.99, 1046.5, 1318.5].forEach((f, i) => pluck(c, o, f, t + i * 0.11 + Math.random() * 0.02, { dur: 1.6, vol: 0.32 }));
  for (let i = 0; i < 4; i++) chirp(c, o, t + 0.75 + i * 0.075, { from: 3000 + i * 150, to: 4300, dur: 0.06, vol: 0.06 });
}

/** Tapping your plant: a breath of wind through leaves and a distant bird (~1.5 s). */
export function playForest() {
  const c = ac();
  if (!c) return;
  const t = c.currentTime + 0.01;
  const o = out(c, 0.6);
  const src = c.createBufferSource();
  src.buffer = noise(c);
  const bp = c.createBiquadFilter();
  bp.type = "bandpass";
  bp.Q.value = 0.7;
  bp.frequency.setValueAtTime(500, t);
  bp.frequency.linearRampToValueAtTime(1300, t + 0.7);
  bp.frequency.linearRampToValueAtTime(700, t + 1.5);
  const g = c.createGain();
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(0.5, t + 0.45);
  g.gain.exponentialRampToValueAtTime(0.0001, t + 1.55);
  src.connect(bp).connect(g).connect(o);
  // Leaves: a quieter, brighter rustle on top.
  const src2 = c.createBufferSource();
  src2.buffer = noise(c);
  const hp = c.createBiquadFilter();
  hp.type = "highpass";
  hp.frequency.value = 2500;
  const g2 = c.createGain();
  g2.gain.setValueAtTime(0.0001, t);
  g2.gain.exponentialRampToValueAtTime(0.18, t + 0.5);
  g2.gain.exponentialRampToValueAtTime(0.0001, t + 1.3);
  src2.connect(hp).connect(g2).connect(o);
  src.start(t, Math.random());
  src.stop(t + 1.6);
  src2.start(t, Math.random());
  src2.stop(t + 1.4);
  chirp(c, o, t + 0.6, { from: 2400, to: 3600, dur: 0.12, vol: 0.05 });
  chirp(c, o, t + 0.78, { from: 2600, to: 3300, dur: 0.1, vol: 0.04 });
}
