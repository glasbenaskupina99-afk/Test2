// Duolingo-style lesson runner: progress bar, exercise, check/continue footer, end screen.
import { api, h, confirmDialog } from "./util.js";
import { stopSpeaking } from "./audio.js";
import { playCorrect, playWrong, playComplete } from "./sounds.js";

const END_MSG = {
  bloom: "Beautiful — your plant is in bloom!",
  grow: "Well watered — your garden grew today.",
  sprout: "Every drop counts. Your sprout is growing.",
};

const ICONS = {
  drop: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linejoin="round"><path d="M12 3s-6 7-6 11.5a6 6 0 0 0 12 0C18 10 12 3 12 3z"/><path d="M9.5 15a2.6 2.6 0 0 0 2 2.4" stroke-linecap="round"/></svg>',
  leaf: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><path d="M5 19C5 10 10 5 20 4c0 10-5 15-15 15z"/><path d="M5 19l9-9"/></svg>',
  clock: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round"><circle cx="12" cy="13" r="7.5"/><path d="M12 9v4l2.5 2M10 2.5h4"/></svg>',
};

/** End-of-lesson art: a plant growing in its pot while leaves drift down; it blooms after a great lesson. */
function gardenArt(mood) {
  const falling = [12, 30, 52, 70, 88]
    .map((x, i) => `<path class="fall f${i}" d="M${x} -6c-4 0-7 3-7 7 4 0 7-3 7-7z"/>`)
    .join("");
  const bloom =
    mood === "bloom"
      ? `<g class="blossom">${[0, 72, 144, 216, 288].map((a) => `<ellipse cx="50" cy="20" rx="5" ry="8" transform="rotate(${a} 50 28)"/>`).join("")}<circle class="heart" cx="50" cy="28" r="4.5"/></g>`
      : "";
  const top = mood === "sprout" ? "" : `<path class="leaf l3" d="M50 40C44 34 44 24 50 16C56 24 56 34 50 40Z"/>`;
  return `<svg viewBox="0 0 100 110" aria-hidden="true">
    <g class="falls">${falling}</g>
    <ellipse class="glow" cx="50" cy="64" rx="46" ry="44"/>
    <path class="pot" d="M30 84h40l-5 22H35z"/><rect class="pot-rim" x="27" y="80" width="46" height="8" rx="3"/>
    <path class="stem" d="M50 82C50 70 49 56 50 ${mood === "sprout" ? 58 : 34}" fill="none" stroke-width="3.2" stroke-linecap="round"/>
    <path class="leaf l1" d="M50 70C41 71 31 66 27 57C37 55 46 60 50 70Z"/>
    <path class="leaf l2" d="M50 60C59 61 69 55 72 45C62 44 54 50 50 60Z"/>
    ${top}${bloom}
  </svg>`;
}

/**
 * steps: [{ make(ctx) -> exercise, after?(result) -> Promise<{xp?, requeue?: step}> }]
 * Returns a promise resolving with a summary when the lesson ends (or null if quit).
 */
export function runLesson({ steps, title = "Lesson", endTitle = "Lesson complete!", onDone }) {
  const queue = steps.slice();
  let pos = 0;
  let current = null;
  let correct = 0;
  let graded = 0;
  let xp = 0;
  let combo = 0;
  const started = Date.now();

  const bar = h("i", { style: { width: "0%" } });
  const comboEl = h("div", { class: "stat fire", style: { minWidth: "48px", justifyContent: "flex-end" } });
  const body = h("div", { class: "lesson-body" });
  const footInner = h("div", { class: "inner" });
  const foot = h("div", { class: "lesson-foot" }, footInner);
  const root = h(
    "div",
    { class: "lesson" },
    h(
      "div",
      { class: "lesson-top" },
      h("button", { class: "icon-btn", "aria-label": "Quit", onclick: quit }, "✕"),
      h("div", { class: "progress" }, bar),
      comboEl
    ),
    body,
    foot
  );
  document.body.append(root);
  document.body.style.overflow = "hidden";

  let resolveLesson;
  const finished = new Promise((r) => (resolveLesson = r));

  function updateBar() {
    bar.style.width = `${Math.round((100 * pos) / Math.max(queue.length, 1))}%`;
    comboEl.textContent = combo >= 3 ? `🔥${combo}` : "";
  }

  function close(result) {
    current?.destroy?.();
    stopSpeaking();
    root.remove();
    document.body.style.overflow = "";
    resolveLesson(result);
  }

  async function quit() {
    if (pos === 0) return close(null);
    const ok = await confirmDialog({
      icon: "🌱", title: "Quit this lesson?", message: "Progress from answered questions is kept.",
      cancelLabel: "Keep learning", confirmLabel: "Quit", danger: true,
    });
    if (ok && root.isConnected) close(null);
  }

  function setFoot(...nodes) {
    foot.className = "lesson-foot";
    footInner.replaceChildren(...nodes);
  }

  function show() {
    current?.destroy?.();
    updateBar();
    if (pos >= queue.length) return end();
    const step = queue[pos];
    let checkBtn = null;
    let done = false;
    const ctx = {
      setReady: (v) => checkBtn && (checkBtn.disabled = !v),
      finish: (res) => !done && ((done = true), feedback(step, res)),
      submit: () => checkBtn && !checkBtn.disabled && checkBtn.click(),
      skip: () => !done && ((done = true), next()),
    };
    current = step.make(ctx);
    body.replaceChildren(current.el);
    body.scrollTop = 0;

    const skipBtn = current.skip ? h("button", { class: "btn ghost", onclick: () => ctx.skip() }, current.skip) : null;
    if (current.mode === "continue") {
      setFoot(h("button", { class: "btn", onclick: () => !done && ((done = true), next()) }, "Continue"));
    } else if (current.mode === "check") {
      checkBtn = h(
        "button",
        {
          class: "btn",
          disabled: true,
          onclick: async () => {
            checkBtn.disabled = true;
            checkBtn.textContent = "Checking…";
            try {
              const res = await current.check();
              ctx.finish(res);
            } catch (e) {
              checkBtn.disabled = false;
              checkBtn.textContent = "Check";
              alert(e.message);
            }
          },
        },
        "Check"
      );
      setFoot(checkBtn);
    } else {
      setFoot(skipBtn || h("div", { class: "muted small center" }, "Finish the exercise to continue"));
    }
  }

  async function feedback(step, res) {
    const extra = step.after ? (await step.after(res).catch(() => null)) || {} : {};
    graded++;
    if (res.ok) { correct++; combo++; } else combo = 0;
    (res.ok ? playCorrect : playWrong)();
    xp += extra.xp || 0;
    if (extra.requeue) queue.push(extra.requeue);
    updateBar();

    foot.className = "lesson-foot " + (res.ok ? "ok" : "bad");
    const cont = h("button", { class: "btn", onclick: next }, "Continue");
    footInner.replaceChildren(
      h(
        "div",
        { class: "feedback" },
        h("div", { class: "fb-ico" }, res.ok ? "✔️" : "✖️"),
        h("div", {}, h("h3", {}, res.title || (res.ok ? "Nice!" : "Not quite")), res.detail ? h("div", { class: "detail" }, res.detail) : null)
      ),
      cont
    );
    cont.focus();
  }

  function next() {
    pos++;
    show();
  }

  function end() {
    playComplete();
    const secs = Math.round((Date.now() - started) / 1000);
    const acc = graded ? Math.round((100 * correct) / graded) : 100;
    const summary = { xp, accuracy: acc, seconds: secs, correct, graded };
    // Study time for "My journey" (servers without this endpoint just ignore it).
    api("/api/activity/time", { method: "POST", body: { seconds: Math.min(secs, 3 * 3600) } }).catch(() => {});
    const finishBtn = h("button", { class: "btn", onclick: () => close(summary) }, "Continue");
    const mood = acc >= 90 ? "bloom" : acc >= 60 ? "grow" : "sprout";
    const statCard = (cls, icon, value, label) =>
      h("div", { class: `end-stat ${cls}` }, h("span", { class: "end-ico", html: icon }), h("b", {}, value), h("small", {}, label));
    body.replaceChildren(
      h(
        "div",
        { class: "end" },
        h("div", { class: `end-garden ${mood}`, html: gardenArt(mood) }),
        h("h1", {}, endTitle),
        h("p", { class: "end-msg" }, END_MSG[mood]),
        h(
          "div",
          { class: "end-stats" },
          statCard("xp", ICONS.drop, `+${xp}`, "XP"),
          statCard("acc", ICONS.leaf, `${acc}%`, "Accuracy"),
          statCard("time", ICONS.clock, `${Math.floor(secs / 60)}:${String(secs % 60).padStart(2, "0")}`, "Time")
        )
      )
    );
    setFoot(finishBtn);
    bar.style.width = "100%";
    if (onDone) Promise.resolve().then(() => onDone(summary)).catch((e) => console.warn(e));
  }

  show();
  return finished;
}
