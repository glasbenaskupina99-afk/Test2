// Builds the three study modes out of exercises.
import { api, h, shuffle, toast } from "./util.js";
import { runLesson } from "./lesson.js";
import * as ex from "./exercises.js";
import { state, T } from "./state.js";

const step = (make, after, key) => ({ make, after, key });

// ------------------------------------------------------------------ study mode picker

/** Ask whether to study with handwriting or with choice-only exercises. Resolves { writing } or null. */
export function pickStudyMode({ title, writingSub, choiceSub, extraNote = "" }) {
  return new Promise((resolve) => {
    let last = "writing";
    try { last = localStorage.getItem("studyMode") || "writing"; } catch { /* ignore */ }
    const choose = (mode) => {
      try { localStorage.setItem("studyMode", mode); } catch { /* ignore */ }
      bg.remove();
      resolve({ writing: mode === "writing" });
    };
    const option = (mode, emoji, label, sub, cls) =>
      h(
        "button",
        { class: `mode ${cls}`, style: last === mode ? { outline: "4px solid var(--yellow)" } : {}, onclick: () => choose(mode) },
        h("div", { class: "badge-ico" }, emoji),
        h("div", {}, h("h3", {}, label), h("p", {}, sub))
      );
    const bg = h(
      "div",
      { class: "sheet-bg", onclick: (e) => e.target === bg && (bg.remove(), resolve(null)) },
      h(
        "div",
        { class: "sheet" },
        h("h2", { style: { marginBottom: "14px" } }, title),
        h(
          "div",
          { class: "modes", style: { marginTop: 0 } },
          option("writing", "✍️", "With writing", writingSub, ""),
          option("choice", "👆", "Choice only", choiceSub, "blue")
        ),
        extraNote ? h("p", { class: "muted small center", style: { marginTop: "14px" } }, extraNote) : null
      )
    );
    document.body.append(bg);
  });
}

// ------------------------------------------------------------------ learn new words

export async function learnNew({ writing = true } = {}) {
  const { words, pool } = await api("/api/learn/next");
  if (!words.length) {
    toast("You've learned every word in your list! Add more on the Words tab.");
    return null;
  }
  const allPool = [...words, ...pool.filter((p) => !words.some((w) => w.id === p.id))];
  if (!writing) return learnChoiceOnly(words, allPool);
  const steps = [];

  for (const w of words) {
    steps.push(step((ctx) => ex.intro(ctx, w)));
    steps.push(step((ctx) => ex.trace(ctx, w), async () => ({ xp: 1 })));
    steps.push(
      step(
        (ctx) => ex.write(ctx, w, { pinyinHint: true }),
        async (res) => {
          // The word counts as learned once you've written it yourself.
          await api("/api/learn/complete", { method: "POST", body: { word_ids: [w.id], xp: 5 } });
          return { xp: 5, requeue: res.grade === 0 ? step((ctx) => ex.trace(ctx, w)) : null };
        }
      )
    );
  }

  // Mixed review of everything from this lesson.
  const finalRound = [];
  for (const w of words) {
    finalRound.push(step((ctx) => ex.multipleChoice(ctx, w, allPool), practiceAfter(w, "mc", allPool), w.id));
    finalRound.push(step((ctx) => ex.speakWord(ctx, w, { showPinyin: true }), async (r) => ({ xp: r.ok ? 2 : 1 }), w.id));
    finalRound.push(step((ctx) => ex.write(ctx, w), practiceAfter(w, "write", allPool), w.id));
  }
  steps.push(...spreadOut(shuffle(finalRound)));

  return runLesson({
    steps,
    endTitle: "New words learned!",
    onDone: (s) => api("/api/learn/complete", { method: "POST", body: { word_ids: [], xp: Math.max(0, s.xp - 6 * words.length) } }),
  });
}

/** Learn new words without handwriting: see them, then recognise meaning, reading and sound. */
function learnChoiceOnly(words, pool) {
  const steps = [];
  for (const w of words) {
    steps.push(step((ctx) => ex.intro(ctx, w)));
    steps.push(
      step(
        (ctx) => ex.choice(ctx, w, pool, "meaning"),
        async (res) => {
          await api("/api/learn/complete", { method: "POST", body: { word_ids: [w.id], xp: 3 } });
          return { xp: 3, requeue: res.ok ? null : step((ctx) => ex.choice(ctx, w, pool, "meaning"), async () => ({ xp: 1 })) };
        }
      )
    );
  }
  const finalRound = [];
  for (const w of words) {
    for (const make of [
      (ctx) => ex.multipleChoice(ctx, w, pool),
      (ctx) => ex.choice(ctx, w, pool, "reading"),
      (ctx) => ex.choice(ctx, w, pool, "listen"),
    ]) {
      finalRound.push(step(make, async (res) => ({ xp: res.ok ? 2 : 1, requeue: res.ok ? null : step(make, async () => ({ xp: 1 })) }), w.id));
    }
  }
  steps.push(...spreadOut(shuffle(finalRound)));
  return runLesson({
    steps,
    endTitle: "New words learned!",
    onDone: (s) => api("/api/learn/complete", { method: "POST", body: { word_ids: [], xp: Math.max(0, s.xp - 3 * words.length) } }),
  });
}

/** Any choice exercise for a word (used by choice-only practice). */
function randomChoice(w, pool) {
  const kinds = [
    (ctx) => ex.multipleChoice(ctx, w, pool),
    (ctx) => ex.choice(ctx, w, pool, "meaning"),
    (ctx) => ex.choice(ctx, w, pool, "reading"),
    (ctx) => ex.choice(ctx, w, pool, "listen"),
  ];
  return kinds[Math.floor(Math.random() * kinds.length)];
}

/** For practice-only steps: give XP and re-queue a mistake at the end of the lesson. */
function practiceAfter(w, kind, pool) {
  return async (res) => ({
    xp: res.ok ? 2 : 1,
    requeue: res.ok ? null : step((ctx) => (kind === "mc" ? ex.multipleChoice(ctx, w, pool) : ex.write(ctx, w)), async () => ({ xp: 1 })),
  });
}

/** Avoid the same word appearing twice in a row. */
function spreadOut(steps) {
  for (let i = 1; i < steps.length; i++) {
    if (steps[i].key !== steps[i - 1].key) continue;
    const j = steps.findIndex((s, k) => k > i && s.key !== steps[i - 1].key);
    if (j > 0) [steps[i], steps[j]] = [steps[j], steps[i]];
  }
  return steps;
}

// ------------------------------------------------------------------ practice old words

export async function review({ extra = false, writing = true } = {}) {
  // Choice-only practice reviews (and reschedules) just the recall cards; writing and
  // speaking reviews stay due until you practise them for real.
  const qs = new URLSearchParams();
  if (extra) qs.set("extra", "1");
  if (!writing) qs.set("skills", "recall");
  const { items, pool } = await api("/api/review/session" + (qs.toString() ? `?${qs}` : ""));
  if (!items.length) {
    toast(extra ? "Learn some words first!" : "Nothing due — nice work!");
    return null;
  }
  const words = items.map((i) => i.word);
  const allPool = [...pool, ...words];

  const steps = items.map((it) => {
    const w = it.word;
    let make;
    if (!writing) make = randomChoice(w, allPool);
    else if (it.skill === "write") make = (ctx) => ex.write(ctx, w);
    else if (it.skill === "speak") make = (ctx) => ex.speakWord(ctx, w, { showPinyin: false });
    else make = Math.random() < 0.5 ? (ctx) => ex.multipleChoice(ctx, w, allPool) : (ctx) => ex.pinyinType(ctx, w);

    return step(make, async (res) => {
      const r = await api("/api/review/answer", { method: "POST", body: { word_id: w.id, skill: it.skill, grade: res.grade } });
      let requeue = null;
      if (res.grade === 0) {
        // Practise it again at the end (not graded a second time).
        requeue = step(writing && it.skill === "write" ? (ctx) => ex.write(ctx, w) : make, async () => ({ xp: 0 }));
      }
      return { xp: r.xp, requeue };
    });
  });

  return runLesson({ steps, endTitle: extra ? "Extra practice done!" : "Practice complete!" });
}

// ------------------------------------------------------------------ sentences

export function pickSentenceMode() {
  return new Promise((resolve) => {
    let mode = localStorage.getItem("sentenceMode") || "mixed";
    let useAI = state.settings?.ai_enabled && localStorage.getItem("sentenceAI") !== "0";
    const opts = [
      ["mixed", "🔀", "Mixed"],
      ["write", "✍️", "Write"],
      ["type", "⌨️", "Type"],
      ["speak", "🎤", "Speak"],
    ];
    const buttons = opts.map(([key, e, label]) =>
      h("button", { class: key === mode ? "on" : "", onclick: () => { mode = key; buttons.forEach((b, i) => b.classList.toggle("on", opts[i][0] === key)); } }, h("span", { class: "e" }, e), label)
    );
    const aiToggle = h("input", { type: "checkbox", class: "toggle", onchange: (e) => (useAI = e.target.checked) });
    aiToggle.checked = useAI;
    aiToggle.disabled = !state.settings?.ai_enabled;
    const bg = h(
      "div",
      { class: "sheet-bg", onclick: (e) => e.target === bg && (bg.remove(), resolve(null)) },
      h(
        "div",
        { class: "sheet" },
        h("h2", {}, "Sentence practice"),
        h("p", { class: "muted" }, `Translate English sentences into ${T.lang()} — by hand, keyboard or voice.`),
        h("div", { class: "mode-pick" }, buttons),
        h(
          "div",
          { class: "switch-row" },
          h("div", {}, "✨ AI-generated sentences", h("div", { class: "small muted" }, state.settings?.ai_enabled ? "Gemma writes new sentences from words you know" : "AI is off — using built-in sentences")),
          aiToggle
        ),
        h(
          "button",
          {
            class: "btn purple",
            onclick: () => {
              try { localStorage.setItem("sentenceMode", mode); localStorage.setItem("sentenceAI", useAI ? "1" : "0"); } catch { /* ignore */ }
              bg.remove();
              resolve({ mode, useAI });
            },
          },
          "Start"
        )
      )
    );
    document.body.append(bg);
  });
}

export async function sentences() {
  const choice = await pickSentenceMode();
  if (!choice) return null;
  const loading = h("div", { class: "sheet-bg" }, h("div", { class: "sheet center" }, h("div", { class: "spinner" }), h("p", {}, choice.useAI ? "✨ Gemma is writing sentences for you…" : "Loading sentences…")));
  document.body.append(loading);
  let data;
  try {
    data = await api(`/api/sentences/session?use_ai=${choice.useAI ? 1 : 0}`);
  } finally {
    loading.remove();
  }
  if (data.note) toast(data.note, 4500);
  const cycle = ["write", "type", "speak"];
  const steps = data.sentences.map((s, i) => {
    const m = choice.mode === "mixed" ? cycle[i % 3] : choice.mode;
    const make =
      m === "write" ? (ctx) => ex.sentenceWrite(ctx, s) : m === "type" ? (ctx) => ex.sentenceType(ctx, s) : (ctx) => ex.sentenceSpeakRecall(ctx, s);
    return step(make, async (res) => {
      const score = res.score ?? (res.ok ? 90 : 40);
      const r = await api("/api/sentences/log", { method: "POST", body: { en: s.en, zh: s.zh, mode: m, score, source: s.source } });
      return { xp: r.xp };
    });
  });
  return runLesson({ steps, endTitle: "Sentences done!" });
}

/** Quick handwriting drill for a single word (from the word sheet). */
export function drillWord(w) {
  return runLesson({
    steps: [step((ctx) => ex.write(ctx, w)), step((ctx) => ex.write(ctx, w))],
    endTitle: "Drill done!",
  });
}
