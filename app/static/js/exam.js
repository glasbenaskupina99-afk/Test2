// Mock exams (HSK / JLPT): the real exam's sections, question counts, time limits and pass marks,
// with questions from the level's words, example sentences and grammar. Ends with a score and an
// honest "would you pass?" — and a link to practise what went wrong.
import { api, h, confirmDialog, toast } from "./util.js";
import { isJa } from "./state.js";
import { speak, stopSpeaking } from "./audio.js";

const mmss = (s) => `${Math.floor(s / 60)}:${String(Math.max(0, s % 60)).padStart(2, "0")}`;
const LISTEN = new Set(["listen_word_tf", "listen_word", "listen_sent"]);
const KICKER = {
  listen_word_tf: "Listen — does it match?",
  listen_word: "Listen and choose the meaning",
  listen_sent: "Listen and choose the meaning",
  read_word_tf: "Does it match?",
  read_word: "Choose the meaning",
  read_sent: "Choose the meaning",
  cloze_word: "Fill the gap",
  cloze_grammar: "Fill the gap",
  kanji_reading: "How is it read?",
  orthography: "How is it written?",
  pinyin_char: "Which characters fit?",
};

const sayQ = (q) => speak(isJa() && q.reading ? q.reading : q.audio);

/** #/exams: the mock exams of this course with your best results. */
export async function examsScreen(shell, loading) {
  shell(loading(), "#/");
  const d = await api("/api/exams");
  const card = (e) =>
    h(
      "div",
      { class: "card exam-card" },
      h("div", { class: "row" }, h("h3", {}, e.name), h("span", { class: "spacer" }), e.best ? h("span", { class: `exam-best ${e.best.passed ? "pass" : ""}` }, `Best ${e.best.total} / ${e.best.max}`) : null),
      h("p", { class: "small muted", style: { margin: "4px 0 10px" } }, e.sections.map((x) => [h("span", {}, x), " · "]), h("span", {}, `${e.minutes} min · pass mark ${e.pass} / ${e.total}`)),
      h("div", { class: "exam-known small" }, h("span", {}, `You know ${e.learned} of ${e.words} words of this level`), h("span", { class: "ek-bar" }, h("i", { style: { width: `${Math.round((100 * e.learned) / Math.max(e.words, 1))}%` } }))),
      h(
        "div",
        { class: "row", style: { marginTop: "12px", gap: "8px" } },
        h("button", { class: "btn small", onclick: () => runExam(e.level, false) }, `Full mock · ${e.minutes} min`),
        h("button", { class: "btn ghost small", onclick: () => runExam(e.level, true) }, `Short · ${Math.round(e.minutes / 3)} min`)
      )
    );
  shell(
    [
      h("div", { class: "topbar" }, h("button", { class: "icon-btn", "aria-label": "Back", onclick: () => history.back() }, "←"), h("h2", {}, "Mock exams"), h("span", { class: "spacer" })),
      h("p", { class: "muted small", style: { margin: "0 0 12px" } }, "Same sections, number of questions, time limits and pass marks as the real exam — with questions from the level's words and grammar. At the end you'll see whether you would pass."),
      d.exams.length ? d.exams.map(card) : h("p", { class: "muted" }, "No mock exams for this course yet."),
      d.history.length
        ? [
            h("div", { class: "home-label" }, "Your results"),
            h("div", { class: "card exam-history" }, d.history.map((x) => h("div", { class: "eh-row" }, h("b", {}, x.level), h("span", { class: "muted small" }, `${x.at.slice(0, 10)}${x.short ? " · short" : ""}`), h("span", { class: "spacer" }), h("span", { class: x.passed ? "eh-pass" : "eh-fail" }, `${x.total} / ${x.max} ${x.passed ? "✓" : ""}`)))),
          ]
        : null,
    ],
    "#/"
  );
}

/** The exam itself, section by section, with a countdown for each section. */
export async function runExam(level, short) {
  let paper;
  try {
    paper = await api(`/api/exams/paper?level=${encodeURIComponent(level)}${short ? "&short=1" : ""}`);
  } catch (e) {
    toast(e.message, 4000);
    return;
  }
  const answers = paper.sections.map((s) => s.questions.map(() => null));
  let si = 0;
  let qi = 0;
  let timer = null;
  let left = 0;
  let plays = 0;
  const body = h("div", { class: "lesson-body exam-body" });
  const clock = h("b", { class: "exam-clock" }, "");
  const head = h("div", { class: "exam-head" });
  const foot = h("div", { class: "lesson-foot" });
  const root = h("div", { class: "lesson exam" }, h("div", { class: "lesson-top" }, h("button", { class: "icon-btn", "aria-label": "Quit", onclick: quit }, "✕"), head, clock), body, foot);
  document.body.append(root);
  document.body.style.overflow = "hidden";

  function close() {
    clearInterval(timer);
    stopSpeaking();
    root.remove();
    document.body.style.overflow = "";
  }
  async function quit() {
    if (await confirmDialog({ icon: "📝", title: "Leave the mock exam?", message: "Your answers so far won't be scored.", cancelLabel: "Keep going", confirmLabel: "Leave", danger: true })) close();
  }

  function sectionIntro() {
    clearInterval(timer);
    const s = paper.sections[si];
    head.replaceChildren(h("span", {}, paper.name));
    clock.textContent = "";
    body.replaceChildren(
      h(
        "div",
        { class: "exam-intro" },
        h("div", { class: "ex-kicker" }, `Part ${si + 1} of ${paper.sections.length}`),
        h("h2", {}, s.title),
        h("p", { class: "muted" }, `${s.questions.length} questions · ${s.minutes} minutes`),
        s.questions.some((q) => LISTEN.has(q.type)) ? h("p", { class: "small" }, "🎧 Each recording plays automatically; you can play it once more.") : null,
        h("p", { class: "small muted" }, "When the time is up, this part ends and the next one starts.")
      )
    );
    foot.replaceChildren(h("div", { class: "inner" }, h("button", { class: "btn", onclick: startSection }, "Start")));
  }

  function startSection() {
    qi = 0;
    left = paper.sections[si].minutes * 60;
    clock.textContent = mmss(left);
    timer = setInterval(() => {
      left--;
      clock.textContent = mmss(left);
      clock.classList.toggle("low", left <= 60);
      if (left <= 0) {
        toast("Time is up for this part");
        endSection();
      }
    }, 1000);
    showQ();
  }

  function showQ() {
    const s = paper.sections[si];
    const q = s.questions[qi];
    plays = 0;
    head.replaceChildren(h("span", {}, s.title), h("small", {}, `${qi + 1} / ${s.questions.length}`));
    const opts = q.options.map((o, i) =>
      h("button", {
        class: "choice text exam-opt" + (answers[si][qi] === i ? " selected" : ""),
        onclick: (e) => {
          answers[si][qi] = i;
          e.currentTarget.parentElement.querySelectorAll(".exam-opt").forEach((b, k) => b.classList.toggle("selected", k === i));
          dots.children[qi].classList.add("on");
        },
      }, h("span", { class: q.type === "kanji_reading" || q.type === "orthography" || q.type.startsWith("cloze") || q.type === "pinyin_char" ? "txt hz" : "txt" }, q.type.endsWith("_tf") ? (i === 0 ? "✓ True" : "✗ False") : o))
    );
    const play = LISTEN.has(q.type)
      ? h("button", { class: "speaker exam-play", "aria-label": "Play again", onclick: (e) => { if (plays >= 2) return; plays++; sayQ(q); if (plays >= 2) e.currentTarget.disabled = true; } }, "🔊")
      : null;
    const dots = h("div", { class: "exam-dots" }, s.questions.map((_, k) => h("button", { class: (answers[si][k] != null ? "on" : "") + (k === qi ? " cur" : ""), "aria-label": `Question ${k + 1}`, onclick: () => { qi = k; showQ(); } })));
    body.replaceChildren(
      h("div", { class: "ex-kicker" }, KICKER[q.type] || ""),
      h(
        "div",
        { class: "exam-prompt" },
        play,
        q.text ? h("div", { class: "exam-text hz" }, q.text) : null,
        q.type.endsWith("_tf") ? h("div", { class: "exam-tf" }, `“${q.prompt}”`) : null,
        q.type === "orthography" && q.hint ? h("div", { class: "small muted" }, q.hint) : null
      ),
      h("div", { class: "choices exam-choices" + (q.options.length > 3 || q.type.endsWith("_tf") ? "" : " one-col") }, opts),
      dots
    );
    if (play) setTimeout(() => { plays = 1; sayQ(q); }, 350);
    const last = qi === s.questions.length - 1;
    foot.replaceChildren(
      h(
        "div",
        { class: "inner" },
        h(
          "div",
          { class: "foot-row" },
          h("button", { class: "btn ghost", disabled: qi === 0, onclick: () => { qi--; showQ(); } }, "Back"),
          h("button", { class: "btn", onclick: () => (last ? confirmEnd() : (qi++, showQ())) }, last ? "Finish part" : "Next")
        )
      )
    );
  }

  async function confirmEnd() {
    const open = answers[si].filter((a) => a == null).length;
    if (open && !(await confirmDialog({ icon: "📝", title: `${open} question${open === 1 ? "" : "s"} unanswered`, message: "Finish this part anyway?", cancelLabel: "Go back", confirmLabel: "Finish part" }))) return;
    endSection();
  }

  function endSection() {
    clearInterval(timer);
    stopSpeaking();
    si++;
    if (si < paper.sections.length) sectionIntro();
    else results();
  }

  async function results() {
    head.replaceChildren(h("span", {}, paper.name));
    clock.textContent = "";
    body.replaceChildren(h("div", { class: "spinner" }));
    foot.replaceChildren();
    let r;
    try {
      r = await api("/api/exams/result", { method: "POST", body: { paper, answers } });
    } catch (e) {
      toast(e.message, 4000);
      return close();
    }
    const toGo = Math.max(0, r.pass - r.total);
    const wrong = [];
    paper.sections.forEach((s, a) => s.questions.forEach((q, b) => answers[a][b] !== q.answer && wrong.push(q)));
    body.replaceChildren(
      h(
        "div",
        { class: `exam-result ${r.passed ? "pass" : "fail"}` },
        h("div", { class: "er-icon" }, r.passed ? "🌸" : "🌱"),
        h("h2", {}, r.passed ? "You would pass!" : "Not yet"),
        h("div", { class: "er-total" }, h("b", {}, r.total), h("span", {}, ` / ${r.max}`)),
        h("p", { class: "muted" }, r.passed ? `Pass mark ${r.pass}. Well done — keep it up until the real exam.` : toGo ? `Pass mark ${r.pass}: ${toGo} more points to go.` : "Enough points, but one part is below its minimum score.")
      ),
      h(
        "div",
        { class: "card er-parts" },
        r.parts.map((p) =>
          h(
            "div",
            { class: "er-part" + (p.min != null && p.score < p.min ? " low" : "") },
            h("div", { class: "row" }, h("b", {}, p.title), h("span", { class: "spacer" }), h("span", {}, `${p.score} / ${p.max}`)),
            h("div", { class: "er-bar" }, h("i", { style: { width: `${Math.round((100 * p.score) / p.max)}%` } }), p.min != null ? h("em", { style: { left: `${(100 * p.min) / p.max}%` }, title: `minimum ${p.min}` }) : null),
            p.min != null ? h("div", { class: "small muted" }, `Minimum for this part: ${p.min}`) : null
          )
        )
      ),
      wrong.length
        ? h(
            "details",
            { class: "card er-wrong" },
            h("summary", {}, `Review ${wrong.length} mistake${wrong.length === 1 ? "" : "s"}`),
            wrong.slice(0, 40).map((q) => h("div", { class: "erw hz" }, q.solution))
          )
        : null,
      h("p", { class: "small muted center" }, short ? "This was a short mock (about a third of the real exam)." : "A practice test from the app's own material — a good guide, not an official result.")
    );
    foot.replaceChildren(
      h(
        "div",
        { class: "inner" },
        h("div", { class: "foot-row" }, h("button", { class: "btn ghost", onclick: () => { close(); location.hash = "#/weak"; } }, "Weak spots"), h("button", { class: "btn", onclick: () => { close(); location.hash = "#/exams"; } }, "Done"))
      )
    );
  }

  sectionIntro();
}
