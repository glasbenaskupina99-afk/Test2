// Weak-spots map: which groups of characters, tones/readings, cases, topics and skills give you
// the most trouble, as a heat map. Each square opens the group and practises only its words.
import { api, h } from "./util.js";
import { isJa, isSl } from "./state.js";

const LEVELS = [
  [0.15, "w0", "Solid"],
  [0.3, "w1", "Okay"],
  [0.45, "w2", "Shaky"],
  [Infinity, "w3", "Trouble"],
];
const level = (score) => LEVELS.find(([max]) => score < max);

function legend() {
  return h("div", { class: "wk-legend small" }, LEVELS.map(([, cls, name]) => h("span", {}, h("i", { class: cls }), name)));
}

function sheet(g, practise) {
  const [, cls, name] = level(g.score);
  const bg = h(
    "div",
    { class: "sheet-bg", onclick: (e) => e.target === bg && bg.remove() },
    h(
      "div",
      { class: "sheet wk-sheet" },
      h("div", { class: "row" }, g.ch ? h("span", { class: `wk-big hz ${cls}` }, g.ch) : null, h("div", {}, h("h2", { style: { margin: 0 } }, g.label || g.ch), g.sub ? h("div", { class: "muted small" }, g.sub) : null)),
      h("p", { class: "muted" }, h("b", {}, name), " · ", h("span", {}, g.cat === "grammar" ? (g.score >= 0.35 ? "This point has slipped more than once." : "This point has slipped now and then.") : `${g.tricky} of ${g.words} word${g.words === 1 ? "" : "s"} keep slipping.`)),
      g.examples?.length ? h("div", { class: "wk-examples hz" }, g.examples.map((x) => h("span", {}, x))) : null,
      h(
        "div",
        { class: "row", style: { gap: "8px", marginTop: "14px" } },
        h("button", { class: "btn ghost", onclick: () => bg.remove() }, "Close"),
        h("button", { class: "btn", onclick: () => { bg.remove(); practise(g); } }, "Practise only this")
      )
    )
  );
  document.body.append(bg);
}

function tile(g, practise) {
  const [, cls] = level(g.score);
  return h(
    "button",
    { class: `wk-tile ${cls}${g.ch ? " char" : ""}`, onclick: () => sheet(g, practise), title: g.label },
    g.ch ? h("span", { class: "wk-ch hz" }, g.ch) : g.icon ? h("span", { class: "wk-ic" }, g.icon) : null,
    h("span", { class: "wk-label" }, g.ch ? g.label : g.label),
    g.cat === "grammar" ? null : h("span", { class: "wk-n" }, `${g.tricky}/${g.words}`)
  );
}

/** #/weak: the heat map of your weak spots. */
export async function weakScreen(shell, loading, { practise }) {
  shell(loading(), "#/");
  const d = await api("/api/weak");
  const top = h("div", { class: "topbar" }, h("button", { class: "icon-btn", "aria-label": "Back", onclick: () => history.back() }, "←"), h("h2", {}, "Weak spots"), h("span", { class: "spacer" }));
  if (!d.enough) {
    shell(
      [
        top,
        h(
          "div",
          { class: "empty" },
          h("div", { class: "e" }, "🗺️"),
          h("h2", {}, "Not enough practice yet"),
          h("p", { class: "muted" }, `Your weak spots show up after a few reviews — you've reviewed ${d.reviewed} word${d.reviewed === 1 ? "" : "s"} so far. Keep practising and come back in a few days.`),
          h("a", { class: "btn", href: "#/" }, "Back to learning")
        ),
      ],
      "#/"
    );
    return;
  }
  const what = isSl() ? "Which cases, genders, topics or skills" : isJa() ? "Which kanji parts, scripts, grammar points, topics or skills" : "Which character parts, tones, grammar points, topics or skills";
  shell(
    [
      top,
      h("p", { class: "muted small", style: { margin: "0 0 12px" } }, `${what} give you the most trouble — from how often words slip after you've learned them. Tap a square to practise only that group.`),
      d.worst.length
        ? h(
            "div",
            { class: "card wk-worst" },
            h("div", { class: "home-label", style: { margin: "0 0 8px" } }, "Most trouble right now"),
            d.worst.map((g) =>
              h(
                "button",
                { class: "wk-worst-row", onclick: () => practise(g) },
                h("span", { class: `wk-dot ${level(g.score)[1]}` }),
                h("span", { class: g.ch ? "hz wk-wch" : "" }, g.ch || g.icon || ""),
                h("span", { class: "wk-wlabel" }, g.label || g.ch, g.sub && g.cat !== "grammar" ? h("small", { class: "muted" }, ` · ${g.sub}`) : null),
                h("span", { class: "spacer" }),
                h("span", { class: "wk-go" }, "Practise →")
              )
            )
          )
        : h("div", { class: "card wk-worst" }, h("b", {}, "🌿 No real trouble spots"), h("p", { class: "muted small", style: { margin: "4px 0 0" } }, "Nothing keeps slipping at the moment. The map below shows where it's least solid.")),
      legend(),
      d.cats.map((c) => [h("div", { class: "home-label" }, c.title), h("div", { class: `wk-grid ${c.id === "parts" ? "chars" : ""}` }, c.groups.map((g) => tile(g, practise)))]),
    ],
    "#/"
  );
}

/** Practise one weak-spot group: its words (in that skill), or its grammar point. */
export function practiseGroup(flows, g) {
  if (g.gid) return flows.review({ grammarIds: [g.gid], title: "Weak spot practised!" });
  return flows.review({ ids: g.ids, skill: g.skill, title: "Weak spot practised!" });
}
