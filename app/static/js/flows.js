// Builds the three study modes out of exercises.
import { api, h, shuffle, toast } from "./util.js";
import { runLesson } from "./lesson.js";
import * as ex from "./exercises.js";
import { state, T, isSl } from "./state.js";

/** Handwriting exercise for the course: stroke-order writing, or spelling for Slovenian. */
const writeEx = (ctx, w, opts) => (isSl() ? ex.spell(ctx, w, { hint: !!opts?.pinyinHint }) : ex.write(ctx, w, opts));

const step = (make, after, key) => ({ make, after, key });

/** After-handler for a repeat: a wrong answer comes back at the end again, until it's right. */
const untilRight = (make, key) => async (res) => ({ xp: res.ok ? 1 : 0, requeue: res.ok ? null : step(make, untilRight(make, key), key) });
/** First attempt: XP, and a wrong answer is repeated at the end until it's right. */
const learnAfter = (make, key) => async (res) => ({ xp: res.ok ? 2 : 1, requeue: res.ok ? null : step(make, untilRight(make, key), key) });

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
  // Your own words have no ready-made memory hook: let Gemma prepare them while you study.
  ex.prefetchExtras(words);
  if (!writing) return learnChoiceOnly(words, allPool);
  if (isSl()) return learnSpelling(words, allPool);
  const steps = [];

  for (const w of words) {
    steps.push(step((ctx) => ex.intro(ctx, w)));
    if (ex.noKanji(w)) {
      // Kana-only words (コーヒー, ちょっと): learn the meaning, nothing to write.
      steps.push(step((ctx) => ex.choice(ctx, w, allPool, "meaning"), async (res) => {
        await api("/api/learn/complete", { method: "POST", body: { word_ids: [w.id], xp: 5 } });
        const again = (ctx) => ex.choice(ctx, w, allPool, "meaning");
        return { xp: 5, requeue: res.ok ? null : step(again, untilRight(again, w.id), w.id) };
      }));
      continue;
    }
    steps.push(step((ctx) => ex.trace(ctx, w), async () => ({ xp: 1 })));
    steps.push(
      step(
        (ctx) => ex.write(ctx, w, { pinyinHint: true }),
        async (res) => {
          // The word counts as learned once you've written it yourself.
          await api("/api/learn/complete", { method: "POST", body: { word_ids: [w.id], xp: 5 } });
          if (res.ok) return { xp: 5 };
          // Trace it once more, then write it again at the end until it's right.
          const rewrite = (ctx) => ex.write(ctx, w, { pinyinHint: true });
          return { xp: 5, requeue: step((ctx) => ex.trace(ctx, w), async () => ({ xp: 0, requeue: step(rewrite, untilRight(rewrite, w.id), w.id) }), w.id) };
        }
      )
    );
  }

  // Mixed review of everything from this lesson.
  const finalRound = [];
  for (const w of words) {
    for (const make of [
      (ctx) => ex.multipleChoice(ctx, w, allPool),
      (ctx) => ex.speakWord(ctx, w, { showPinyin: true }),
      ex.noKanji(w) ? (ctx) => ex.choice(ctx, w, allPool, "listen") : (ctx) => ex.write(ctx, w),
    ]) {
      finalRound.push(step(make, learnAfter(make, w.id), w.id));
    }
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
          const again = (ctx) => ex.choice(ctx, w, pool, "meaning");
          return { xp: 3, requeue: res.ok ? null : step(again, untilRight(again, w.id), w.id) };
        }
      )
    );
  }
  const finalRound = [];
  for (const w of words) {
    for (const make of [
      (ctx) => ex.multipleChoice(ctx, w, pool),
      isSl() ? (ctx) => ex.choice(ctx, w, pool, "meaning") : (ctx) => ex.choice(ctx, w, pool, "reading"),
      (ctx) => ex.choice(ctx, w, pool, "listen"),
    ]) {
      finalRound.push(step(make, learnAfter(make, w.id), w.id));
    }
  }
  steps.push(...spreadOut(shuffle(finalRound)));
  return runLesson({
    steps,
    endTitle: "New words learned!",
    onDone: (s) => api("/api/learn/complete", { method: "POST", body: { word_ids: [], xp: Math.max(0, s.xp - 3 * words.length) } }),
  });
}

/** Slovenian new words "with writing": see the word, spell it, then a mixed round. */
function learnSpelling(words, pool) {
  const steps = [];
  for (const w of words) {
    steps.push(step((ctx) => ex.intro(ctx, w)));
    steps.push(
      step(
        (ctx) => ex.spell(ctx, w, { hint: true }),
        async (res) => {
          await api("/api/learn/complete", { method: "POST", body: { word_ids: [w.id], xp: 4 } });
          const again = (ctx) => ex.spell(ctx, w, { hint: true });
          return { xp: 4, requeue: res.ok ? null : step(again, untilRight(again, w.id), w.id) };
        }
      )
    );
  }
  const finalRound = [];
  for (const w of words) {
    for (const make of [
      (ctx) => ex.multipleChoice(ctx, w, pool),
      (ctx) => ex.choice(ctx, w, pool, "listen"),
      (ctx) => ex.speakWord(ctx, w, { showPinyin: true }),
      (ctx) => ex.spell(ctx, w),
    ]) {
      finalRound.push(step(make, learnAfter(make, w.id), w.id));
    }
  }
  steps.push(...spreadOut(shuffle(finalRound)));
  return runLesson({
    steps,
    endTitle: "New words learned!",
    onDone: (s) => api("/api/learn/complete", { method: "POST", body: { word_ids: [], xp: Math.max(0, s.xp - 4 * words.length) } }),
  });
}

/** Any choice exercise for a word (used by choice-only practice). */
function randomChoice(w, pool) {
  const kinds = [
    (ctx) => ex.multipleChoice(ctx, w, pool),
    (ctx) => ex.choice(ctx, w, pool, "meaning"),
    ...(isSl() ? [] : [(ctx) => ex.choice(ctx, w, pool, "reading")]),
    (ctx) => ex.choice(ctx, w, pool, "listen"),
  ];
  return kinds[Math.floor(Math.random() * kinds.length)];
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

// ------------------------------------------------------------------ grammar

/** Answer options for a grammar quiz: the right point plus up to three others with different labels. */
function grammarOptions(p, lesson, others, kind, x) {
  const label = (q) => (kind === "mark" ? (q.mark || q.examples?.[0]?.mark || []).join(" … ") : q.short);
  // For the gap quiz the right answer is what's missing from this very example.
  const mine = kind === "mark" ? (x.mark || []).join(" … ") : p.short;
  const seen = new Set([mine]);
  const out = [{ id: p.id, label: mine }];
  const pool = [...lesson.filter((q) => q.id !== p.id), ...shuffle(others.filter((q) => q.learned)), ...shuffle(others)];
  for (const q of pool) {
    if (out.length === 4) break;
    const l = label(q);
    if (!l || seen.has(l) || q.id === p.id) continue;
    seen.add(l);
    out.push({ id: q.id, label: l });
  }
  return shuffle(out);
}

/** One graded grammar question about point p (which grammar / fill the gap). */
function grammarQuestion(p, lesson, others, n = 1) {
  const x = p.examples[n % p.examples.length];
  // Slovenian points with ending drills: mostly practise the endings themselves.
  const drills = p.examples.filter((e) => e.drill);
  if (drills.length && Math.random() < 0.7) {
    const d = drills[n % drills.length];
    return (ctx) => ex.grammarDrill(ctx, p, d);
  }
  return Math.random() < 0.5 || !(x.mark || []).length
    ? (ctx) => ex.grammarWhich(ctx, p, x, grammarOptions(p, lesson, others, "short"))
    : (ctx) => ex.grammarGap(ctx, p, x, grammarOptions(p, lesson, others, "mark", x));
}

/** A grammar lesson: three new points, each introduced, then a quiz on all of them. */
export async function grammarLesson() {
  let data;
  try {
    data = await api("/api/grammar/lesson");
  } catch (e) {
    toast(e.message, 4000);
    return null;
  }
  const { points, others } = data;
  const steps = points.map((p, i) => step((ctx) => ex.grammarIntro(ctx, p, i, points.length)));
  const quiz = [];
  for (const p of points) {
    const x1 = p.examples[1] || p.examples[0];
    const x2 = p.examples[2] || p.examples[0];
    const drills = p.examples.filter((e) => e.drill);
    const which = (ctx) => ex.grammarWhich(ctx, p, x1, grammarOptions(p, points, others, "short"));
    const gap = drills.length
      ? (ctx) => ex.grammarDrill(ctx, p, drills[0])
      : (ctx) => ex.grammarGap(ctx, p, x2, grammarOptions(p, points, others, "mark", x2));
    quiz.push(step(which, learnAfter(which, p.id), p.id), step(gap, learnAfter(gap, p.id), p.id));
    if (drills.length > 1) {
      const more = (ctx) => ex.grammarDrill(ctx, p, drills[1]);
      quiz.push(step(more, learnAfter(more, p.id), p.id));
    }
  }
  steps.push(...spreadOut(shuffle(quiz)));
  return runLesson({
    steps,
    endTitle: "Grammar learned!",
    onDone: (s) => api("/api/grammar/complete", { method: "POST", body: { ids: points.map((p) => p.id), xp: s.xp } }),
  });
}

/** Grammar questions due for practice, as lesson steps. */
async function grammarReviewSteps(extra, ids = null) {
  let g;
  try {
    g = await api(ids ? `/api/grammar/review?ids=${encodeURIComponent(ids.join(","))}` : `/api/grammar/review?n=${extra ? 2 : 3}${extra ? "&extra=1" : ""}`);
  } catch {
    return [];
  }
  // Practising one weak grammar point: all three kinds of question (only the first is graded).
  if (ids) {
    return g.items.flatMap((p) =>
      [1, 2, 3].map((kind, i) => {
        const make = grammarQuestion(p, [], g.others, kind);
        return step(make, async (res) => {
          const r = i === 0 ? await api("/api/grammar/answer", { method: "POST", body: { id: p.id, grade: res.grade } }) : { xp: res.grade >= 2 ? 1 : 0 };
          return { xp: r.xp, requeue: res.grade === 0 ? step(make, async () => ({ xp: 0 })) : null };
        }, `${p.id}-${kind}`);
      })
    );
  }
  return g.items.map((p) => {
    const make = grammarQuestion(p, [], g.others, 1 + Math.floor(Math.random() * 3));
    return step(make, async (res) => {
      const r = await api("/api/grammar/answer", { method: "POST", body: { id: p.id, grade: res.grade } });
      return { xp: r.xp, requeue: res.grade === 0 ? step(make, async () => ({ xp: 0 })) : null };
    }, p.id);
  });
}

// ------------------------------------------------------------------ listening, tones, stories

const listenAfter = (make, key) => async (res) => {
  const r = await api("/api/listen/answer", { method: "POST", body: { ok: res.ok } });
  return { xp: r.xp, requeue: res.ok ? null : step(make, async () => ({ xp: 0 }), key) };
};

/** Listening practice: dictation and "what did you hear?" with sentences built from words you know. */
export async function listening() {
  const { items, others } = await api("/api/listen/session?n=6");
  if (!items.length) {
    toast("Learn a few words first — listening uses their example sentences.");
    return null;
  }
  const steps = [];
  items.forEach((it, i) => {
    const make = i % 2 ? (ctx) => ex.listenChoose(ctx, it, others) : (ctx) => ex.dictation(ctx, it);
    steps.push(step(make, listenAfter(make, it.text), it.text));
  });
  return runLesson({ steps, endTitle: "Listening done!" });
}

/** Tone practice (Chinese): hear and pick tones, then say one-syllable words with the right tone. */
export async function tones() {
  const { items } = await api("/api/tones/session?n=8");
  if (!items.length) {
    toast("Learn a few words first — tone practice uses words you know.");
    return null;
  }
  const pitch = await import("./pitch.js");
  const steps = items.map((w) => {
    const make = (ctx) => ex.toneListen(ctx, w);
    return step(make, listenAfter(make, w.id), w.id);
  });
  if (pitch.canTrackPitch()) {
    for (const w of items.filter((x) => x.syllables.length === 1 && ex.toneOf(x.syllables[0]) !== 5).slice(0, 3)) {
      const make = (ctx) => ex.toneSpeak(ctx, w, pitch);
      steps.push(step(make, listenAfter(make, "say" + w.id), "say" + w.id));
    }
  }
  return runLesson({ steps: spreadOut(steps), endTitle: "Tones practised!" });
}

/** Comprehension questions after reading a story. */
export function storyQuestions(story) {
  const qs = story.questions || [];
  let right = 0;
  const steps = qs.map((q) =>
    step(
      (ctx) => {
        let picked = null;
        const tiles = q.options.map((o, i) => {
          const t = h("button", { class: "choice text", onclick: () => { picked = i; tiles.forEach((b) => b.classList.toggle("selected", b === t)); ctx.setReady(true); } }, h("span", { class: "txt" }, o));
          return t;
        });
        return {
          el: h("div", {}, h("div", { class: "ex-kicker purple" }, `📖 ${story.title_en}`), h("h2", { class: "ex-title" }, q.q), h("div", { class: "choices" }, tiles)),
          mode: "check",
          async check() {
            const ok = picked === q.answer;
            if (ok) right++;
            tiles.forEach((t, i) => { if (i === q.answer) t.classList.add("correct"); else if (i === picked) t.classList.add("wrong"); });
            return { ok, grade: ok ? 2 : 0, title: ok ? "Correct!" : "Correct answer:", detail: h("div", {}, q.options[q.answer]) };
          },
        };
      },
      async (res) => ({ xp: res.ok ? 3 : 1 })
    )
  );
  return runLesson({
    steps,
    endTitle: "Story finished!",
    onDone: (s) => api(`/api/stories/${encodeURIComponent(story.id)}/done`, { method: "POST", body: { score: qs.length ? Math.round((100 * right) / qs.length) : 100, xp: s.xp + 5 } }),
  });
}

// ------------------------------------------------------------------ practice old words

export async function review({ extra = false, writing = true, ids = null, skill = null, grammarIds = null, title = null } = {}) {
  // Choice-only practice reviews (and reschedules) just the recall cards; writing and
  // speaking reviews stay due until you practise them for real.
  const qs = new URLSearchParams();
  if (extra) qs.set("extra", "1");
  if (!writing) qs.set("skills", "recall");
  if (skill) qs.set("skills", skill);
  if (ids?.length) qs.set("ids", ids.join(","));
  // Weak spots practise only their own group: just these words, or just these grammar points.
  const { items, pool } = grammarIds ? { items: [], pool: [] } : await api("/api/review/session" + (qs.toString() ? `?${qs}` : ""));
  const grammarSteps = grammarIds ? await grammarReviewSteps(false, grammarIds) : skill ? [] : await grammarReviewSteps(extra);
  if (!items.length && !grammarSteps.length) {
    toast(extra ? "No learned words at this level yet — learn some first!" : "Nothing due — nice work!");
    return null;
  }
  const words = items.map((i) => i.word);
  const allPool = [...pool, ...words];

  const steps = items.map((it) => {
    const w = it.word;
    let make;
    if (!writing) make = randomChoice(w, allPool);
    else if (ex.noKanji(w)) make = it.skill === "speak" ? (ctx) => ex.speakWord(ctx, w, { showPinyin: false }) : randomChoice(w, allPool);
    else if (it.skill === "write") make = (ctx) => writeEx(ctx, w);
    else if (it.skill === "speak") make = (ctx) => ex.speakWord(ctx, w, { showPinyin: false });
    else if (isSl()) make = Math.random() < 0.5 ? (ctx) => ex.multipleChoice(ctx, w, allPool) : (ctx) => ex.choice(ctx, w, allPool, "meaning");
    else make = Math.random() < 0.5 ? (ctx) => ex.multipleChoice(ctx, w, allPool) : (ctx) => ex.pinyinType(ctx, w);

    return step(make, async (res) => {
      const r = await api("/api/review/answer", { method: "POST", body: { word_id: w.id, skill: it.skill, grade: res.grade } });
      let requeue = null;
      if (res.grade === 0) {
        // Practise it again at the end (not graded a second time).
        requeue = step(writing && it.skill === "write" && !ex.noKanji(w) ? (ctx) => writeEx(ctx, w) : make, async () => ({ xp: 0 }));
      }
      return { xp: r.xp, requeue };
    });
  });

  // Unlocked grammar comes back in practice too, spread among the words.
  for (const g of grammarSteps) steps.splice(Math.floor(Math.random() * (steps.length + 1)), 0, g);
  return runLesson({ steps, endTitle: title || (ids?.length ? "Your trees are watered!" : extra ? "Extra practice done!" : "Practice complete!") });
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
      m === "write" && !isSl() ? (ctx) => ex.sentenceWrite(ctx, s) : m === "type" || m === "write" ? (ctx) => ex.sentenceType(ctx, s) : (ctx) => ex.sentenceSpeakRecall(ctx, s);
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
    steps: [step((ctx) => writeEx(ctx, w)), step((ctx) => writeEx(ctx, w))],
    endTitle: "Drill done!",
  });
}

// ------------------------------------------------------------------ look-alike characters

export async function lookalikes() {
  const { items } = await api("/api/lookalikes/session?n=8");
  if (!items.length) {
    toast("No look-alike characters for this course yet");
    return null;
  }
  const steps = items.map((it, i) => {
    const make = (ctx) => ex.lookalike(ctx, it, i % 2 ? "meaning" : "pick");
    return step(make, async (res) => {
      const r = await api("/api/lookalikes/answer", { method: "POST", body: { key: it.key, ok: res.ok } });
      // A mistake comes back once at the end, the other way round.
      const requeue = res.ok ? null : step((ctx) => ex.lookalike(ctx, it, i % 2 ? "pick" : "meaning"), async () => ({ xp: 0 }));
      return { xp: r.xp, requeue };
    }, it.key);
  });
  return runLesson({ steps, endTitle: "Look-alikes done!" });
}
