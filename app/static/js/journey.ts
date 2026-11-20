// The journey (3.0) on the home screen: the level as a path of stones through the garden.
// Only the next stone is open; walked stones can be walked again; later ones wait.
import { h, toast } from "./util.js";

export interface JourneyActions {
  /** A stone of new words: learn them (again: practise them). */
  words: (stone: any, again: boolean) => unknown;
  /** A grammar stone: the lesson (again: look it up in the grammar book). */
  grammar: (stone: any, again: boolean) => unknown;
  story: (stone: any) => unknown;
  water: (stone: any) => unknown;
  /** The level is finished: pick the next one. */
  next: () => unknown;
}

const ICON = { words: "🌱", grammar: "📘", story: "📜", water: "💧" };

function label(s) {
  if (s.kind === "words") return { title: "New words", sub: s.words.slice(0, 3).join(", ") + (s.words.length > 3 ? " …" : "") };
  if (s.kind === "grammar") return { title: "Grammar", sub: s.title };
  if (s.kind === "story") return { title: "Story", sub: s.title_en && s.title_en !== s.title ? `${s.title} · ${s.title_en}` : s.title };
  return { title: "Water your garden", sub: `${s.due} words are thirsty` };
}

/** A chapter is named after its units (the first three, if it has more). */
const chapterName = (c) => (c.units.length > 3 ? `${c.units.slice(0, 3).join(" · ")} …` : c.units.join(" · "));

/** Opens a stone: the next one starts, a walked one is walked again, a later one has to wait. */
function openStone(s, state: "done" | "now" | "locked", act: JourneyActions) {
  if (state === "locked") return toast("Walk the stones before this one first");
  const again = state === "done";
  if (s.kind === "words") return act.words(s, again);
  if (s.kind === "grammar") return act.grammar(s, again);
  if (s.kind === "story") return act.story(s);
  return act.water(s);
}

function stoneEl(s, state: "done" | "now" | "locked", act: JourneyActions) {
  const l = label(s);
  return h(
    "button",
    { class: `jr-stone ${s.kind} ${state}`, onclick: () => openStone(s, state, act), "aria-label": `${l.title}: ${l.sub}` },
    h("span", { class: "jr-ic" }, state === "done" ? "✓" : ICON[s.kind]),
    h("span", { class: "jr-txt" }, h("b", {}, l.title), h("small", {}, l.sub))
  );
}

/** The "Continue" button for the next stone, and the path itself. */
export function journeyView(j, act: JourneyActions) {
  const total = j.chapters.length;
  const at = j.complete ? -1 : j.chapters.findIndex((c) => c.stones.some((s) => s.id === j.current));
  const next = j.water || (at >= 0 ? j.chapters[at].stones.find((s) => s.id === j.current) : null);

  let primary;
  if (next) {
    const l = label(next);
    primary = h(
      "button",
      { class: "primary-go jr-go", onclick: () => openStone(next, "now", act) },
      h("div", {}, h("div", { class: "pg-title" }, next.kind === "water" ? "Water your garden" : [h("span", {}, "Continue"), " · ", h("span", {}, l.title)]), h("div", { class: "pg-sub" }, l.sub)),
      h("span", { class: "pg-arrow", html: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12h14M13 6l6 6-6 6"/></svg>' })
    );
  } else {
    primary = h(
      "div",
      { class: "card jr-complete" },
      h("div", { class: "jr-complete-ic" }, "🎉"),
      h("div", {}, h("b", {}, `${j.section} complete`), h("div", { class: "small muted" }, "Every stone of this level is walked. Your words stay in practice.")),
      h("button", { class: "btn small", onclick: () => act.next() }, "Next level")
    );
  }

  const chapterRow = (c, state: "done" | "locked") => {
    const stones = h("div", { class: "jr-stones" });
    stones.hidden = true;
    return h(
      "div",
      { class: `jr-chapter ${state}` },
      h(
        "button",
        {
          class: "jr-row",
          onclick: () => {
            if (!stones.childElementCount) stones.append(...c.stones.map((s) => stoneEl(s, s.done ? "done" : "locked", act)));
            stones.hidden = !stones.hidden;
          },
        },
        h("span", { class: "jr-row-ic" }, state === "done" ? "✓" : "🔒"),
        h("span", { class: "jr-row-txt" }, h("small", {}, `Chapter ${c.n + 1}`), h("b", {}, chapterName(c))),
        h("span", { class: "jr-row-n" }, `${c.stones.filter((s) => s.done).length}/${c.stones.length}`)
      ),
      stones
    );
  };

  const parts = [];
  j.chapters.forEach((c, i) => {
    if (i === at) {
      const doneN = c.stones.filter((s) => s.done).length;
      const list = [];
      for (const s of c.stones) {
        if (s.id === j.current && j.water) list.push(stoneEl(j.water, "now", act));
        list.push(stoneEl(s, s.done ? "done" : s.id === j.current && !j.water ? "now" : "locked", act));
      }
      // A long chapter shows the stones around the next one: the last 2 walked and the next 3.
      const here = list.findIndex((el) => el.classList.contains("now"));
      const from = Math.max(0, here - 2);
      const to = here + 4;
      const hidden = list.filter((_, k) => k < from || k >= to);
      if (here >= 0 && hidden.length > 1) {
        hidden.forEach((el) => (el.hidden = true));
        const more = h("button", { class: "btn ghost small jr-more", onclick: () => { hidden.forEach((el) => (el.hidden = false)); more.remove(); } }, `Show all ${list.length} stones`);
        list.push(more);
      }
      parts.push(
        h(
          "div",
          { class: "card jr-current" },
          h("div", { class: "jr-head" }, h("small", {}, `Chapter ${c.n + 1} of ${total}`), h("h3", {}, chapterName(c)), h("div", { class: "jr-bar" }, h("i", { style: { width: `${Math.round((100 * doneN) / c.stones.length)}%` } })), h("small", { class: "muted" }, `${doneN} of ${c.stones.length} stones`)),
          h("div", { class: "jr-stones" }, list)
        )
      );
    } else parts.push(chapterRow(c, at < 0 || i < at ? "done" : "locked"));
  });
  if (at < 0 && j.water) parts.push(h("div", { class: "jr-stones" }, stoneEl(j.water, "now", act)));

  return { primary, path: h("section", { class: "journey" }, h("div", { class: "home-label" }, `Your path · ${j.section}`), parts) };
}
