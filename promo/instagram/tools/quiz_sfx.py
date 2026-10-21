"""Sound for the quiz reels: soft music bed plus ticks, pops, strokes and reveal chimes."""
import numpy as np, wave, sys, json
name, D = sys.argv[1], float(sys.argv[2]); ev = json.loads(sys.argv[3]); out = sys.argv[4]
sr = 44100; n = int(sr * D); t = np.arange(n) / sr; L = np.zeros(n); R = np.zeros(n); rng = np.random.default_rng(3)
def add(w, s, pan=.5):
    i = int(s * sr); m = min(len(w), n - i)
    if m > 0: L[i:i+m] += w[:m] * (1 - pan) * 2; R[i:i+m] += w[:m] * pan * 2
def pluck(f, dur=1.2, amp=.2):
    tt = np.arange(int(dur * sr)) / sr; env = np.exp(-tt * 3.6) * (1 - np.exp(-tt * 400))
    return (np.sin(2*np.pi*f*tt) + .35*np.sin(2*np.pi*f*2.01*tt)*np.exp(-tt*6)) * env * amp
def tick(amp=.18, f=1800):
    tt = np.arange(int(.05 * sr)) / sr; return np.sin(2*np.pi*f*tt) * np.exp(-tt * 90) * amp
def pop(amp=.14):
    tt = np.arange(int(.09 * sr)) / sr; return np.sin(2*np.pi*(300 + 2200*tt)*tt*6) * np.exp(-tt * 45) * amp
def brush(dur=.4, amp=.08):
    m = int(dur * sr); x = rng.standard_normal(m); x = np.convolve(x, np.ones(25)/25, 'same')
    tt = np.arange(m) / sr; return x * np.sin(np.pi * tt / dur) ** 1.5 * amp * 4
# music bed: light, bouncy pentatonic plucks at 120 bpm
scale = [523.3, 587.3, 659.3, 784.0, 880.0]; idx = 2
for k in range(int((D - 1) / .25)):
    if k % 2 == 0 or rng.random() < .3:
        idx = int(np.clip(idx + rng.integers(-2, 3), 0, 4)); add(pluck(scale[idx], .6, .045), .1 + k * .25, .3 + .4 * rng.random())
for k in range(int(D / .5)):
    add(pluck(130.8 if (k // 4) % 2 == 0 else 110.0, .5, .06), k * .5)
for s in ev.get("pop", []): add(pop(), s)
for s in ev.get("tick", []): add(tick(), s); add(tick(.08, 1200), s + .5)
for s in ev.get("bigtick", []): add(tick(.3, 1400), s)
for s in ev.get("brush", []): add(brush(), s, .4 + .2 * rng.random())
for s in ev.get("reveal", []):
    for j, f in enumerate([784.0, 987.8, 1174.7, 1568.0]): add(pluck(f, 1.4, .17), s + j * .06, .35 + .1 * j)
for s in ev.get("chime", []):
    for j, f in enumerate([523.3, 784.0, 1046.5]): add(pluck(f, 2.0, .14), s + j * .08, .35 + .15 * j)
fade = np.minimum(1, t / .15) * np.minimum(1, (D - t) / .8)
st = np.stack([L, R], 1) * fade[:, None]; st /= np.abs(st).max() * 1.12
w = wave.open(out, 'wb'); w.setnchannels(2); w.setsampwidth(2); w.setframerate(sr); w.writeframes((st * 32767).astype('<i2').tobytes()); w.close()
