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
    ctx ||= window.__splashAudio || new Ctx();
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

/** A few notes of a small songbird, starting at `t`. */
function birdSong(c, dest, t, vol = 0.05) {
  const base = 2400 + Math.random() * 900;
  const notes = 2 + Math.floor(Math.random() * 4);
  for (let i = 0; i < notes; i++) {
    const up = Math.random() < 0.6;
    chirp(c, dest, t + i * (0.09 + Math.random() * 0.05), {
      from: up ? base : base * 1.45,
      to: up ? base * 1.45 : base,
      dur: 0.06 + Math.random() * 0.05,
      vol: vol * (0.7 + Math.random() * 0.5),
    });
  }
}

/**
 * Tapping your plant: about 5 s of forest — wind coming and going through the leaves, a rustle
 * now and then and a few birds. Returns a function that fades it out early.
 */
export function playForest(seconds = 5) {
  const c = ac();
  if (!c) return () => {};
  const t = c.currentTime + 0.02;
  const end = t + seconds;
  const master = out(c, 0.6);
  master.gain.setValueAtTime(0.0001, t);
  master.gain.exponentialRampToValueAtTime(0.6, t + 0.5);
  master.gain.setValueAtTime(0.6, end - 1);
  master.gain.exponentialRampToValueAtTime(0.0001, end);
  const nodes = [];

  // Wind: brown noise through a slowly wandering band-pass, in gusts.
  const wind = c.createBufferSource();
  wind.buffer = noise(c);
  wind.loop = true;
  const bp = c.createBiquadFilter();
  bp.type = "bandpass";
  bp.Q.value = 0.6;
  const wg = c.createGain();
  bp.frequency.setValueAtTime(450, t);
  wg.gain.setValueAtTime(0.15, t);
  for (let at = t, k = 0; at < end; k++) {
    const len = 1.1 + Math.random() * 0.9;
    bp.frequency.linearRampToValueAtTime(k % 2 ? 500 + Math.random() * 200 : 1000 + Math.random() * 500, at + len);
    wg.gain.linearRampToValueAtTime(k % 2 ? 0.15 + Math.random() * 0.1 : 0.4 + Math.random() * 0.15, at + len);
    at += len;
  }
  wind.connect(bp).connect(wg).connect(master);
  wind.start(t, Math.random());
  wind.stop(end + 0.05);
  nodes.push(wind);

  // Leaves: short bright rustles.
  for (let at = t + 0.3 + Math.random() * 0.4; at < end - 0.6; at += 0.6 + Math.random() * 0.9) {
    const r = c.createBufferSource();
    r.buffer = noise(c);
    const hp = c.createBiquadFilter();
    hp.type = "highpass";
    hp.frequency.value = 2200 + Math.random() * 1200;
    const g = c.createGain();
    const d = 0.35 + Math.random() * 0.4;
    g.gain.setValueAtTime(0.0001, at);
    g.gain.exponentialRampToValueAtTime(0.1 + Math.random() * 0.08, at + d * 0.4);
    g.gain.exponentialRampToValueAtTime(0.0001, at + d);
    r.connect(hp).connect(g).connect(master);
    r.start(at, Math.random());
    r.stop(at + d + 0.05);
    nodes.push(r);
  }

  // Birds: a few short songs at different distances.
  for (let at = t + 0.5 + Math.random() * 0.5; at < end - 0.8; at += 0.9 + Math.random() * 1.2) {
    birdSong(c, master, at, 0.03 + Math.random() * 0.03);
  }

  let stopped = false;
  return () => {
    if (stopped) return;
    stopped = true;
    const now = c.currentTime;
    if (now >= end) return;
    master.gain.cancelScheduledValues(now);
    master.gain.setValueAtTime(Math.max(0.0001, master.gain.value), now);
    master.gain.exponentialRampToValueAtTime(0.0001, now + 0.3);
    setTimeout(() => master.disconnect(), 400);
  };
}
