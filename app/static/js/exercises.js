// Exercise types. Each factory gets (ctx, ...) and returns
//   { el, mode: "check" | "continue" | "auto", check?, destroy? }
// ctx: { setReady(bool), finish(result), skip() }
// result: { ok: true|false, grade: 0..3, title?, detail? }
import { api, h, icons, iconBtn, shuffle, toast } from "./util.js";
import { speak, stopSpeaking, canRecognize, canRecord, recognize, Recorder } from "./audio.js";
import { writingPad, strokeDemo } from "./writer.js";
import { noteWritePerfect } from "./forest.js";
import { state, T, isJa, isSl, sayText } from "./state.js";

const GENDER = { m: "masculine", ž: "feminine", s: "neuter", mn: "plural only" };
/** Slovenian nouns show their grammatical gender from the very first word. */
export const genderTag = (word) => (word.gender ? h("span", { class: `tag gender g-${word.gender}` }, `${word.gender} · ${GENDER[word.gender] || ""}`) : null);

const speakerBtn = (text, cls = "speaker") => iconBtn("speaker", cls, () => speak(text), "Listen");
const slowBtn = (text) => iconBtn("slow", "speaker sm", () => speak(text, { slow: true }), "Listen slowly");

/** "hiragana" / "katakana" for words of the kana course, else null. */
const kanaOf = (w) => (w.source === "kana" ? (/[ァ-ヺ]/.test(w.hanzi) ? "katakana" : "hiragana") : null);
/** Japanese vocabulary written only in kana (コーヒー, ちょっと): quizzed on meaning and sound, not reading/writing. */
export const noKanji = (w) => isJa() && w.source !== "kana" && !/[㐀-鿿豈-﫿々]/.test(w.hanzi);
/** Kana are quizzed against other kana of the same script, not against kanji words. */
function samePool(word, pool) {
  const k = kanaOf(word);
  if (!k) return pool;
  const same = pool.filter((w) => kanaOf(w) === k);
  return same.length >= 3 ? same : pool;
}

function solution(word, extra) {
  return h(
    "div",
    {},
    h("span", { class: "hz" }, word.hanzi),
    word.pinyin && word.pinyin !== word.hanzi ? [" · ", word.pinyin] : null,
    h("div", {}, word.english),
    extra ? h("div", { class: "small" }, extra) : null
  );
}

/** Map handwriting results to an SRS grade. */
export function writeGrade(r) {
  if (r.gaveUp || r.hints >= 2) return 0;
  if (r.hints === 1 || r.mistakes >= 4) return 1;
  if (r.mistakes > 0) return 2;
  return 3;
}

// ------------------------------------------------------------------ intro (new word)

/** Memory hooks being prepared in the background, by word id (see prefetchExtras). */
const extrasJobs = new Map();

function fetchExtras(word, refresh = false) {
  if (!refresh && extrasJobs.has(word.id)) return extrasJobs.get(word.id);
  const job = api(`/api/words/${word.id}/extras${refresh ? "?refresh=1" : ""}`).then((x) => (word.extras = x));
  extrasJobs.set(word.id, job);
  job.catch(() => extrasJobs.delete(word.id));
  return job;
}

/**
 * Start preparing memory hooks for a lesson's words, one after another, so the next word's hook
 * is ready by the time you get to it. Words with a ready-made hook are skipped.
 */
export function prefetchExtras(words) {
  if (!state.settings?.ai_enabled) return;
  const todo = words.filter((w) => !w.extras && !extrasJobs.has(w.id));
  (async () => {
    for (const w of todo) await fetchExtras(w).catch(() => {});
  })();
}

function extrasBox(x, onRefresh) {
  return h(
    "div",
    { class: "ai-box" },
    x.mnemonic ? h("div", {}, h("b", {}, "Memory hook: "), x.mnemonic) : h("div", { class: "small muted" }, "No English memory hook this time — tap “New memory hook” to try again."),
    x.sounds_like ? h("div", { style: { marginTop: "6px" } }, h("b", {}, "Sounds like: "), x.sounds_like) : null,
    x.components ? h("div", { style: { marginTop: "6px" } }, h("b", {}, x.sounds_like || isSl() ? "Grammar: " : "Parts: "), x.components) : null,
    x.example_zh
      ? h(
          "div",
          { class: "row", style: { marginTop: "8px" } },
          speakerBtn(x.example_zh, "speaker sm"),
          h("div", {}, h("div", { class: "hz" }, x.example_zh), h("div", { class: "small muted" }, x.example_pinyin && x.example_pinyin !== x.example_zh ? x.example_pinyin : ""), h("div", { class: "small" }, x.example_en))
        )
      : null,
    state.settings?.ai_enabled ? h("button", { class: "reveal", style: { marginTop: "10px" }, onclick: onRefresh }, "↻ New memory hook") : null
  );
}

export function intro(ctx, word) {
  const ai = h("div");
  const loadAI = async (refresh = false) => {
    // Ready-made (or already prepared) hook: show it straight away.
    if (!refresh && word.extras) return ai.replaceChildren(extrasBox(word.extras, () => loadAI(true)));
    ai.replaceChildren(h("div", { class: "ai-box" }, "✨ Asking Gemma…"));
    try {
      const x = await fetchExtras(word, refresh);
      ai.replaceChildren(extrasBox(x, () => loadAI(true)));
    } catch (e) {
      ai.replaceChildren(
        h("div", { class: "ai-box" }, "AI hints unavailable: ", e.message, " ", h("button", { class: "reveal", onclick: () => loadAI(true) }, "Try again"))
      );
    }
  };
  const aiOn = state.settings?.ai_enabled;
  // Show the hook right away if it's ready or already being prepared in the background.
  const autoShow = word.extras || extrasJobs.has(word.id);
  if (autoShow) loadAI();
  // Latin-script words have no stroke order: show the word itself.
  const demo = isSl() ? { el: h("div", { class: "sl-word" }, h("div", { class: "sl-word-text" }, word.hanzi), genderTag(word)) } : strokeDemo(word.hanzi);
  const el = h(
    "div",
    {},
    h("div", { class: "ex-kicker green" }, "★ New word"),
    h(
      "div",
      { class: "word-hero" },
      demo.el,
      h("div", { class: "row", style: { justifyContent: "center", marginTop: "12px" } }, speakerBtn(sayText(word)), slowBtn(sayText(word))),
      h("div", { class: "py" }, word.pinyin),
      h("div", { class: "en" }, word.english)
    ),
    aiOn && !autoShow
      ? h(
          "div",
          { style: { display: "flex", justifyContent: "center", marginTop: "4px" } },
          h("button", { class: "btn ghost small auto", onclick: (e) => { e.currentTarget.parentElement.remove(); loadAI(); } }, "✨ Memory hook & example")
        )
      : null,
    ai
  );
  setTimeout(() => speak(sayText(word)), 400);
  return { el, mode: "continue" };
}

// ------------------------------------------------------------------ handwriting

export function trace(ctx, word) {
  const pad = writingPad([...word.hanzi].map((c) => ({ c, outline: true })));
  pad.done.then((r) => {
    speak(sayText(word));
    ctx.finish({ ok: true, grade: 2, title: "Nice tracing!", detail: solution(word), xp: 0, result: r });
  });
  return {
    el: h(
      "div",
      {},
      h("div", { class: "ex-kicker blue" }, "✍️ Trace"),
      h("h2", { class: "ex-title" }, "Trace ", h("span", { class: "hz" }, word.hanzi), ` — “${word.english}”`),
      pad.el
    ),
    mode: "auto",
    destroy: pad.destroy,
  };
}

export function write(ctx, word, { pinyinHint = false } = {}) {
  const pyEl = h("span", {}, word.pinyin);
  pyEl.hidden = !pinyinHint;
  let pinyinPeeked = false;
  const peek = h("button", { class: "reveal", onclick: () => { pinyinPeeked = true; pyEl.hidden = false; peek.remove(); } }, `show ${T.reading()}`);
  const pad = writingPad([...word.hanzi].map((c) => ({ c, outline: false })));
  pad.done.then((r) => {
    let grade = writeGrade(r);
    if (pinyinPeeked) grade = Math.min(grade, 2);
    if (grade === 3) noteWritePerfect([...word.hanzi].length);
    speak(sayText(word));
    const ok = grade >= 1;
    const title = grade === 3 ? "Perfect!" : grade === 2 ? "Great job!" : grade === 1 ? "Got there!" : "Keep practising";
    const extra = `${r.mistakes} wrong stroke${r.mistakes === 1 ? "" : "s"}${r.hints ? `, ${r.hints} hint${r.hints > 1 ? "s" : ""}` : ""}`;
    ctx.finish({ ok, grade, title, detail: solution(word, extra), result: r });
  });
  return {
    el: h(
      "div",
      {},
      h("div", { class: "ex-kicker blue" }, "✍️ Write from memory"),
      h(
        "div",
        { class: "prompt-bubble" },
        h("div", { class: "mascot" }, "🐼"),
        h("div", { class: "bubble" }, kanaOf(word) ? `“${word.english}” in ${kanaOf(word)}` : `“${word.english}”`, h("div", { class: "small muted row", style: { marginTop: "4px" } }, pyEl, pinyinHint ? null : peek))
      ),
      pad.el
    ),
    mode: "auto",
    destroy: pad.destroy,
  };
}

// ------------------------------------------------------------------ recall

export function multipleChoice(ctx, word, pool) {
  pool = samePool(word, pool);
  const distractors = shuffle(pool.filter((w) => w.hanzi !== word.hanzi && w.english !== word.english)).slice(0, 3);
  const options = shuffle([word, ...distractors]);
  let picked = null;
  const tiles = options.map((w) => {
    const t = h(
      "button",
      {
        class: "choice",
        onclick: () => {
          picked = w;
          tiles.forEach((x) => x.classList.toggle("selected", x === t));
          ctx.setReady(true);
        },
      },
      h("span", { class: "hz" }, w.hanzi)
    );
    return t;
  });
  return {
    el: h(
      "div",
      {},
      h("div", { class: "ex-kicker" }, "🧠 Recall"),
      h("h2", { class: "ex-title" }, kanaOf(word) ? `Which ${kanaOf(word)} is “${word.english}”?` : `Which one means “${word.english}”?`),
      h("div", { class: "choices" }, tiles)
    ),
    mode: "check",
    async check() {
      const ok = picked.hanzi === word.hanzi;
      tiles.forEach((t, i) => {
        if (options[i].hanzi === word.hanzi) t.classList.add("correct");
        else if (options[i] === picked) t.classList.add("wrong");
      });
      speak(sayText(word));
      return { ok, grade: ok ? 2 : 0, title: ok ? "Correct!" : "Correct answer:", detail: solution(word, !ok ? `You picked ${picked.hanzi} = ${picked.english}` : "") };
    },
  };
}

/**
 * Choice-only exercises (no writing):
 *   meaning — see the character, pick its meaning
 *   reading — see the character, pick its pinyin / reading
 *   listen  — hear the word, pick the character
 */
export function choice(ctx, word, pool, kind) {
  if (kind === "reading" && noKanji(word)) kind = "meaning"; // its reading is the word itself
  pool = samePool(word, pool);
  // For kana the reading is quizzed as romaji (the hiragana reading of あ is just あ).
  const field = kind === "meaning" || (kind === "reading" && kanaOf(word)) ? "english" : kind === "reading" ? "pinyin" : "hanzi";
  const norm = (v) => String(v || "").toLowerCase().replace(/\s+/g, "");
  const seen = new Set([norm(word[field])]);
  const distractors = [];
  for (const w of shuffle(pool)) {
    if (distractors.length === 3) break;
    if (w.id === word.id || seen.has(norm(w[field])) || w.hanzi === word.hanzi) continue;
    seen.add(norm(w[field]));
    distractors.push(w);
  }
  const options = shuffle([word, ...distractors]);
  let picked = null;
  const textual = kind !== "listen";
  const tiles = options.map((w) => {
    const t = h(
      "button",
      {
        class: "choice" + (textual ? " text" : ""),
        onclick: () => {
          picked = w;
          tiles.forEach((x) => x.classList.toggle("selected", x === t));
          if (kind === "listen") speak(sayText(w));
          ctx.setReady(true);
        },
      },
      textual ? h("span", { class: kind === "reading" ? "txt py" : "txt" }, w[field]) : h("span", { class: "hz" }, w.hanzi)
    );
    return t;
  });

  let prompt;
  if (kind === "listen") {
    setTimeout(() => speak(sayText(word)), 350);
    prompt = [
      h("div", { class: "ex-kicker blue" }, "👂 Listen"),
      h("h2", { class: "ex-title" }, "Which character do you hear?"),
      h("div", { class: "row", style: { justifyContent: "center", margin: "6px 0 20px" } }, speakerBtn(sayText(word)), slowBtn(sayText(word))),
    ];
  } else {
    prompt = [
      h("div", { class: "ex-kicker" }, kind === "meaning" && !kanaOf(word) ? "🧠 Meaning" : `🔤 ${isJa() ? "Reading" : "Pinyin"}`),
      h("h2", { class: "ex-title" }, kind === "meaning" && !kanaOf(word) ? "What does this mean?" : `How is this read?`),
      h("div", { class: "big-hz hz", style: { margin: "4px 0 18px" } }, word.hanzi),
    ];
  }
  return {
    el: h("div", {}, ...prompt, h("div", { class: "choices" }, tiles)),
    mode: "check",
    async check() {
      const ok = picked.id === word.id || norm(picked[field]) === norm(word[field]);
      tiles.forEach((t, i) => {
        if (options[i] === word) t.classList.add("correct");
        else if (options[i] === picked && !ok) t.classList.add("wrong");
      });
      speak(sayText(word));
      return {
        ok,
        grade: ok ? 2 : 0,
        title: ok ? "Correct!" : "Correct answer:",
        detail: solution(word, !ok ? `You picked ${picked.hanzi} = ${picked.english}` : ""),
      };
    },
  };
}

/** Slovenian "writing": spell the word from its English meaning (with audio). */
export function spell(ctx, word, { hint = false } = {}) {
  const input = h("input", {
    class: "input",
    autocomplete: "off",
    autocapitalize: "off",
    spellcheck: "false",
    placeholder: "Type the Slovenian word",
    oninput: () => ctx.setReady(input.value.trim().length > 0),
    onkeydown: (e) => e.key === "Enter" && input.value.trim() && ctx.submit(),
  });
  setTimeout(() => input.focus(), 300);
  return {
    el: h(
      "div",
      {},
      h("div", { class: "ex-kicker blue" }, "⌨️ Spell it"),
      h("h2", { class: "ex-title" }, `How do you write “${word.english}” in Slovenian?`),
      h("div", { class: "row", style: { margin: "0 0 16px" } }, speakerBtn(word.hanzi), slowBtn(word.hanzi), hint ? h("span", { class: "muted" }, word.pinyin) : null),
      input,
      h("div", { class: "hint" }, "Tip: č, š, ž — long-press c, s or z on your keyboard.")
    ),
    mode: "check",
    async check() {
      const r = await api("/api/check/pinyin", { method: "POST", body: { answer: input.value, expected: word.hanzi } });
      speak(word.hanzi);
      if (r.result === "correct") {
        noteWritePerfect(1);
        return { ok: true, grade: 2, title: "Correct!", detail: solution(word) };
      }
      if (r.result === "tones_wrong") return { ok: true, grade: 1, title: "Almost — mind č, š, ž", detail: solution(word) };
      return { ok: false, grade: 0, title: "Correct spelling:", detail: solution(word, `You wrote: ${input.value}`) };
    },
  };
}

export function pinyinType(ctx, word) {
  const input = h("input", {
    class: "input",
    autocomplete: "off",
    autocapitalize: "off",
    spellcheck: "false",
    placeholder: isJa() ? "e.g. yama or やま" : "e.g. mao1 or māo",
    oninput: () => ctx.setReady(input.value.trim().length > 0),
    onkeydown: (e) => e.key === "Enter" && input.value.trim() && ctx.submit(),
  });
  setTimeout(() => input.focus(), 300);
  return {
    el: h(
      "div",
      {},
      h("div", { class: "ex-kicker orange" }, isJa() ? "⌨️ Reading" : "⌨️ Pinyin"),
      ...(kanaOf(word)
        ? [h("h2", { class: "ex-title" }, "How is this read?"), h("div", { class: "big-hz hz", style: { margin: "4px 0 14px" } }, word.hanzi)]
        : [h("h2", { class: "ex-title" }, `How do you say “${word.english}”?`)]),
      h("p", { class: "muted" }, isJa() ? "Type the reading in romaji or hiragana." : "Type the pinyin. Tones as numbers (ni3 hao3) or marks."),
      input
    ),
    mode: "check",
    async check() {
      const r = await api("/api/check/pinyin", { method: "POST", body: { answer: input.value, expected: word.pinyin } });
      speak(sayText(word));
      if (r.result === "correct") return { ok: true, grade: 2, title: "Correct!", detail: solution(word) };
      if (r.result === "tones_wrong") return { ok: false, grade: 1, title: isSl() ? "Almost — mind č, š, ž" : "Almost — check the tones", detail: solution(word) };
      return { ok: false, grade: 0, title: "Correct answer:", detail: solution(word) };
    },
  };
}

// ------------------------------------------------------------------ speaking

function speechMode() {
  if (!window.isSecureContext && !window.__native) return "none";
  let m = state.settings?.speech_mode || "browser";
  if (m === "ai" && (!canRecord() || !state.settings?.ai_enabled)) m = "browser";
  if (m === "browser" && !canRecognize()) m = canRecord() ? "self" : "none";
  if (m === "self" && !canRecord()) m = "none";
  return m;
}

function syllableChips(syllables) {
  return h(
    "div",
    { class: "syllables" },
    syllables.map((s) => h("span", { class: `syl ${s.status}` }, s.expected.replace(/(\d)$/, (d) => "¹²³⁴·"[d - 1] || "")))
  );
}

function scoreGrade(score) {
  return score >= 90 ? 3 : score >= 80 ? 2 : score >= 60 ? 1 : 0;
}

/** Shared speaking widget. target is hanzi. */
function speakPanel(ctx, target, solutionNode, reading = "") {
  const mode = speechMode();
  const out = h("div", { class: "mic-wrap" });
  const mic = h("button", { class: "mic", "aria-label": "Record" });
  mic.innerHTML = icons.mic;
  const statusEl = h("div", { class: "muted center" }, "");
  const resultEl = h("div", { class: "mic-wrap" });
  out.append(mic, statusEl, resultEl);
  let attempts = 0;
  let best = 0;

  const finish = (score, title) => {
    const g = scoreGrade(attempts > 1 ? Math.min(best, 80) : best);
    ctx.finish({ ok: score >= 80 || g >= 2, grade: g, title, detail: solutionNode });
  };

  const showRetry = (score) => {
    resultEl.append(
      h(
        "div",
        { class: "row", style: { width: "100%" } },
        h("button", { class: "btn ghost", onclick: () => { resultEl.replaceChildren(); mic.disabled = false; statusEl.textContent = "Tap and speak"; } }, "Try again"),
        h("button", { class: "btn", onclick: () => finish(score, score >= 60 ? "Close!" : "Keep practising") }, "Continue")
      )
    );
  };

  const handleScore = (score, extraNodes) => {
    attempts++;
    best = Math.max(best, score);
    resultEl.replaceChildren(...extraNodes);
    if (score >= 80) {
      mic.disabled = true;
      setTimeout(() => finish(score, score >= 95 ? "Excellent pronunciation!" : "Sounds good!"), 900);
    } else {
      mic.disabled = true;
      statusEl.textContent = `${score}% — listen and try again`;
      showRetry(score);
    }
  };

  if (mode === "none") {
    mic.disabled = true;
    statusEl.textContent = window.isSecureContext
      ? "This browser can't record audio."
      : "Microphone needs HTTPS. Start the server with HTTPS (the default) and open the https:// address.";
    return out;
  }

  statusEl.textContent = mode === "self" ? "Record yourself, then compare" : "Tap and speak";

  if (mode === "browser") {
    let listening = null;
    mic.onclick = async () => {
      if (listening) { listening.stop(); return; }
      stopSpeaking();
      mic.classList.add("rec");
      statusEl.textContent = "Listening… tap to stop";
      try {
        listening = recognize();
        const alts = await listening;
        listening = null;
        mic.classList.remove("rec");
        if (!alts.length) { statusEl.textContent = "Didn't catch that — tap and try again"; return; }
        statusEl.textContent = "";
        const scored = await Promise.all(alts.map((a) => api("/api/speech/compare", { method: "POST", body: { heard: a, expected: target, reading } }).then((r) => ({ ...r, heard: a }))));
        scored.sort((a, b) => b.score - a.score);
        const r = scored[0];
        handleScore(r.score, [syllableChips(r.syllables), h("div", { class: "heard" }, "Heard: ", h("span", { class: "hz" }, r.heard), ` (${r.heard_pinyin})`)]);
      } catch (e) {
        listening = null;
        mic.classList.remove("rec");
        statusEl.textContent = e.message;
      }
    };
    return out;
  }

  // Recording-based modes (ai, self)
  let rec = null;
  mic.onclick = async () => {
    if (!rec) {
      stopSpeaking();
      rec = new Recorder();
      try {
        await rec.start();
      } catch (e) {
        rec = null;
        statusEl.textContent = "Microphone unavailable: " + e.message;
        return;
      }
      mic.classList.add("rec");
      mic.innerHTML = icons.stop;
      statusEl.textContent = "Recording… tap to stop";
      return;
    }
    const r = rec;
    rec = null;
    mic.classList.remove("rec");
    mic.innerHTML = icons.mic;
    const { url, wavBase64 } = await r.stop();
    const audio = new Audio(url);
    const compareRow = h(
      "div",
      { class: "row" },
      h("button", { class: "btn ghost small", onclick: () => audio.play() }, "▶ Me"),
      h("button", { class: "btn ghost small", onclick: () => speak(reading && isJa() && [...target].length < 4 ? reading : target) }, "🔊 Native")
    );

    if (mode === "ai" && wavBase64) {
      mic.disabled = true;
      statusEl.textContent = "✨ Gemma is listening…";
      try {
        const res = await api("/api/speech/assess", { method: "POST", body: { audio: wavBase64, expected: target } });
        mic.disabled = false;
        statusEl.textContent = "";
        const score = res.compare ? Math.round((res.score + res.compare.score) / 2) : res.score;
        handleScore(score, [
          res.compare ? syllableChips(res.compare.syllables) : null,
          res.heard ? h("div", { class: "heard" }, "Heard: ", h("span", { class: "hz" }, res.heard)) : null,
          res.feedback ? h("div", { class: "ai-box" }, h("b", {}, "Gemma: "), res.feedback) : null,
          compareRow,
        ].filter(Boolean));
        return;
      } catch (e) {
        mic.disabled = false;
        toast(e.aiError ? "Gemma couldn't process audio — grade yourself this time" : e.message, 4000);
      }
    }
    // Self assessment
    statusEl.textContent = "Compare your recording with the native audio";
    audio.play();
    resultEl.replaceChildren(
      compareRow,
      h(
        "div",
        { class: "row", style: { width: "100%" } },
        h("button", { class: "btn red", onclick: () => { best = 30; attempts = 1; finish(30, "Keep practising"); } }, "Not yet"),
        h("button", { class: "btn", onclick: () => { best = 85; attempts = 1; finish(85, "Nice!"); } }, "Sounded right")
      )
    );
  };
  return out;
}

export function speakWord(ctx, word, { showPinyin = true } = {}) {
  const py = h("div", { class: "py" }, word.pinyin);
  py.hidden = !showPinyin;
  const peek = showPinyin ? null : h("button", { class: "reveal", onclick: () => { py.hidden = false; peek.remove(); } }, `show ${T.reading()}`);
  return {
    el: h(
      "div",
      {},
      h("div", { class: "ex-kicker orange" }, "🎤 Speak"),
      h("h2", { class: "ex-title" }, `Say “${word.english}”`),
      h(
        "div",
        { class: "word-hero" },
        h("div", { class: "big-hz hz" }, word.hanzi),
        py,
        peek,
        h("div", { class: "row", style: { justifyContent: "center", marginTop: "10px" } }, speakerBtn(sayText(word)), slowBtn(sayText(word)))
      ),
      speakPanel(ctx, word.hanzi, solution(word), word.pinyin)
    ),
    mode: "auto",
    skip: "Can't speak now",
  };
}

// ------------------------------------------------------------------ sentences

function sentenceSolution(s, extra) {
  return h(
    "div",
    {},
    h("div", { class: "hz" }, s.zh),
    h("div", { class: "small" }, s.pinyin),
    extra ? h("div", { class: "small", style: { marginTop: "4px" } }, extra) : null
  );
}

function sentencePrompt(s, kicker, cls) {
  return [
    h("div", { class: `ex-kicker ${cls}` }, kicker, s.source === "ai" ? h("span", { class: "tag" }, "✨ AI") : null),
    h("div", { class: "prompt-bubble" }, h("div", { class: "mascot" }, "🐼"), h("div", { class: "bubble" }, s.en)),
  ];
}

export function sentenceWrite(ctx, s) {
  const chars = s.chars.map((x) => ({ c: x.c, outline: !x.known }));
  const pad = writingPad(chars);
  const newCount = chars.filter((c) => c.outline).length;
  pad.done.then((r) => {
    const total = chars.length || 1;
    const score = Math.max(0, Math.round(100 - (r.mistakes * 6 + r.hints * 15 + r.gaveUp * 35) / total));
    speak(s.zh);
    ctx.finish({
      ok: score >= 60,
      grade: score >= 80 ? 2 : score >= 60 ? 1 : 0,
      score,
      title: score >= 90 ? "Beautiful writing!" : score >= 60 ? "Well done!" : "Keep practising",
      detail: sentenceSolution(s, `${r.mistakes} wrong strokes · ${score}%`),
    });
  });
  return {
    el: h(
      "div",
      {},
      ...sentencePrompt(s, "✍️ Write the sentence", "blue"),
      newCount ? h("p", { class: "small muted center", style: { margin: "0 0 8px" } }, `${newCount} character${newCount > 1 ? "s" : ""} you haven't learned yet will show a tracing guide.`) : null,
      pad.el
    ),
    mode: "auto",
    destroy: pad.destroy,
  };
}

export function sentenceType(ctx, s) {
  const ta = h("textarea", {
    class: "text-answer",
    placeholder: isSl() ? "Type in Slovenian" : isJa() ? "Type in Japanese (or romaji)" : "Type in Chinese (or pinyin with tone numbers)",
    oninput: () => ctx.setReady(ta.value.trim().length > 0),
  });
  setTimeout(() => ta.focus(), 300);
  return {
    el: h("div", {}, ...sentencePrompt(s, "⌨️ Translate", "purple"), ta, h("div", { class: "hint" }, isSl() ? "Tip: č, š, ž — long-press c, s or z on your keyboard." : isJa() ? "Tip: add the Japanese keyboard on your phone." : "Tip: add the Chinese (Pinyin) keyboard on your phone.")),
    mode: "check",
    async check() {
      const r = await api("/api/sentences/grade", { method: "POST", body: { en: s.en, zh: s.zh, reading: s.pinyin, answer: ta.value } });
      speak(r.correct ? s.zh : r.corrected || s.zh);
      const shown = { ...s };
      const bare = (t) => (t || "").replace(/[^\u3400-\u9fff\u3041-\u30ff]/g, "");
      if (r.corrected && bare(r.corrected) !== bare(s.zh)) Object.assign(shown, { zh: r.corrected, pinyin: "" });
      return {
        ok: r.correct,
        grade: r.correct ? 2 : 0,
        score: r.score,
        title: r.correct ? (r.score >= 95 ? "Perfect!" : "Correct!") : "Not quite",
        detail: h(
          "div",
          {},
          r.feedback ? h("div", { style: { marginBottom: "4px" } }, r.by === "ai" ? "✨ " : "", r.feedback) : null,
          sentenceSolution(shown),
          shown.zh !== s.zh ? h("div", { class: "small" }, "Reference: ", h("span", { class: "hz" }, s.zh)) : null
        ),
      };
    },
  };
}

export function sentenceSpeak(ctx, s) {
  const py = h("div", { class: "small muted center" }, s.pinyin);
  py.hidden = true;
  const peek = h("button", { class: "reveal", style: { alignSelf: "center" }, onclick: () => { py.hidden = false; peek.remove(); } }, `show ${T.reading()}`);
  return {
    el: h(
      "div",
      { style: { display: "flex", flexDirection: "column" } },
      ...sentencePrompt(s, `🎤 Say it in ${T.lang()}`, "orange"),
      h("div", { class: "sentence-hz hz" }, s.zh),
      py,
      peek,
      h("div", { class: "row", style: { justifyContent: "center", marginTop: "10px" } }, speakerBtn(s.zh), slowBtn(s.zh)),
      speakPanel(ctx, s.zh, sentenceSolution(s), s.pinyin)
    ),
    mode: "auto",
    skip: "Can't speak now",
  };
}

/** Speak from memory: only the English is shown. */
export function sentenceSpeakRecall(ctx, s) {
  const reveal = h("div", { class: "sentence-hz hz" }, s.zh);
  reveal.hidden = true;
  const peek = h("button", { class: "reveal", style: { alignSelf: "center" }, onclick: () => { reveal.hidden = false; peek.remove(); } }, `show ${T.lang()}`);
  return {
    el: h(
      "div",
      { style: { display: "flex", flexDirection: "column" } },
      ...sentencePrompt(s, "🎤 Translate out loud", "orange"),
      reveal,
      peek,
      speakPanel(ctx, s.zh, sentenceSolution(s), s.pinyin)
    ),
    mode: "auto",
    skip: "Can't speak now",
  };
}

/**
 * Look-alike characters (未/末 …).
 *   pick    — "Which one means …?" choose among the look-alikes
 *   meaning — see one of them, choose its meaning
 * After checking, all of them are shown side by side with what tells them apart.
 */
export function lookalike(ctx, item, kind) {
  const target = item.chars[Math.floor(Math.random() * item.chars.length)];
  const say = (c) => speak(isJa() ? c.reading || c.c : c.c);
  const options = shuffle(item.chars.slice());
  let picked = null;
  const tiles = options.map((c) => {
    const t = h(
      "button",
      {
        class: "choice" + (kind === "meaning" ? " text" : ""),
        onclick: () => {
          picked = c;
          tiles.forEach((x) => x.classList.toggle("selected", x === t));
          ctx.setReady(true);
        },
      },
      kind === "meaning" ? h("span", { class: "txt" }, c.meaning) : h("span", { class: "hz" }, c.c)
    );
    return t;
  });
  const compare = h("div", { class: "lookalike-compare", hidden: true });
  const el = h(
    "div",
    {},
    h("div", { class: "ex-kicker green" }, "🍃 Look-alikes"),
    kind === "meaning"
      ? [h("h2", { class: "ex-title" }, "What does this mean?"), h("div", { class: "big-hz hz", style: { margin: "4px 0 18px" } }, target.c)]
      : h("h2", { class: "ex-title" }, `Which one means “${target.meaning}”?`),
    h("div", { class: "choices" + (options.length === 3 ? " three" : "") }, tiles),
    compare
  );
  return {
    el,
    mode: "check",
    async check() {
      const ok = picked === target;
      tiles.forEach((t, i) => {
        if (options[i] === target) t.classList.add("correct");
        else if (options[i] === picked) t.classList.add("wrong");
      });
      say(target);
      compare.replaceChildren(
        h(
          "div",
          { class: "lookalike-row" },
          item.chars.map((c) =>
            h(
              "button",
              { class: "lookalike-card" + (c === target ? " on" : ""), onclick: () => say(c) },
              h("span", { class: "hz" }, c.c),
              c.reading ? h("small", { class: "py" }, c.reading) : null,
              h("span", {}, c.meaning)
            )
          )
        ),
        h("p", { class: "lookalike-hint" }, "💡 ", item.hint)
      );
      compare.hidden = false;
      setTimeout(() => compare.scrollIntoView({ behavior: "smooth", block: "nearest" }), 50);
      return { ok, grade: ok ? 2 : 0, title: ok ? "Correct!" : `That was ${picked.c} — ${picked.meaning}`, detail: ok ? `${target.c} = ${target.meaning}` : `${target.c} = ${target.meaning}` };
    },
  };
}

// ------------------------------------------------------------------ grammar

const escRe = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const ENDED = /([\p{L}]*)\[([^\]]*)\]([\p{L}]*)/u;

/** "hiš[a]" → the text with the ending in its own colour (Slovenian grammar). */
export function withEndings(text) {
  return String(text ?? "").split(/\[([^\]]*)\]/).map((part, i) => (i % 2 ? h("span", { class: "g-end" }, part) : part));
}
/** The sentence without the [ending] marks (for speech and comparing). */
export const plainText = (t) => String(t ?? "").replace(/[[\]]/g, "");

/** Grammar explanation: paragraphs (blank line), "• " bullet lists, **bold** and [endings] in colour. */
export function richText(text, cls = "g-explain") {
  const inline = (str) => str.split(/(\*\*[^*]+\*\*)/).map((seg) => (seg.startsWith("**") && seg.endsWith("**") ? h("b", {}, withEndings(seg.slice(2, -2))) : withEndings(seg)));
  return h(
    "div",
    { class: cls },
    String(text ?? "").split(/\n\s*\n/).flatMap((par) => {
      // Within a paragraph, runs of "• " lines become a list and the other lines stay text.
      const out = [];
      for (const l of par.split("\n").filter((x) => x.trim())) {
        const bullet = /^\s*[•-]\s/.test(l);
        const last = out[out.length - 1];
        if (bullet) {
          if (last?.type === "ul") last.items.push(l.replace(/^\s*[•-]\s/, ""));
          else out.push({ type: "ul", items: [l.replace(/^\s*[•-]\s/, "")] });
        } else if (last?.type === "p") last.items.push(l);
        else out.push({ type: "p", items: [l] });
      }
      return out.map((g) => (g.type === "ul" ? h("ul", {}, g.items.map((x) => h("li", {}, inline(x)))) : h("p", {}, g.items.flatMap((x, i) => (i ? [h("br"), ...inline(x)] : inline(x))))));
    })
  );
}

/** The example sentence with the grammar highlighted — or blanked out for the gap quiz. */
function markedSentence(x, { gap = false } = {}) {
  if (/\[[^\]]*\]/.test(x.text)) {
    // Slovenian: endings in colour; in a drill the whole word becomes a gap with its basic form.
    if (gap && x.drill) {
      const m = x.text.match(ENDED);
      const [before, after] = [x.text.slice(0, m.index), x.text.slice(m.index + m[0].length)];
      return h("span", {}, withEndings(before), h("span", { class: "g-gap" }, "＿＿"), h("span", { class: "g-base" }, ` (${x.drill.base})`), withEndings(after));
    }
    return h("span", {}, withEndings(x.text));
  }
  const marks = (x.mark || []).filter(Boolean);
  if (!marks.length) return h("span", {}, x.text);
  const parts = x.text.split(new RegExp(`(${marks.map(escRe).join("|")})`));
  return h("span", {}, parts.map((p) => (marks.includes(p) ? (gap ? h("span", { class: "g-gap" }, "＿＿") : h("mark", { class: "g-mark" }, p)) : p)));
}

function grammarExampleBox(x, { gap = false, showReading = true, fresh = false } = {}) {
  // The translation stays hidden until tapped, so you try to understand the sentence first.
  const en = h("button", { class: "g-en-reveal small", onclick: () => en.replaceWith(h("div", { class: "g-en small" }, x.en)) }, "👁 Show translation");
  return h(
    "div",
    { class: "g-example" + (fresh ? " g-fresh" : "") },
    fresh ? h("div", { class: "g-fresh-tag" }, "✨ From your words") : null,
    h("div", { class: "row", style: { alignItems: "center", gap: "10px" } }, speakerBtn(plainText(x.text)), h("div", { class: "g-text hz" }, markedSentence(x, { gap }))),
    showReading && x.reading && x.reading !== x.text ? h("div", { class: "g-reading small muted" }, x.reading) : null,
    en
  );
}

/** Introduces one grammar point: pattern, an example from words you know, and how it's used. */
export function grammarIntro(ctx, p, i, n) {
  const seen = new Set(p.examples.map((x) => x.text));
  const exBox = h("div", {}, grammarExampleBox(p.examples[0]));
  const more = p.examples.slice(1);
  const moreBox = h("div", { class: "g-more", hidden: true }, more.map((x) => grammarExampleBox(x)));
  const aiBtn = state.settings?.ai_enabled
    ? h(
        "button",
        {
          class: "btn ghost small auto",
          onclick: async (e) => {
            const b = e.currentTarget;
            b.disabled = true;
            b.textContent = "✨ Asking Gemma…";
            try {
              // Tell Gemma what you've already seen so it writes a really new sentence.
              let x = await api("/api/grammar/example", { method: "POST", body: { id: p.id, avoid: [...seen] } });
              if (seen.has(x.text)) x = await api("/api/grammar/example", { method: "POST", body: { id: p.id, avoid: [...seen] } });
              if (seen.has(x.text)) throw new Error("Gemma came up with the same sentence again — try once more");
              seen.add(x.text);
              exBox.replaceChildren(grammarExampleBox(x, { fresh: true }));
              speak(plainText(x.text));
              b.textContent = "✨ Another example from my words";
            } catch (err) {
              b.textContent = "✨ New example from my words";
              toast(err.message, 3500);
            }
            b.disabled = false;
          },
        },
        "✨ New example from my words"
      )
    : null;
  const el = h(
    "div",
    { class: "g-intro" },
    h("div", { class: "ex-kicker blue" }, `📘 Grammar ${i + 1} of ${n}`),
    h("h2", { class: "ex-title" }, p.title),
    h("div", { class: "g-pattern hz" }, withEndings(p.pattern)),
    exBox,
    richText(p.explain),
    h(
      "div",
      { class: "row", style: { gap: "8px", flexWrap: "wrap", justifyContent: "center" } },
      more.length ? h("button", { class: "btn ghost small auto", onclick: (e) => { moreBox.hidden = !moreBox.hidden; e.currentTarget.textContent = moreBox.hidden ? `More examples (${more.length})` : "Hide examples"; } }, `More examples (${more.length})`) : null,
      aiBtn
    ),
    moreBox
  );
  setTimeout(() => speak(plainText(p.examples[0].text)), 400);
  return { el, mode: "continue" };
}

function grammarChoice(ctx, p, x, options, { kicker, title, gap }) {
  let picked = null;
  const tiles = options.map((o) => {
    const t = h(
      "button",
      { class: "choice text", onclick: () => { picked = o; tiles.forEach((b) => b.classList.toggle("selected", b === t)); ctx.setReady(true); } },
      h("span", { class: gap ? "txt hz" : "txt" }, o.label)
    );
    return t;
  });
  return {
    el: h("div", {}, h("div", { class: "ex-kicker blue" }, kicker), h("h2", { class: "ex-title" }, title), grammarExampleBox(x, { gap, showReading: !gap }), h("div", { class: "choices" }, tiles)),
    mode: "check",
    async check() {
      const ok = picked.id === p.id;
      tiles.forEach((t, i) => {
        if (options[i].id === p.id) t.classList.add("correct");
        else if (options[i] === picked) t.classList.add("wrong");
      });
      speak(plainText(x.text));
      return {
        ok,
        grade: ok ? 2 : 0,
        title: ok ? "Correct!" : "Correct answer:",
        detail: h("div", {}, h("b", {}, p.title), h("div", { class: "hz" }, markedSentence(x)), h("div", { class: "small" }, x.en)),
      };
    },
  };
}

/** Quiz: which grammar point does this sentence use? */
export const grammarWhich = (ctx, p, x, options) =>
  grammarChoice(ctx, p, x, options, { kicker: "📘 Grammar", title: "What does the highlighted part do?", gap: false });

/** Quiz: fill the gap with the right grammar. */
export const grammarGap = (ctx, p, x, options) =>
  grammarChoice(ctx, p, x, options, { kicker: "📘 Grammar", title: "Fill in the gap", gap: true });

/** The form of a word with the part that changes in colour (stem = what all the options share). */
function formTile(form, stemLen) {
  return h("span", { class: "txt hz" }, form.slice(0, stemLen), h("span", { class: "g-end" }, form.slice(stemLen)));
}

/** Ending drill (Slovenian): "Grem v ＿＿ (trgovina)" → pick the right form, trgovin·o. */
export function grammarDrill(ctx, p, x) {
  const m = x.text.match(ENDED);
  const answer = m ? m[1] + m[2] + m[3] : "";
  // At the start of a sentence the answer is capitalised: show the options the same way.
  const cap = answer && answer[0] !== answer[0].toLowerCase();
  const fit = (f) => (cap ? f[0].toUpperCase() + f.slice(1) : f);
  const forms = shuffle([answer, ...shuffle((x.drill.options || []).map(fit).filter((f) => f && f !== answer)).slice(0, 3)]);
  let stem = 0;
  while (forms.every((f) => f[stem] && f[stem] === forms[0][stem])) stem++;
  let picked = null;
  const tiles = forms.map((f) => {
    const t = h("button", { class: "choice text", onclick: () => { picked = f; tiles.forEach((b) => b.classList.toggle("selected", b === t)); ctx.setReady(true); } }, formTile(f, stem));
    return t;
  });
  return {
    el: h(
      "div",
      {},
      h("div", { class: "ex-kicker blue" }, "📘 Endings"),
      h("h2", { class: "ex-title" }, "Which form fits?"),
      grammarExampleBox(x, { gap: true }),
      h("div", { class: "choices" }, tiles)
    ),
    mode: "check",
    async check() {
      const ok = picked === answer;
      tiles.forEach((t, i) => {
        if (forms[i] === answer) t.classList.add("correct");
        else if (forms[i] === picked) t.classList.add("wrong");
      });
      speak(plainText(x.text));
      return {
        ok,
        grade: ok ? 2 : 0,
        title: ok ? "Correct!" : "Correct answer:",
        detail: h("div", {}, h("div", { class: "hz" }, markedSentence(x)), h("div", { class: "small muted" }, p.title), h("div", { class: "small" }, x.en)),
      };
    },
  };
}

// ------------------------------------------------------------------ listening

/** Dictation: hear a sentence and write it (by hand for Chinese/Japanese, typed for Slovenian). */
export function dictation(ctx, item) {
  const play = () => speak(item.text);
  setTimeout(play, 400);
  const audio = h("div", { class: "row", style: { justifyContent: "center", margin: "6px 0 14px" } }, speakerBtn(item.text), slowBtn(item.text));
  const solutionEl = (extra) => h("div", {}, h("div", { class: "hz" }, item.text), item.reading && item.reading !== item.text ? h("div", { class: "small" }, item.reading) : null, h("div", { class: "small" }, item.en), extra ? h("div", { class: "small" }, extra) : null);
  if (isSl()) {
    const input = h("input", { class: "input", autocomplete: "off", autocapitalize: "off", spellcheck: "false", placeholder: "Type what you hear", oninput: () => ctx.setReady(!!input.value.trim()), onkeydown: (e) => e.key === "Enter" && input.value.trim() && ctx.submit() });
    return {
      el: h("div", {}, h("div", { class: "ex-kicker blue" }, "🎧 Dictation"), h("h2", { class: "ex-title" }, "Type what you hear"), audio, input, h("div", { class: "hint" }, "Tip: č, š, ž — long-press c, s or z.")),
      mode: "check",
      async check() {
        const r = await api("/api/check/pinyin", { method: "POST", body: { answer: input.value, expected: item.text } });
        const ok = r.result === "correct";
        return { ok, grade: ok ? 2 : r.result === "tones_wrong" ? 1 : 0, title: ok ? "Correct!" : r.result === "tones_wrong" ? "Almost — mind č, š, ž" : "Correct answer:", detail: solutionEl() };
      },
    };
  }
  const pad = writingPad(item.chars.map((x) => ({ c: x.c, outline: !x.known })));
  pad.done.then((r) => {
    const total = item.chars.length || 1;
    const score = Math.max(0, Math.round(100 - (r.mistakes * 6 + r.hints * 15 + r.gaveUp * 35) / total));
    play();
    ctx.finish({ ok: score >= 60, grade: score >= 80 ? 2 : score >= 60 ? 1 : 0, score, title: score >= 90 ? "Great ear!" : score >= 60 ? "Well done!" : "Keep listening", detail: solutionEl(`${r.mistakes} wrong strokes · ${score}%`) });
  });
  const newCount = item.chars.filter((x) => !x.known).length;
  return {
    el: h(
      "div",
      {},
      h("div", { class: "ex-kicker blue" }, "🎧 Dictation"),
      h("h2", { class: "ex-title" }, "Write what you hear"),
      audio,
      newCount ? h("p", { class: "small muted center", style: { margin: "0 0 8px" } }, `${newCount} character${newCount > 1 ? "s" : ""} you haven't learned yet will show a tracing guide.`) : null,
      pad.el
    ),
    mode: "auto",
    destroy: pad.destroy,
  };
}

/** Hear a sentence, pick what it means. */
export function listenChoose(ctx, item, others) {
  const wrong = shuffle([...new Set(others.filter((e) => e !== item.en))]).slice(0, 3);
  const options = shuffle([item.en, ...wrong]);
  let picked = null;
  setTimeout(() => speak(item.text), 400);
  const tiles = options.map((o) => {
    const t = h("button", { class: "choice text", onclick: () => { picked = o; tiles.forEach((b) => b.classList.toggle("selected", b === t)); ctx.setReady(true); } }, h("span", { class: "txt" }, o));
    return t;
  });
  return {
    el: h(
      "div",
      {},
      h("div", { class: "ex-kicker blue" }, "👂 Listen"),
      h("h2", { class: "ex-title" }, "What did you hear?"),
      h("div", { class: "row", style: { justifyContent: "center", margin: "6px 0 18px" } }, speakerBtn(item.text), slowBtn(item.text)),
      h("div", { class: "choices" }, tiles)
    ),
    mode: "check",
    async check() {
      const ok = picked === item.en;
      tiles.forEach((t, i) => { if (options[i] === item.en) t.classList.add("correct"); else if (options[i] === picked) t.classList.add("wrong"); });
      return { ok, grade: ok ? 2 : 0, title: ok ? "Correct!" : "Correct answer:", detail: h("div", {}, h("div", { class: "hz" }, item.text), h("div", { class: "small" }, item.reading || ""), h("div", { class: "small" }, item.en)) };
    },
  };
}

// ------------------------------------------------------------------ tones (Chinese)

const TONE_MARKS = { a: "āáǎà", e: "ēéěè", i: "īíǐì", o: "ōóǒò", u: "ūúǔù", ü: "ǖǘǚǜ" };
const plainSyl = (s) => s.normalize("NFD").replace(/[̀́̌̄]/g, "").normalize("NFC").replace(/ü/g, "ü");
/** Tone number of a pinyin syllable (5 = neutral). */
export function toneOf(syl) {
  const d = syl.normalize("NFD");
  if (d.includes("̄")) return 1;
  if (d.includes("́")) return 2;
  if (d.includes("̌")) return 3;
  if (d.includes("̀")) return 4;
  return 5;
}
/** The syllable written with another tone mark (standard placement rules). */
function withTone(syl, tone) {
  const p = plainSyl(syl).toLowerCase();
  if (tone === 5) return p;
  const i = p.search(/[ae]/) >= 0 ? p.search(/[ae]/) : p.includes("ou") ? p.indexOf("o") : Math.max(...[..."iouü"].map((v) => p.lastIndexOf(v)));
  if (i < 0) return p;
  return p.slice(0, i) + TONE_MARKS[p[i]][tone - 1] + p.slice(i + 1);
}

/** Hear a word, pick its tones. */
export function toneListen(ctx, w) {
  const tones = w.syllables.map(toneOf);
  const key = (ts) => ts.join("");
  const seen = new Set([key(tones)]);
  const opts = [tones];
  for (let tries = 0; opts.length < 4 && tries < 40; tries++) {
    const alt = tones.map((t) => (Math.random() < 0.6 ? 1 + Math.floor(Math.random() * 4) : t));
    if (!seen.has(key(alt))) { seen.add(key(alt)); opts.push(alt); }
  }
  const options = shuffle(opts);
  const label = (ts) => w.syllables.map((s, i) => withTone(s, ts[i])).join(" ");
  let picked = null;
  setTimeout(() => speak(w.hanzi), 400);
  const tiles = options.map((o) => {
    const t = h("button", { class: "choice text", onclick: () => { picked = o; tiles.forEach((b) => b.classList.toggle("selected", b === t)); ctx.setReady(true); } }, h("span", { class: "txt py" }, label(o)), h("small", { class: "tone-nums" }, o.join(" · ")));
    return t;
  });
  return {
    el: h(
      "div",
      {},
      h("div", { class: "ex-kicker orange" }, "🎵 Tones"),
      h("h2", { class: "ex-title" }, "Which tones do you hear?"),
      h("div", { class: "row", style: { justifyContent: "center", margin: "6px 0 18px" } }, speakerBtn(w.hanzi), slowBtn(w.hanzi)),
      h("div", { class: "choices" }, tiles)
    ),
    mode: "check",
    async check() {
      const ok = key(picked) === key(tones);
      tiles.forEach((t, i) => { if (key(options[i]) === key(tones)) t.classList.add("correct"); else if (options[i] === picked) t.classList.add("wrong"); });
      return { ok, grade: ok ? 2 : 0, title: ok ? "Correct!" : "Correct answer:", detail: h("div", {}, h("span", { class: "hz" }, w.hanzi), ` · ${w.pinyin} · ${w.english}`) };
    },
  };
}

/** Say a one-syllable word; see the pitch of your voice next to the tone's textbook shape. */
export function toneSpeak(ctx, w, pitch) {
  const tone = toneOf(w.syllables[0]);
  const chart = h("div", { class: "tone-box", html: pitch.toneChart(tone, null) });
  const status = h("p", { class: "muted small center" }, "Tap the microphone, then say the word.");
  let busy = false;
  const mic = h(
    "button",
    {
      class: "mic",
      onclick: async () => {
        if (busy) return;
        busy = true;
        mic.classList.add("rec");
        status.textContent = "Listening…";
        try {
          const frames = await pitch.recordPitch(1700);
          const pts = pitch.contour(frames);
          if (!pts) {
            status.textContent = "I couldn't hear you clearly — try again a bit louder.";
          } else {
            const got = pitch.classify(pts);
            chart.innerHTML = pitch.toneChart(tone, pts);
            const ok = got === tone || tone === 5;
            status.textContent = ok ? `Nice — that sounded like tone ${tone}!` : `That sounded like tone ${got}; ${w.syllables[0]} is tone ${tone}. Compare the lines and try again.`;
            if (ok) ctx.finish({ ok: true, grade: 2, title: "Good tone!", detail: h("div", {}, h("span", { class: "hz" }, w.hanzi), ` · ${w.pinyin} · tone ${tone}`) });
          }
        } catch (e) {
          status.textContent = "Microphone not available: " + e.message;
        }
        mic.classList.remove("rec");
        busy = false;
      },
      html: icons.mic || "🎤",
    }
  );
  return {
    el: h(
      "div",
      { class: "tone-speak" },
      h("div", { class: "ex-kicker orange" }, "🎵 Say it with the right tone"),
      h("div", { class: "big-hz hz" }, w.hanzi),
      h("div", { class: "py center", style: { fontSize: "22px" } }, w.pinyin),
      h("div", { class: "row", style: { justifyContent: "center", margin: "6px 0" } }, speakerBtn(w.hanzi), slowBtn(w.hanzi)),
      chart,
      h("p", { class: "small muted center", style: { margin: "0" } }, "Dashed: how the tone should go · solid: your voice"),
      h("div", { class: "row", style: { justifyContent: "center", margin: "12px 0 4px" } }, mic),
      status,
      h("div", { class: "row", style: { justifyContent: "center" } }, h("button", { class: "btn ghost small auto", onclick: () => ctx.finish({ ok: true, grade: 1, title: "Skipped", detail: h("div", {}, `${w.hanzi} · ${w.pinyin}`) }) }, "Skip"))
    ),
    mode: "auto",
  };
}
