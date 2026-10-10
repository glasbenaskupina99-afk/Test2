// Duolingo-style lesson runner: progress bar, exercise, check/continue footer, end screen.
import { h } from "./util.js";
import { stopSpeaking } from "./audio.js";

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

  function quit() {
    if (pos === 0 || confirm("Quit this lesson? Progress from answered questions is kept.")) close(null);
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
    const secs = Math.round((Date.now() - started) / 1000);
    const acc = graded ? Math.round((100 * correct) / graded) : 100;
    const summary = { xp, accuracy: acc, seconds: secs, correct, graded };
    const finishBtn = h("button", { class: "btn", onclick: () => close(summary) }, "Continue");
    body.replaceChildren(
      h(
        "div",
        { class: "end" },
        h("div", { class: "trophy" }, acc >= 90 ? "🏆" : acc >= 60 ? "🎉" : "💪"),
        h("h1", {}, endTitle),
        h(
          "div",
          { class: "end-stats" },
          h("div", { class: "end-stat", style: { "--c": "var(--yellow)" } }, h("div", { class: "lbl" }, "Total XP"), h("div", { class: "val" }, `⚡${xp}`)),
          h("div", { class: "end-stat", style: { "--c": "var(--green)" } }, h("div", { class: "lbl" }, "Accuracy"), h("div", { class: "val" }, `🎯${acc}%`)),
          h("div", { class: "end-stat", style: { "--c": "var(--blue)" } }, h("div", { class: "lbl" }, "Time"), h("div", { class: "val" }, `⏱${Math.floor(secs / 60)}:${String(secs % 60).padStart(2, "0")}`))
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
