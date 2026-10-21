// Placement test: when you open a level you haven't started, a short quiz from evenly spaced
// points of the level finds where you stop knowing the words; everything before that counts
// as learned (with first reviews spread out), so you don't have to click through what you know.
import { api, h, toast } from "./util.js";
import { isSl, T } from "./state.js";
import { speak } from "./audio.js";

/** The offer card on the home screen. */
export function placementCard(offer, done) {
  return h(
    "div",
    { class: "card place-card" },
    h("div", { class: "row" }, h("span", { class: "place-ic" }, "🧭"), h("div", {}, h("b", {}, `New to ${offer.section}?`), h("div", { class: "muted small" }, `If you already know some of its ${offer.total} words, a 2-minute test skips them.`))),
    h(
      "div",
      { class: "row", style: { gap: "8px", marginTop: "10px" } },
      h("button", { class: "btn small", onclick: () => runPlacement(offer.section, done) }, "Placement test"),
      h("button", { class: "btn ghost small", onclick: async () => { await api("/api/placement/apply", { method: "POST", body: { section: offer.section, known: 0 } }); done(); } }, "I'm a complete beginner")
    )
  );
}

export async function runPlacement(section, done) {
  let d;
  try {
    d = await api(`/api/placement?section=${encodeURIComponent(section)}`);
  } catch (e) {
    toast(e.message, 4000);
    return;
  }
  const body = h("div", { class: "lesson-body place-body" });
  const foot = h("div", { class: "lesson-foot" });
  const bar = h("i", { style: { width: "0%" } });
  const root = h("div", { class: "lesson place" }, h("div", { class: "lesson-top" }, h("button", { class: "icon-btn", "aria-label": "Close", onclick: close }, "✕"), h("div", { class: "progress" }, bar)), body, foot);
  document.body.append(root);
  document.body.style.overflow = "hidden";
  function close() {
    root.remove();
    document.body.style.overflow = "";
  }

  let b = 0;
  let q = 0;
  let right = 0;
  let fails = 0;
  let known = 0; // words up to the last block you passed
  const total = d.blocks.length;

  function ask() {
    const block = d.blocks[b];
    const x = block.questions[q];
    bar.style.width = `${Math.round((100 * (b * 3 + q)) / (total * 3))}%`;
    const answer = (ok) => {
      if (ok) right++;
      if (++q < block.questions.length) return ask();
      if (right >= Math.min(2, block.questions.length)) known = block.upto;
      else fails++;
      b++;
      q = 0;
      right = 0;
      if (fails >= 2 || b >= total) return result();
      ask();
    };
    body.replaceChildren(
      h("div", { class: "ex-kicker" }, `What does it mean? · ${b + 1} / ${total}`),
      h("div", { class: "place-word" }, h("div", { class: isSl() ? "sl-word-text" : "hz place-hz" }, x.hanzi), isSl() ? null : h("button", { class: "speaker sm", "aria-label": "Listen", onclick: () => speak(x.hanzi) }, "🔊")),
      h("div", { class: "choices one-col" }, x.options.map((o, i) => h("button", { class: "choice text", onclick: () => answer(i === x.answer) }, h("span", { class: "txt" }, o))))
    );
    foot.replaceChildren(h("div", { class: "inner" }, h("button", { class: "btn ghost", onclick: () => answer(false) }, "I don't know")));
  }

  function result() {
    bar.style.width = "100%";
    const pct = Math.round((100 * known) / d.total);
    body.replaceChildren(
      h(
        "div",
        { class: "exam-result pass" },
        h("div", { class: "er-icon" }, known ? "🌳" : "🌱"),
        h("h2", {}, known ? `You know about ${known} words` : "A fresh start"),
        h("p", { class: "muted" }, known ? `That's roughly the first ${pct}% of ${d.section}. They'll count as learned — they come back in reviews over the next weeks, and you continue with word ${known + 1}.` : `You'll start ${d.section} from the first word. Have fun learning ${T.lang()}!`)
      )
    );
    const apply = async (n) => {
      await api("/api/placement/apply", { method: "POST", body: { section: d.section, known: n } });
      close();
      if (n) toast(`${n} words marked as learned`);
      done();
    };
    foot.replaceChildren(
      h(
        "div",
        { class: "inner" },
        known
          ? h("div", { class: "foot-row" }, h("button", { class: "btn ghost", onclick: () => apply(0) }, "Start from the beginning"), h("button", { class: "btn", onclick: () => apply(known) }, `Start at word ${known + 1}`))
          : h("button", { class: "btn", onclick: () => apply(0) }, "Start learning")
      )
    );
  }

  body.replaceChildren(
    h(
      "div",
      { class: "exam-intro" },
      h("div", { class: "ex-kicker" }, "Placement test"),
      h("h2", {}, `How much ${d.section} do you know?`),
      h("p", { class: "muted" }, `Up to ${total * 3} quick questions, from the easiest words of the level to the hardest. It stops by itself when the words get unfamiliar.`),
      h("p", { class: "small muted" }, "Not sure? Tap “I don't know” — guessing only puts you too far ahead.")
    )
  );
  foot.replaceChildren(h("div", { class: "inner" }, h("button", { class: "btn", onclick: ask }, "Start")));
}
