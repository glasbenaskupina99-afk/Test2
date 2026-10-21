// Your forest: every learned word is a tree. Trees whose reviews are overdue start to wilt and
// come back when you practise them, so you see at a glance what needs a review. The season
// follows how regularly you practise, and weekly challenges plant flowering trees in your glade.
import { api, h } from "./util.js";
import { speak } from "./audio.js";

const SEASON = {
  spring: { icon: "🌸", name: "Spring", line: "Fresh leaves and blossom" },
  summer: { icon: "☀️", name: "Summer", line: "Your forest is in full leaf" },
  autumn: { icon: "🍂", name: "Autumn", line: "The leaves are turning" },
  winter: { icon: "❄️", name: "Winter", line: "Your forest is resting" },
};
const NEXT_SEASON = { winter: "autumn", autumn: "spring", spring: "summer" };

// Tree drawings (viewBox 0 0 40 48): a leafy tree and a conifer; the crown takes the season's colour.
const DEFS = `<defs>
  <g id="tr-leafy"><path class="trunk" style="fill:var(--t-trunk)" d="M18 46 L19 30 L21 30 L22 46 Z"/><path class="crown" style="fill:var(--t-crown)" d="M20 4c8 0 13 6 13 13 0 3-1 5-3 7 1 2 1 3 1 5 0 5-5 8-11 8s-11-3-11-8c0-2 0-3 1-5-2-2-3-4-3-7C7 10 12 4 20 4z"/><circle class="bloom" style="fill:var(--t-bloom)" cx="14" cy="16" r="2.2"/><circle class="bloom" style="fill:var(--t-bloom)" cx="25" cy="12" r="2"/><circle class="bloom" style="fill:var(--t-bloom)" cx="26" cy="26" r="2.2"/><path class="snow" style="fill:var(--t-snow)" d="M9 14c3-6 8-9 11-9s9 3 12 9c-3-2-7-3-12-3S12 12 9 14z"/></g>
  <g id="tr-conifer"><path class="trunk" style="fill:var(--t-trunk)" d="M18 46 L19 36 L21 36 L22 46 Z"/><path class="crown" style="fill:var(--t-crown)" d="M20 3 L30 18 L25 18 L33 29 L27 29 L35 39 L5 39 L13 29 L7 29 L15 18 L10 18 Z"/><circle class="bloom" style="fill:var(--t-bloom)" cx="16" cy="27" r="1.8"/><circle class="bloom" style="fill:var(--t-bloom)" cx="25" cy="33" r="1.8"/><path class="snow" style="fill:var(--t-snow)" d="M20 3 L26 12 L20 10 L14 12 Z M13 29 L20 26 L27 29 L20 28 Z"/></g>
  <g id="tr-flower"><path class="trunk" style="fill:var(--t-trunk)" d="M18 46 L19 28 L21 28 L22 46 Z"/><path class="crown" style="fill:var(--t-crown)" d="M20 3c9 0 15 6 15 14 0 7-6 13-15 13S5 24 5 17C5 9 11 3 20 3z"/><circle class="petal" style="fill:var(--t-petal)" cx="12" cy="13" r="3"/><circle class="petal" style="fill:var(--t-petal)" cx="22" cy="9" r="3"/><circle class="petal" style="fill:var(--t-petal)" cx="29" cy="17" r="3"/><circle class="petal" style="fill:var(--t-petal)" cx="16" cy="22" r="3"/><circle class="petal" style="fill:var(--t-petal)" cx="25" cy="24" r="3"/></g>
</defs>`;
const SIZE = [0.58, 0.72, 0.86, 1];
const CELL_W = 30;
const CELL_H = 34;

const fill = (t, n) => t.replace("{0}", n);

function treeSheet(t, onWater) {
  const bg = h("div", { class: "sheet-bg", onclick: (e) => e.target === bg && bg.remove() });
  const state = { healthy: ["🌳 ", "Healthy — nothing to do"], thirsty: ["💧 ", "Thirsty — due for a review"], wilting: ["🥀 ", "Wilting — practise it to bring it back"] }[t.health].map((x) => h("span", {}, x));
  bg.append(
    h(
      "div",
      { class: "sheet forest-sheet" },
      h("div", { class: "fs-word hz" }, t.t),
      t.r && t.r !== t.t ? h("div", { class: "py center" }, t.r) : null,
      h("div", { class: "center fs-meaning" }, t.m),
      h("p", { class: `center fs-state ${t.health}` }, state),
      h("div", { class: "row", style: { justifyContent: "center", gap: "10px", marginTop: "8px" } },
        h("button", { class: "btn ghost small", onclick: () => speak(t.t) }, h("span", {}, "🔊 "), h("span", {}, "Listen")),
        h("button", { class: "btn small", onclick: () => { bg.remove(); onWater([t.id]); } }, t.health === "healthy" ? "Practise anyway" : [h("span", {}, "💧 "), h("span", {}, "Water this tree")]))
    )
  );
  document.body.append(bg);
}

/** One grove (a unit of the course): trees in rows, drawn as a single SVG. */
function grove(name, trees, cols, onTap) {
  const rows = Math.ceil(trees.length / cols);
  const w = cols * CELL_W + CELL_W / 2;
  const hgt = rows * CELL_H + 18;
  let body = "";
  trees.forEach((t, i) => {
    const r = Math.floor(i / cols);
    const c = i % cols;
    const x = c * CELL_W + (r % 2 ? CELL_W / 2 : 0);
    const y = r * CELL_H;
    const k = SIZE[t.size] || SIZE[0];
    const kind = t.id % 3 === 0 ? "conifer" : "leafy";
    body += `<g class="tree ${t.health}" data-i="${i}" transform="translate(${x + (CELL_W - 40 * k) / 2 + 2} ${y + (48 - 48 * k)}) scale(${k})"><use href="#tr-${kind}"/></g>`;
  });
  const svg = h("div", { class: "grove-svg", html: `<svg viewBox="0 -4 ${w} ${hgt}" width="100%" preserveAspectRatio="xMinYMin meet">${body}</svg>` });
  svg.addEventListener("click", (e) => {
    const g = e.target.closest("g.tree");
    if (g) onTap(trees[Number(g.dataset.i)]);
  });
  const wilting = trees.filter((t) => t.health === "wilting").length;
  return h(
    "div",
    { class: "grove" },
    h("div", { class: "grove-head" }, h("b", {}, name), h("span", { class: "muted small" }, `${trees.length} tree${trees.length === 1 ? "" : "s"}`), wilting ? h("span", { class: "grove-wilt" }, `🥀 ${wilting}`) : null),
    svg
  );
}

function challengesCard(list, gladeCount) {
  return h(
    "div",
    { class: "card challenges" },
    h("div", { class: "row" }, h("h3", {}, "This week's challenges"), h("span", { class: "spacer" }), h("span", { class: "muted small" }, `${list.filter((c) => c.done).length} / ${list.length}`)),
    list.map((c) =>
      h(
        "div",
        { class: "challenge" + (c.done ? " done" : "") },
        h("span", { class: "ch-ico" }, c.done ? "🌸" : c.icon),
        h(
          "div",
          { class: "ch-body" },
          h("div", { class: "ch-title" }, fill(c.title, c.goal)),
          h("div", { class: "ch-bar" }, h("i", { style: { width: `${Math.round((100 * c.value) / c.goal)}%` } })),
          h("div", { class: "ch-num small muted" }, c.done ? "Done — a flowering tree was planted in your glade" : `${c.value} / ${c.goal}`)
        )
      )
    ),
    h("p", { class: "small muted", style: { margin: "6px 0 0" } }, gladeCount ? `Every finished challenge plants a flowering tree in your glade (${gladeCount} so far).` : "Every finished challenge plants a flowering tree in your glade.")
  );
}

function seasonBanner(s) {
  const info = SEASON[s.name];
  const next = NEXT_SEASON[s.name];
  return h(
    "div",
    { class: `season-banner season-${s.name}` },
    h("div", { class: "sb-sky", html: '<svg viewBox="0 0 360 90" preserveAspectRatio="none"><path class="hill2" d="M0 70 C60 40 120 50 180 60 C240 70 300 40 360 52 V90 H0Z"/><path class="hill1" d="M0 80 C80 62 160 74 240 70 C300 66 330 72 360 70 V90 H0Z"/></svg>' }),
    h(
      "div",
      { class: "sb-text" },
      h("div", { class: "sb-title" }, h("span", {}, `${info.icon} `), h("span", {}, `${info.name} in your forest`)),
      h("div", { class: "sb-line" }, h("span", {}, `${info.line}.`), " ", h("span", {}, `You practised on ${s.days} of the last 14 days.`)),
      next
        ? h("div", { class: "sb-next" }, h("span", {}, `Practise on ${s.next} more day${s.next === 1 ? "" : "s"} to reach ${SEASON[next].name.toLowerCase()}`), h("span", {}, ` ${SEASON[next].icon}`))
        : h("div", { class: "sb-next" }, h("span", {}, "Keep it up to stay in summer"), h("span", {}, " ☀️"))
    )
  );
}

/** #/forest */
export async function forestScreen(shell, loading, { water }) {
  shell(loading(), "#/");
  const d = await api("/api/forest");
  const onWater = (ids) => water(ids);
  const wiltingIds = d.trees.filter((t) => t.health === "wilting").map((t) => t.id);
  const thirstyIds = d.trees.filter((t) => t.health === "thirsty").map((t) => t.id);

  const cols = Math.max(6, Math.floor((Math.min(window.innerWidth, 640) - 48) / CELL_W));
  const groves = [];
  let cur = null;
  for (const t of d.trees) {
    const key = `${t.section} · ${t.unit}`;
    if (!cur || cur.key !== key) groves.push((cur = { key, name: d.trees.some((x) => x.section !== t.section) ? key : t.unit, trees: [] }));
    cur.trees.push(t);
  }

  const glade = d.glade.slice(-14);
  const gladeSvg = glade.length
    ? h("div", {
        class: "glade-svg",
        html: `<svg viewBox="0 0 ${Math.max(glade.length, 4) * 34} 50" width="100%" preserveAspectRatio="xMinYMid meet">${glade.map((g, i) => `<g class="tree flower" transform="translate(${i * 34} 2)"><title>${g.week}</title><use href="#tr-flower"/></g>`).join("")}</svg>`,
      })
    : h("p", { class: "muted small" }, "Finish a weekly challenge to plant your first flowering tree here.");

  const empty = !d.trees.length;
  shell(
    [
      h("div", { class: "topbar" }, h("button", { class: "icon-btn", "aria-label": "Back", onclick: () => history.length > 1 ? history.back() : (location.hash = "#/") }, "←"), h("h2", {}, "Your forest"), h("span", { class: "spacer" })),
      h("div", { class: `forest season-${d.season.name}`, html: `<svg width="0" height="0" style="position:absolute">${DEFS}</svg>` }),
      seasonBanner(d.season),
      h(
        "div",
        { class: "forest-counts" },
        h("span", { class: "fc healthy" }, h("b", {}, d.healthy), " healthy"),
        h("span", { class: "fc thirsty" }, h("b", {}, d.thirsty), " thirsty"),
        h("span", { class: "fc wilting" }, h("b", {}, d.wilting), " wilting")
      ),
      wiltingIds.length || thirstyIds.length
        ? h(
            "button",
            { class: "primary-go water-go", onclick: () => onWater((wiltingIds.length ? wiltingIds : thirstyIds).slice(0, 15)) },
            h("div", {}, h("div", { class: "pg-title" }, wiltingIds.length ? `Water ${Math.min(wiltingIds.length, 15)} wilting tree${wiltingIds.length === 1 ? "" : "s"}` : `Water ${Math.min(thirstyIds.length, 15)} thirsty tree${thirstyIds.length === 1 ? "" : "s"}`), h("div", { class: "pg-sub" }, "A short practice brings them back to life")),
            h("span", { class: "pg-arrow" }, "💧")
          )
        : null,
      challengesCard(d.challenges, d.glade.length),
      h("div", { class: "home-label" }, "Your glade"),
      h("div", { class: `card glade season-${d.season.name}` }, gladeSvg),
      h("div", { class: "home-label" }, empty ? "Your forest" : `${d.trees.length} trees`),
      empty
        ? h("div", { class: "card center" }, h("p", {}, "🌱"), h("p", { class: "muted" }, "Learn your first words and every one of them becomes a tree here."))
        : h("div", { class: `forest-groves season-${d.season.name}` }, groves.map((g) => grove(g.name, g.trees, cols, (t) => treeSheet(t, onWater)))),
      h("p", { class: "muted small center", style: { margin: "18px 0" } }, "Trees wilt when a review is overdue. Practise them and they grow back — the longer you remember a word, the bigger its tree."),
    ],
    "#/"
  );
  window.scrollTo(0, 0);
}

/** Tells the weekly challenge about a word written (or spelled) without a mistake. */
export function noteWritePerfect(n) {
  api("/api/forest/event", { method: "POST", body: { kind: "write_perfect", n } }).catch(() => {});
}

export { SEASON, fill as fillChallenge };
