// Handwriting with stroke-order checking, powered by Hanzi Writer.
// Each character is written on a fresh pad, so you never see your previous attempts.
import { h } from "./util.js";
import { state } from "./state.js";

// Stroke strictness setting -> hanzi-writer leniency (its own default of 1 is very exact).
const LENIENCY = { "0.7": 1.25, "1": 1.8, "1.4": 2.5 };

const css = (name) => getComputedStyle(document.documentElement).getPropertyValue(name).trim();

function loader(char, onLoad, onError) {
  const url = window.__charDataUrl ? window.__charDataUrl(char) : `/api/chardata/${encodeURIComponent(char)}`;
  fetch(url)
    .then((r) => (r.ok ? r.json() : Promise.reject(new Error("no data"))))
    .then(onLoad)
    .catch(onError);
}

function gridSvg(size) {
  const s = size;
  const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  svg.setAttribute("class", "grid");
  svg.setAttribute("width", s);
  svg.setAttribute("height", s);
  svg.innerHTML = `<line x1="0" y1="${s / 2}" x2="${s}" y2="${s / 2}"/><line x1="${s / 2}" y1="0" x2="${s / 2}" y2="${s}"/>
    <line x1="0" y1="0" x2="${s}" y2="${s}"/><line x1="${s}" y1="0" x2="0" y2="${s}"/>`;
  return svg;
}

function padSize(max = 340) {
  const w = Math.min(window.innerWidth - 40, max);
  const hgt = window.innerHeight - 400; // leave room for prompt + footer
  return Math.max(220, Math.min(w, Math.max(hgt, 240)));
}

/**
 * Write a sequence of characters.
 * chars: [{ c: "猫", outline: false }]  outline=true shows a trace guide.
 * Returns { el, done: Promise<{mistakes, hints, gaveUp, skipped}> , destroy() }
 */
export function writingPad(chars, { showSlots = true } = {}) {
  const settings = state.settings || {};
  const hintAfter = Number(settings.hint_after_misses || 3);
  const size = padSize();
  const writerEl = h("div", { class: "writer" });
  const pad = h("div", { class: "pad", style: { width: `${size}px`, height: `${size}px` } }, gridSvg(size), writerEl);
  const slots = chars.map((ch) => h("div", { class: "slot" + (ch.outline ? " new" : "") }, ""));
  const status = h("div", { class: "pad-status" }, "");
  const hintBtn = h("button", { class: "btn ghost small", onclick: () => giveHint() }, "💡 Hint");
  const showBtn = h("button", { class: "btn ghost small", onclick: () => showMe() }, "👀 Show me");
  const el = h(
    "div",
    { class: "pad-wrap" },
    showSlots && chars.length > 1 ? h("div", { class: "slots" }, slots) : null,
    pad,
    status,
    h("div", { class: "pad-tools" }, hintBtn, showBtn)
  );

  const result = { mistakes: 0, hints: 0, gaveUp: 0, skipped: 0, perChar: [] };
  let idx = -1;
  let writer = null;
  let charStats = null;
  let destroyed = false;
  let resolveDone;
  const done = new Promise((r) => (resolveDone = r));

  function setStatus(text, cls = "") {
    status.textContent = text;
    status.className = "pad-status " + cls;
  }

  function next() {
    if (destroyed) return;
    idx++;
    slots.forEach((s, i) => s.classList.toggle("current", i === idx));
    if (idx >= chars.length) {
      hintBtn.hidden = showBtn.hidden = true;
      resolveDone(result);
      return;
    }
    const { c, outline } = chars[idx];
    charStats = { c, mistakes: 0, hints: 0, gaveUp: false, hintedStrokes: new Set() };
    hintBtn.disabled = showBtn.disabled = false;
    showBtn.hidden = false;
    hintBtn.hidden = !!outline;
    writerEl.innerHTML = "";
    setStatus(outline ? "Trace the character — follow the stroke order" : chars.length > 1 ? `Character ${idx + 1} of ${chars.length}` : "Write from memory");
    startWriter(c, outline);
  }

  function startWriter(c, outline) {
    writer = HanziWriter.create(writerEl, c, {
      width: size,
      height: size,
      padding: Math.round(size * 0.06),
      showCharacter: false,
      showOutline: outline,
      strokeColor: css("--ink") || "#3c3c3c",
      outlineColor: css("--grid") || "#ddd",
      drawingColor: css("--draw") || css("--blue") || "#1cb0f6",
      highlightColor: css("--orange") || "#ff9600",
      radicalColor: null,
      drawingWidth: Math.max(14, Math.round(size / 22)),
      strokeAnimationSpeed: 1.4,
      delayBetweenStrokes: 120,
      showHintAfterMisses: hintAfter,
      markStrokeCorrectAfterMisses: hintAfter + 2,
      // Forgiving matching: a stroke a little off the line still counts (the setting picks how much).
      leniency: LENIENCY[String(settings.leniency)] || LENIENCY["1"],
      averageDistanceThreshold: 450,
      highlightOnComplete: true,
      charDataLoader: loader,
      onLoadCharDataError: () => {
        setStatus(`No stroke data for ${c} — skipped`, "bad");
        slots[idx] && (slots[idx].textContent = c);
        result.skipped++;
        setTimeout(next, 1200);
      },
    });
    writer.quiz({
      onMistake: (s) => {
        charStats.mistakes++;
        if (s.mistakesOnStroke >= hintAfter && !charStats.hintedStrokes.has(s.strokeNum)) {
          charStats.hintedStrokes.add(s.strokeNum);
          charStats.hints++;
          setStatus("Here's a hint — follow the highlight", "bad");
        } else {
          setStatus(s.isBackwards ? "Wrong direction" : "Not quite — try that stroke again", "bad");
        }
        pad.classList.remove("shake");
        void pad.offsetWidth;
        pad.classList.add("shake");
      },
      onCorrectStroke: (s) => {
        setStatus(s.strokesRemaining ? `${s.strokesRemaining} stroke${s.strokesRemaining > 1 ? "s" : ""} left` : "", "good");
      },
      onComplete: () => {
        const ok = charStats.mistakes === 0 && !charStats.hints && !charStats.gaveUp;
        setStatus(ok ? "Perfect! ✨" : "Done", "good");
        if (slots[idx]) {
          slots[idx].textContent = c;
          slots[idx].classList.add(ok ? "done" : "missed");
        }
        result.mistakes += charStats.mistakes;
        result.hints += charStats.hints;
        result.gaveUp += charStats.gaveUp ? 1 : 0;
        result.perChar.push({ c, mistakes: charStats.mistakes, hints: charStats.hints, gaveUp: charStats.gaveUp });
        hintBtn.hidden = showBtn.hidden = true;
        setTimeout(next, chars.length > 1 ? 700 : 300);
      },
    });
  }

  function giveHint() {
    if (!writer) return;
    charStats.hints++;
    writer.showOutline();
    hintBtn.disabled = true;
    setStatus("Outline shown — this counts as a hint");
  }

  async function showMe() {
    if (!writer) return;
    charStats.gaveUp = true;
    hintBtn.disabled = showBtn.disabled = true;
    writer.cancelQuiz();
    setStatus("Watch the stroke order, then trace it");
    writer.showOutline();
    await writer.animateCharacter();
    await writer.hideCharacter();
    if (destroyed) return;
    writer.quiz({
      onMistake: () => charStats.mistakes++,
      onComplete: () => {
        result.mistakes += charStats.mistakes;
        result.hints += charStats.hints;
        result.gaveUp++;
        result.perChar.push({ c: charStats.c, mistakes: charStats.mistakes, hints: charStats.hints, gaveUp: true });
        if (slots[idx]) {
          slots[idx].textContent = charStats.c;
          slots[idx].classList.add("missed");
        }
        setTimeout(next, 500);
      },
    });
  }

  // Start after being attached so sizes/colours resolve.
  requestAnimationFrame(next);

  return {
    el,
    done,
    destroy() {
      destroyed = true;
      try { writer && writer.cancelQuiz(); } catch { /* ignore */ }
    },
  };
}

/** Stroke-order animation for a word (each character animates in turn). */
export function strokeDemo(word, { size } = {}) {
  const chars = [...word];
  const each = size || Math.min(chars.length > 1 ? 150 : 220, Math.floor((window.innerWidth - 60) / chars.length));
  const writers = [];
  const boxes = chars.map((c) => {
    const box = h("div", { class: "writer" });
    const pad = h("div", { class: "pad", style: { width: `${each}px`, height: `${each}px` } }, gridSvg(each), box);
    requestAnimationFrame(() => {
      writers.push(
        HanziWriter.create(box, c, {
          width: each,
          height: each,
          padding: Math.round(each * 0.06),
          showOutline: true,
          showCharacter: true,
          strokeColor: css("--ink"),
          outlineColor: css("--grid"),
          radicalColor: css("--green"),
          strokeAnimationSpeed: 1.2,
          delayBetweenStrokes: 220,
          charDataLoader: loader,
        })
      );
    });
    return pad;
  });
  let playing = false;
  async function play() {
    if (playing) return;
    playing = true;
    for (const w of writers) await w.hideCharacter();
    for (const w of writers) await w.animateCharacter();
    playing = false;
  }
  const el = h(
    "div",
    { class: "pad-wrap" },
    h("div", { class: "row", style: { justifyContent: "center", flexWrap: "wrap" } }, boxes),
    h("button", { class: "btn ghost small", onclick: play }, "▶ Stroke order")
  );
  setTimeout(play, 600);
  return { el, play };
}
