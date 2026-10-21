// Character map: every character of the course, linked to the parts it is built from and the
// characters it is part of. Squares are characters (filled = known, outlined = still to learn,
// dashed = a part that is not a course character); lines run only horizontally and vertically.
import { api, h, iconBtn } from "./util.js";
import { isJa } from "./state.js";
import { speak } from "./audio.js";
import { strokeDemo } from "./writer.js";

const S = 64; // square size
const GX = 34; // gap between columns
const GY = 16; // gap between rows

const go = (ch) => (location.hash = `#/map/${encodeURIComponent(ch)}`);

function node(n, { x, y, center = false, delay = 0 }) {
  return h(
    "button",
    {
      class: `cm-node ${n.state}${center ? " center" : ""}`,
      style: { left: `${x}px`, top: `${y}px`, animationDelay: `${delay}ms` },
      onclick: () => (center ? speak(n.ch) : go(n.ch)),
      title: n.meaning,
    },
    h("span", { class: "cm-ch hz" }, n.ch),
    n.meaning ? h("span", { class: "cm-m" }, n.meaning) : null,
    n.state === "known" ? h("span", { class: "cm-tick" }, "✓") : null
  );
}

/** One elbow line from the right side of a to the left side of b, bending at x = bend. */
const elbow = (ax, ay, bx, by, bend) => `M${ax} ${ay}H${bend}V${by}H${bx}`;

/** The neighbourhood of one character: its parts (and their parts) on the left, characters built from it on the right. */
function graph(d) {
  const parents = d.parents;
  const kids = d.children;
  const hasGp = parents.some((p) => p.parents.length);
  const cols = (hasGp ? 1 : 0) + (parents.length ? 1 : 0) + 1 + (kids.length ? 1 : 0);
  let c = 0;
  const xGp = hasGp ? c++ * (S + GX) : null;
  const xP = parents.length ? c++ * (S + GX) : null;
  const xC = c++ * (S + GX);
  const xK = kids.length ? c * (S + GX) : null;
  const W = cols * S + (cols - 1) * GX;

  const row = S + GY;
  const blocks = parents.map((p) => Math.max(1, p.parents.length));
  const hP = parents.length ? blocks.reduce((a, b) => a + b, 0) * row - GY : 0;
  const hK = kids.length ? kids.length * row - GY : 0;
  const H = Math.max(hP, hK, S);
  const yC = (H - S) / 2;

  const nodes = [];
  const lines = [];
  const known = (n) => n.state === "known";
  const cls = (a, b) => (known(a) && known(b) ? "cm-line on" : "cm-line");
  let delay = 0;
  nodes.push(node(d.center, { x: xC, y: yC, center: true }));

  let y = (H - hP) / 2;
  parents.forEach((p, i) => {
    const bh = blocks[i] * row - GY;
    const py = y + (bh - S) / 2;
    nodes.push(node(p, { x: xP, y: py, delay: (delay += 40) }));
    lines.push([elbow(xP + S, py + S / 2, xC, yC + S / 2, xC - GX / 2), cls(p, d.center)]);
    p.parents.forEach((g, k) => {
      const gy = y + k * row;
      nodes.push(node(g, { x: xGp, y: gy, delay: (delay += 40) }));
      lines.push([elbow(xGp + S, gy + S / 2, xP, py + S / 2, xP - GX / 2), cls(g, p)]);
    });
    y += blocks[i] * row;
  });

  y = (H - hK) / 2;
  kids.forEach((k) => {
    nodes.push(node(k, { x: xK, y, delay: (delay += 40) }));
    lines.push([elbow(xC + S, yC + S / 2, xK, y + S / 2, xC + S + GX / 2), cls(d.center, k)]);
    y += row;
  });

  const svgNS = "http://www.w3.org/2000/svg";
  const svg = document.createElementNS(svgNS, "svg");
  svg.setAttribute("class", "cm-lines");
  svg.setAttribute("width", W);
  svg.setAttribute("height", H);
  // Known links last, so they are drawn on top of the dim ones they share a line with.
  for (const [dPath, c2] of lines.sort((a, b) => (a[1] > b[1] ? 1 : -1))) {
    const path = document.createElementNS(svgNS, "path");
    path.setAttribute("d", dPath);
    path.setAttribute("class", c2);
    svg.append(path);
  }
  const inner = h("div", { class: "cm-graph", style: { width: `${W}px`, height: `${H}px` } }, svg, ...nodes);
  const wrap = h("div", { class: "cm-wrap" }, inner);
  // Scale down to fit narrow phones.
  requestAnimationFrame(() => {
    const avail = wrap.clientWidth || window.innerWidth - 32;
    const k = Math.min(1, avail / W);
    inner.style.transform = `scale(${k})`;
    wrap.style.height = `${H * k}px`;
  });
  return wrap;
}

function legend() {
  return h(
    "div",
    { class: "cm-legend small" },
    h("span", {}, h("i", { class: "known" }), "Known"),
    h("span", {}, h("i", { class: "course" }), "To learn"),
    h("span", {}, h("i", { class: "part" }), "Part only")
  );
}

function chips(list, label) {
  if (!list.length) return null;
  return h(
    "div",
    { class: "cm-section" },
    h("div", { class: "cm-label" }, label),
    h("div", { class: "cm-chips" }, list.map((n) => h("button", { class: `cm-chip ${n.state}`, onclick: () => go(n.ch) }, h("b", { class: "hz" }, n.ch), n.meaning ? h("small", {}, n.meaning) : null)))
  );
}

function info(d) {
  const c = d.center;
  const demo = strokeDemo(c.ch, { size: 130 });
  return h(
    "div",
    { class: "card cm-info" },
    h(
      "div",
      { class: "cm-head" },
      demo.el,
      h(
        "div",
        { class: "cm-head-text" },
        h("div", { class: "cm-big-m" }, c.meaning || "—"),
        c.reading ? h("div", { class: "py" }, c.reading) : null,
        h("div", { class: `cm-state ${c.state}` }, c.state === "known" ? [h("span", {}, "✓ "), "Known"] : c.state === "course" ? "In your course · not learned yet" : "A building block (not a course character)"),
        h("div", { class: "row", style: { marginTop: "8px" } }, iconBtn("speaker", "speaker sm", () => speak(c.ch), "Listen"))
      )
    ),
    d.parents.length
      ? h("div", { class: "cm-formula" }, h("span", { class: "hz" }, c.ch), " = ", d.parents.map((p, i) => [i ? " + " : "", h("button", { class: "cm-link hz", onclick: () => go(p.ch) }, p.ch), p.meaning ? h("small", {}, ` ${p.meaning}`) : null]))
      : h("p", { class: "muted small" }, "A basic shape: it isn't built from smaller parts."),
    chips([...d.children, ...d.more], `Part of ${d.children.length + d.more.length} course character${d.children.length + d.more.length === 1 ? "" : "s"}`),
    d.words.length
      ? h(
          "div",
          { class: "cm-section" },
          h("div", { class: "cm-label" }, `In ${d.word_count} word${d.word_count === 1 ? "" : "s"}`),
          h(
            "div",
            { class: "cm-words" },
            d.words.map((w) => h("div", { class: `cm-word${w.learned ? " learned" : ""}` }, h("b", { class: "hz" }, w.hanzi), h("span", { class: "muted small" }, w.pinyin), h("span", { class: "small" }, w.english), w.learned ? h("span", { class: "cm-tick-s" }, "✓") : null))
          )
        )
      : null
  );
}

/** #/map/<char>: one character and its family. */
async function focusView(ch) {
  const d = await api(`/api/charmap?ch=${encodeURIComponent(ch || "")}`);
  if (!d.center) return h("div", { class: "empty" }, h("div", { class: "e" }, "🗺️"), h("h2", {}, "No characters yet"), h("p", { class: "muted" }, "Learn a few words and they appear here."));
  return h(
    "div",
    { class: "cm" },
    h("div", { class: "row cm-top" }, h("a", { class: "btn ghost small", href: "#/map" }, h("span", {}, "▦ "), "All characters"), h("span", { class: "spacer" }), legend()),
    graph(d),
    h("p", { class: "muted small center cm-hint" }, "Tap a square to follow the family"),
    info(d)
  );
}

let mapFilter = "all";

/** #/map: every course character at a glance, coloured by what you know. */
async function overview() {
  const d = await api("/api/charmap/all");
  const grid = h("div", { class: "cm-grid" });
  const draw = () => {
    const list = d.chars.filter((c) => mapFilter === "all" || (mapFilter === "known" ? c.state === "known" : c.state !== "known"));
    const out = [];
    let sec = null;
    for (const c of list) {
      if (c.section !== sec) {
        sec = c.section;
        out.push(h("div", { class: "cm-grid-sec" }, sec));
      }
      out.push(h("button", { class: `cm-cell ${c.state}`, onclick: () => go(c.ch), title: c.meaning }, h("span", { class: "hz" }, c.ch)));
    }
    grid.replaceChildren(...(out.length ? out : [h("p", { class: "muted small" }, "Nothing here yet.")]));
  };
  const tab = (key, label) => h("button", { class: mapFilter === key ? "on" : "", onclick: (e) => { mapFilter = key; e.currentTarget.parentElement.querySelectorAll("button").forEach((b) => b.classList.toggle("on", b === e.currentTarget)); draw(); } }, label);
  const search = h("input", {
    class: "input search",
    placeholder: isJa() ? "Find a kanji…" : "Find a character…",
    enterkeyhint: "go",
    onkeydown: (e) => {
      const ch = [...e.currentTarget.value].find((c) => /[㐀-鿿豈-﫿]/.test(c));
      if (e.key === "Enter" && ch) go(ch);
    },
  });
  draw();
  const pct = d.total ? Math.round((d.known / d.total) * 100) : 0;
  return h(
    "div",
    { class: "cm" },
    h("p", { class: "muted small", style: { margin: "0 0 10px" } }, "Every character is built from smaller parts. Tap one to see what it's made of and where it appears."),
    h("div", { class: "card cm-progress" }, h("div", { class: "row" }, h("b", {}, `${d.known} / ${d.total}`), h("span", { class: "muted small" }, isJa() ? "kanji known" : "characters known"), h("span", { class: "spacer" }), h("b", {}, `${pct}%`)), h("div", { class: "progress" }, h("i", { style: { width: `${pct}%` } }))),
    search,
    h("div", { class: "filter-row" }, tab("all", "All"), tab("known", "Known"), tab("todo", "To learn")),
    legend(),
    grid
  );
}

export async function charMapScreen(shell, loading) {
  shell(loading(), "#/map");
  const ch = decodeURIComponent((location.hash.split("/")[2] || "").trim());
  const view = ch ? await focusView(ch) : await overview();
  shell([h("div", { class: "topbar" }, h("h2", {}, "Character map")), view], "#/map");
  window.scrollTo(0, 0);
}
