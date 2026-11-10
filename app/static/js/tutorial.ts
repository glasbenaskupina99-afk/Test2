// "Bloomko in 5 steps": a short tour on first start (and from Settings / the ? button) — new words,
// reviews, grammar, the garden and forest, the AI tutor — ending with the placement test or
// "I'm a complete beginner", so the placement card doesn't have to ask again.
import { api, h } from "./util.js";
import { isHeritage, isJa } from "./state.js";
import { strokeDemo } from "./writer.js";
import { runPlacement } from "./placement.js";

const SEEN = "tutorialSeen";
export const tutorialSeen = () => {
  try {
    return localStorage.getItem(SEEN) === "1";
  } catch {
    return false;
  }
};
const markSeen = () => {
  try {
    localStorage.setItem(SEEN, "1");
  } catch {}
};

// ------------------------------------------------------------------ the little pictures

function artWords() {
  if (isHeritage()) {
    return h(
      "div",
      { class: "tut-art tut-words-sl" },
      h("div", { class: "tw-word" }, [..."hiša"].map((c, i) => h("span", { style: { animationDelay: `${0.3 + i * 0.25}s` } }, c))),
      h("div", { class: "tw-meta" }, h("span", { class: "tag gender g-ž" }, "ž · feminine"), h("span", { class: "tw-say" }, "🔊 HEE-sha")),
      h("div", { class: "tw-en" }, "house")
    );
  }
  const ch = isJa() ? "休" : "好";
  const demo = strokeDemo(ch, { size: 150 });
  const loop = () => demo.play?.().then?.(() => setTimeout(() => demo.el.isConnected && loop(), 1400));
  setTimeout(loop, 500);
  return h(
    "div",
    { class: "tut-art tut-words" },
    demo.el,
    h(
      "div",
      { class: "tw-hook" },
      h("b", { class: "hz" }, ch),
      " = ",
      isJa() ? [h("span", { class: "hz" }, "人"), " person + ", h("span", { class: "hz" }, "木"), " tree"] : [h("span", { class: "hz" }, "女"), " woman + ", h("span", { class: "hz" }, "子"), " child"]
    )
  );
}

function artReview() {
  const steps = [
    ["1 day", 22],
    ["3 days", 34],
    ["1 week", 50],
    ["3 weeks", 70],
    ["2 months", 92],
  ];
  return h(
    "div",
    { class: "tut-art tut-review" },
    steps.map(([label, w], i) => h("div", { class: "tr-row", style: { animationDelay: `${0.2 + i * 0.35}s` } }, h("span", { class: "tr-bar", style: { width: `${w}%` } }), h("small", {}, label))),
    h("div", { class: "tr-skills" }, h("span", {}, "✍️ write"), h("span", {}, "🗣️ speak"), h("span", {}, "👁️ recall"))
  );
}

function artGrammar() {
  if (isHeritage()) {
    const row = (pre, stem, end, note, i) =>
      h("div", { class: "tg-row", style: { animationDelay: `${0.2 + i * 0.5}s` } }, h("span", { class: "tg-pre" }, pre), h("b", {}, stem, h("span", { class: "g-mark" }, end)), h("small", {}, note));
    return h("div", { class: "tut-art tut-grammar" }, row("", "šol", "a", "school", 0), row("v", "šol", "i", "at school", 1), row("v", "šol", "o", "to school", 2));
  }
  const parts = isJa()
    ? [["私", ""], ["は", "mark"], ["学生", ""], ["です", "mark"]]
    : [["我", ""], ["是", "mark"], ["学生", ""], ["。", ""]];
  return h(
    "div",
    { class: "tut-art tut-grammar" },
    h("div", { class: "tg-sent hz" }, parts.map(([t, m], i) => h("span", { class: m ? "g-mark" : "", style: { animationDelay: `${0.2 + i * 0.3}s` } }, t))),
    h("div", { class: "tg-en" }, "I am a student."),
    h("div", { class: "tg-pattern" }, isJa() ? "A は B です" : "A 是 B")
  );
}

function artGarden() {
  const tree = (x, cls, d) =>
    `<g transform="translate(${x} 0)"><g class="tt ${cls}" style="animation-delay:${d}s"><rect x="-3" y="62" width="6" height="22" rx="2" fill="#7a5640"/><circle cx="0" cy="50" r="22"/><circle cx="-12" cy="58" r="14"/><circle cx="12" cy="58" r="14"/></g></g>`;
  const svg = `<svg viewBox="0 0 260 110" class="tg-svg"><ellipse cx="130" cy="88" rx="125" ry="12" class="tg-ground"/>
    ${tree(40, "", 0.1)}${tree(95, "", 0.3)}${tree(150, "wilt", 0.5)}${tree(210, "", 0.7)}
    <g class="tg-can"><path d="M168 18 l22 -8 l6 14 l-22 8z" fill="#6c8fb0"/><path d="M196 20 l14 -6" stroke="#6c8fb0" stroke-width="4" stroke-linecap="round"/></g>
    <g class="tg-drops"><circle cx="160" cy="34" r="2.5"/><circle cx="154" cy="42" r="2.5"/><circle cx="164" cy="46" r="2.5"/></g></svg>`;
  return h(
    "div",
    { class: "tut-art tut-garden" },
    h("div", { html: svg }),
    h("div", { class: "tgd-row" }, h("span", {}, "🌱 a plant that grows every day"), h("span", {}, "💧 raindrops save your streak"), h("span", {}, "🌳 every word is a tree"))
  );
}

function artAI() {
  const [me, fix, reply] = isHeritage()
    ? ["Jaz hočem kava.", "Rad bi kavo.", "Seveda! Z mlekom?"]
    : isJa()
      ? ["お茶ください。", "お茶をください。", "はい、どうぞ！"]
      : ["我要茶。", "我要一杯茶。", "好的！热的还是冰的？"];
  return h(
    "div",
    { class: "tut-art tut-ai" },
    h("div", { class: "ta-badge" }, "✈️ works offline"),
    h("div", { class: "ta-msg me hz", style: { animationDelay: ".2s" } }, me),
    h("div", { class: "ta-fix hz", style: { animationDelay: ".9s" } }, "✏️ ", fix),
    h("div", { class: "ta-msg ai hz", style: { animationDelay: "1.5s" } }, reply)
  );
}

const STEPS = () => [
  {
    art: artWords,
    title: "1 · New words",
    text: isHeritage()
      ? "Every word comes with its gender, its sound and a picture to remember it by. You spell it, hear it and say it."
      : "Watch the strokes, trace them with your finger, then write the character from memory. A little story helps you remember it.",
  },
  {
    art: artReview,
    title: "2 · Practice at the right time",
    text: "Bloomko knows when you're about to forget a word and brings it back just then — first after a day, then after longer and longer breaks. Tap Practice when words are due.",
  },
  {
    art: artGrammar,
    title: "3 · Grammar, step by step",
    text: isHeritage()
      ? "Short lessons unlock as you learn words. Endings are coloured, so you see how cases change a word — and practise just the endings."
      : "Short lessons unlock as you learn words, with examples made from words you already know.",
  },
  {
    art: artGarden,
    title: "4 · Your garden and forest",
    text: "Each day you learn waters your plant. Every word you learn becomes a tree — skip its reviews and it wilts, practise it and it comes back. Seasons follow how regularly you learn.",
  },
  {
    art: artAI,
    title: "5 · Talk with the AI tutor",
    text: "Order a coffee, ask the way, chat about your day. The tutor runs on your phone, even offline, and gently corrects your mistakes. Download it once in Settings.",
  },
];

/** The tour. `first`: shown on first start; ends with the placement test or "complete beginner". */
export function showTutorial({ first = false, onDone = (_action?: string) => {} }: { first?: boolean; onDone?: (action?: string) => void } = {}) {
  return new Promise(async (resolve) => {
    const steps = STEPS();
    // Where the learner starts: offer the placement test for a level they haven't started.
    const offer = await api("/api/home").then((x) => x.placement).catch(() => null);
    let i = 0;
    const art = h("div", { class: "tut-stage" });
    const title = h("h2", { class: "tut-title" });
    const text = h("p", { class: "tut-text" });
    const dots = h("div", { class: "tut-dots" });
    const foot = h("div", { class: "tut-foot" });
    const card = h("div", { class: "tut-card" }, art, title, text);
    const root = h("div", { class: `tutorial${isHeritage() ? " heritage" : ""}` }, h("div", { class: "tut-top" }, h("span", { class: "tut-brand" }, "How Bloomko works"), h("button", { class: "link-btn", onclick: () => finish() }, "Skip")), card, dots, foot);
    document.body.append(root);
    document.body.style.overflow = "hidden";

    function finish(action?: string) {
      markSeen();
      root.remove();
      document.body.style.overflow = "";
      resolve(action || "done");
      if (action !== "placement") onDone(action || "done");
    }

    const last = () => {
      art.replaceChildren(h("div", { class: "tut-art tut-ready" }, h("div", { class: "tut-ready-ic" }, "🌱")));
      title.textContent = offer ? `Ready to start ${offer.section}?` : "You're ready!";
      text.textContent = offer
        ? `Already know some of its ${offer.total} words? A 2-minute placement test skips them. Completely new? Start from the first word.`
        : "When you feel ready, try a mock exam or look at your weak spots — they're on the home screen.";
      dots.replaceChildren(...steps.map(() => h("i", { class: "on" })), h("i", { class: "on cur" }));
      foot.replaceChildren(
        offer
          ? h(
              "div",
              { class: "tut-choice" },
              h("button", { class: "btn", onclick: () => { finish("placement"); runPlacement(offer.section, onDone); } }, "🧭 Placement test"),
              h("button", { class: "btn ghost", onclick: async () => { await api("/api/placement/apply", { method: "POST", body: { section: offer.section, known: 0 } }); finish("beginner"); } }, "🌱 I'm a complete beginner")
            )
          : h("button", { class: "btn", onclick: () => finish() }, first ? "Start learning" : "Got it")
      );
    };

    const show = () => {
      if (i >= steps.length) return last();
      const s = steps[i];
      card.classList.remove("in");
      void card.offsetWidth;
      card.classList.add("in");
      art.replaceChildren(s.art());
      title.textContent = s.title;
      text.textContent = s.text;
      dots.replaceChildren(...steps.map((_, k) => h("i", { class: (k <= i ? "on" : "") + (k === i ? " cur" : "") })), h("i"));
      foot.replaceChildren(
        h(
          "div",
          { class: "foot-row" },
          i ? h("button", { class: "btn ghost", onclick: () => { i--; show(); } }, "Back") : null,
          h("button", { class: "btn", onclick: () => { i++; show(); } }, "Next")
        )
      );
    };

    // Swipe left / right.
    let x0 = null;
    card.addEventListener("touchstart", (e) => (x0 = e.touches[0].clientX), { passive: true });
    card.addEventListener("touchend", (e) => {
      if (x0 == null) return;
      const dx = e.changedTouches[0].clientX - x0;
      x0 = null;
      if (dx < -50 && i < steps.length) { i++; show(); }
      else if (dx > 50 && i > 0) { i--; show(); }
    });
    show();
  });
}
