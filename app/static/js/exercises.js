// Exercise types. Each factory gets (ctx, ...) and returns
//   { el, mode: "check" | "continue" | "auto", check?, destroy? }
// ctx: { setReady(bool), finish(result), skip() }
// result: { ok: true|false, grade: 0..3, title?, detail? }
import { api, h, icons, iconBtn, shuffle, toast } from "./util.js";
import { speak, stopSpeaking, canRecognize, canRecord, recognize, Recorder } from "./audio.js";
import { writingPad, strokeDemo } from "./writer.js";
import { state, T, isJa, sayText } from "./state.js";

const speakerBtn = (text, cls = "speaker") => iconBtn("speaker", cls, () => speak(text), "Listen");
const slowBtn = (text) => iconBtn("slow", "speaker sm", () => speak(text, { slow: true }), "Listen slowly");

function solution(word, extra) {
  return h(
    "div",
    {},
    h("span", { class: "hz" }, word.hanzi),
    " · ",
    word.pinyin,
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

export function intro(ctx, word) {
  const ai = h("div");
  const loadAI = async (refresh = false) => {
    ai.replaceChildren(h("div", { class: "ai-box" }, "✨ Asking Gemma…"));
    try {
      const x = await api(`/api/words/${word.id}/extras${refresh ? "?refresh=1" : ""}`);
      ai.replaceChildren(
        h(
          "div",
          { class: "ai-box" },
          x.mnemonic ? h("div", {}, h("b", {}, "Memory hook: "), x.mnemonic) : h("div", { class: "small muted" }, "No English memory hook this time — tap “New memory hook” to try again."),
          x.components ? h("div", { style: { marginTop: "6px" } }, h("b", {}, "Parts: "), x.components) : null,
          x.example_zh
            ? h(
                "div",
                { class: "row", style: { marginTop: "8px" } },
                speakerBtn(x.example_zh, "speaker sm"),
                h("div", {}, h("div", { class: "hz" }, x.example_zh), h("div", { class: "small muted" }, x.example_pinyin || ""), h("div", { class: "small" }, x.example_en))
              )
            : null,
          h("button", { class: "reveal", style: { marginTop: "10px" }, onclick: () => loadAI(true) }, "↻ New memory hook")
        )
      );
    } catch (e) {
      ai.replaceChildren(
        h("div", { class: "ai-box" }, "AI hints unavailable: ", e.message, " ", h("button", { class: "reveal", onclick: () => loadAI(true) }, "Try again"))
      );
    }
  };
  const aiOn = state.settings?.ai_enabled;
  if (word.extras) loadAI();

  const demo = strokeDemo(word.hanzi);
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
    aiOn && !word.extras
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
        h("div", { class: "bubble" }, `“${word.english}”`, h("div", { class: "small muted row", style: { marginTop: "4px" } }, pyEl, pinyinHint ? null : peek))
      ),
      pad.el
    ),
    mode: "auto",
    destroy: pad.destroy,
  };
}

// ------------------------------------------------------------------ recall

export function multipleChoice(ctx, word, pool) {
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
      h("h2", { class: "ex-title" }, `Which one means “${word.english}”?`),
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
  const field = kind === "meaning" ? "english" : kind === "reading" ? "pinyin" : "hanzi";
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
      h("div", { class: "ex-kicker" }, kind === "meaning" ? "🧠 Meaning" : `🔤 ${isJa() ? "Reading" : "Pinyin"}`),
      h("h2", { class: "ex-title" }, kind === "meaning" ? "What does this mean?" : `How is this read?`),
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
      h("h2", { class: "ex-title" }, `How do you say “${word.english}”?`),
      h("p", { class: "muted" }, isJa() ? "Type the reading in romaji or hiragana." : "Type the pinyin. Tones as numbers (ni3 hao3) or marks."),
      input
    ),
    mode: "check",
    async check() {
      const r = await api("/api/check/pinyin", { method: "POST", body: { answer: input.value, expected: word.pinyin } });
      speak(sayText(word));
      if (r.result === "correct") return { ok: true, grade: 2, title: "Correct!", detail: solution(word) };
      if (r.result === "tones_wrong") return { ok: false, grade: 1, title: "Almost — check the tones", detail: solution(word) };
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
    placeholder: isJa() ? "Type in Japanese (or romaji)" : "Type in Chinese (or pinyin with tone numbers)",
    oninput: () => ctx.setReady(ta.value.trim().length > 0),
  });
  setTimeout(() => ta.focus(), 300);
  return {
    el: h("div", {}, ...sentencePrompt(s, "⌨️ Translate", "purple"), ta, h("div", { class: "hint" }, isJa() ? "Tip: add the Japanese keyboard on your phone." : "Tip: add the Chinese (Pinyin) keyboard on your phone.")),
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
