// Your garden (2.1; the forest of 1.10): every learned word grows as a real plant in the bed of
// its topic. Plants whose reviews are overdue wilt, long-forgotten ones disappear, and practising
// brings them back. The season follows how regularly you practise; weekly challenges plant
// flowering trees in your glade; friends can visit and water your garden.
import { api, h } from "./util.js";
import { speak } from "./audio.js";
import { PLANT_DEFS, plantFor, plantSvg, speciesOf, hashOf } from "./plants.js";
import { friendsPanel } from "./friends.js";

const SEASON = {
  spring: { icon: "🌸", name: "Spring", line: "Fresh leaves and blossom" },
  summer: { icon: "☀️", name: "Summer", line: "Your garden is in full bloom" },
  autumn: { icon: "🍂", name: "Autumn", line: "The leaves are turning" },
  winter: { icon: "❄️", name: "Winter", line: "Your garden is resting" },
};
const NEXT_SEASON = { winter: "autumn", autumn: "spring", spring: "summer" };

// Tree drawings (viewBox 0 0 40 48): a leafy tree and a conifer; the crown takes the season's colour.
const DEFS = `<defs>
  <g id="tr-leafy"><path class="trunk" style="fill:var(--t-trunk)" d="M18 46 L19 30 L21 30 L22 46 Z"/><path class="crown" style="fill:var(--t-crown)" d="M20 4c8 0 13 6 13 13 0 3-1 5-3 7 1 2 1 3 1 5 0 5-5 8-11 8s-11-3-11-8c0-2 0-3 1-5-2-2-3-4-3-7C7 10 12 4 20 4z"/><circle class="bloom" style="fill:var(--t-bloom)" cx="14" cy="16" r="2.2"/><circle class="bloom" style="fill:var(--t-bloom)" cx="25" cy="12" r="2"/><circle class="bloom" style="fill:var(--t-bloom)" cx="26" cy="26" r="2.2"/><path class="snow" style="fill:var(--t-snow)" d="M9 14c3-6 8-9 11-9s9 3 12 9c-3-2-7-3-12-3S12 12 9 14z"/></g>
  <g id="tr-conifer"><path class="trunk" style="fill:var(--t-trunk)" d="M18 46 L19 36 L21 36 L22 46 Z"/><path class="crown" style="fill:var(--t-crown)" d="M20 3 L30 18 L25 18 L33 29 L27 29 L35 39 L5 39 L13 29 L7 29 L15 18 L10 18 Z"/><circle class="bloom" style="fill:var(--t-bloom)" cx="16" cy="27" r="1.8"/><circle class="bloom" style="fill:var(--t-bloom)" cx="25" cy="33" r="1.8"/><path class="snow" style="fill:var(--t-snow)" d="M20 3 L26 12 L20 10 L14 12 Z M13 29 L20 26 L27 29 L20 28 Z"/></g>
  <g id="tr-flower"><path class="trunk" style="fill:var(--t-trunk)" d="M18 46 L19 28 L21 28 L22 46 Z"/><path class="crown" style="fill:var(--t-crown)" d="M20 3c9 0 15 6 15 14 0 7-6 13-15 13S5 24 5 17C5 9 11 3 20 3z"/><circle class="petal" style="fill:var(--t-petal)" cx="12" cy="13" r="3"/><circle class="petal" style="fill:var(--t-petal)" cx="22" cy="9" r="3"/><circle class="petal" style="fill:var(--t-petal)" cx="29" cy="17" r="3"/><circle class="petal" style="fill:var(--t-petal)" cx="16" cy="22" r="3"/><circle class="petal" style="fill:var(--t-petal)" cx="25" cy="24" r="3"/></g>
</defs>`;

const fill = (t, n) => t.replace("{0}", n);

const HEALTH_LABEL = {
  healthy: ["🌿 ", "Healthy — nothing to do"],
  thirsty: ["💧 ", "Thirsty — due for a review"],
  wilting: ["🥀 ", "Wilting — practise it to bring it back"],
  gone: ["🍂 ", "Gone — forgotten for a long time. Practise it to replant it"],
};

/** The sheet for one plant: what it is, which word it stands for, and watering it. */
function plantSheet(p, onWater) {
  const sp = speciesOf(p.plant);
  const bg = h("div", { class: "sheet-bg", onclick: (e) => e.target === bg && bg.remove() });
  bg.append(
    h(
      "div",
      { class: "sheet forest-sheet" },
      h("div", { class: `ps-art ${p.health}`, html: plantSvg(sp.key, 84) }),
      h("div", { class: "ps-name" }, sp.name),
      h("div", { class: "ps-latin" }, sp.latin),
      h("div", { class: "fs-word hz" }, p.t),
      p.r && p.r !== p.t ? h("div", { class: "py center" }, p.r) : null,
      h("div", { class: "center fs-meaning" }, p.m),
      h("p", { class: `center fs-state ${p.health}` }, HEALTH_LABEL[p.health].map((x) => h("span", {}, x))),
      h(
        "div",
        { class: "row", style: { justifyContent: "center", gap: "10px", marginTop: "8px" } },
        h("button", { class: "btn ghost small", onclick: () => speak(p.t) }, h("span", {}, "🔊 "), h("span", {}, "Listen")),
        h("button", { class: "btn small", onclick: () => { bg.remove(); onWater([p.id]); } }, p.health === "healthy" ? "Practise anyway" : p.health === "gone" ? [h("span", {}, "🌱 "), h("span", {}, "Replant")] : [h("span", {}, "💧 "), h("span", {}, "Water this plant")])
      )
    )
  );
  document.body.append(bg);
}

/** A little name tag over a plant you tap; tap the tag for the whole story. */
function nameTag(wrap: HTMLElement, x: number, y: number, p, open?: () => void) {
  wrap.querySelector(".plant-tag")?.remove();
  const tag = h("button", { class: "plant-tag", style: { left: `${x}px`, top: `${y}px` }, onclick: (e) => { e.stopPropagation(); tag.remove(); open?.(); } }, h("b", {}, speciesOf(p.plant).name), p.t ? h("span", { class: "hz" }, ` · ${p.t}`) : null, p.m ? h("small", {}, ` ${p.m}`) : null);
  // Never wider than the garden (a long meaning wraps onto a second line), and always inside it:
  // the tag is centred on the plant when there's room, else pushed in from the edge, with its
  // little arrow still pointing at the plant.
  const room = wrap.clientWidth - 12;
  tag.style.maxWidth = `${room}px`;
  wrap.append(tag);
  if (tag.scrollWidth > room) tag.classList.add("wrap");
  const half = Math.min(tag.offsetWidth, room) / 2;
  const left = Math.min(Math.max(x, half + 6), wrap.clientWidth - half - 6);
  tag.style.left = `${left}px`;
  tag.style.setProperty("--ax", `${Math.max(-half + 14, Math.min(half - 14, x - left))}px`);
  setTimeout(() => tag.remove(), 4000);
}

/** Show the name tag above a tapped plant, inside the garden's box. */
export function tagPlant(garden: HTMLElement, el: Element, p, open?: () => void) {
  const g = garden.getBoundingClientRect();
  const r = el.getBoundingClientRect();
  nameTag(garden, r.left - g.left + r.width / 2, r.top - g.top - 6, p, open);
}

const COLS = 7; // spots in a row of a bed
const EAGER = 4; // beds drawn straight away; the others when they come near the screen
const SPOT_W = 48;
const SPOT_H = 40;
const SIZE_K = [0.62, 0.78, 0.92, 1.05];
// Things between the beds, so the garden looks like a garden.
const DECOR = [
  `<g transform="translate(300 6)"><rect x="0" y="10" width="34" height="4" rx="1" fill="#8a6446"/><rect x="2" y="4" width="30" height="3" rx="1" fill="#9c7454"/><rect x="3" y="14" width="2" height="8" fill="#6e4f37"/><rect x="29" y="14" width="2" height="8" fill="#6e4f37"/></g>`,
  `<g transform="translate(22 4)"><ellipse cx="22" cy="14" rx="22" ry="8" fill="#7fb3d5"/><ellipse cx="16" cy="12" rx="6" ry="2" fill="#a9d0ea"/><circle cx="34" cy="15" r="2.5" fill="#e98fb0"/></g>`,
  `<g transform="translate(310 0)"><rect x="6" y="18" width="8" height="8" fill="#a8a29a"/><path d="M0 18 L10 8 L20 18 Z" fill="#8c867e"/><rect x="7" y="10" width="6" height="6" fill="#f2d27a"/></g>`,
  `<g transform="translate(26 6)"><ellipse cx="8" cy="16" rx="8" ry="5" fill="#9a958c"/><ellipse cx="22" cy="18" rx="6" ry="4" fill="#b0aba1"/><ellipse cx="34" cy="15" rx="5" ry="3.5" fill="#8f8a81"/></g>`,
];

const alive = (p) => p.health && p.health !== "empty" && p.health !== "gone";

/** One bed: soil with a spot for every word of a unit, the learned ones growing. */
function bedEl(bed, i: number, onTap: (p, el: Element) => void, newIds: Set<number>) {
  const rows = Math.ceil(bed.spots.length / COLS);
  const W = COLS * SPOT_W + 16;
  const H = rows * SPOT_H + 40;
  let soil = "";
  let plants = "";
  bed.spots.forEach((p, k) => {
    const r = Math.floor(k / COLS);
    const c = k % COLS;
    const j = hashOf(String(p.id));
    const x = 8 + c * SPOT_W + (r % 2 ? SPOT_W / 2 - 6 : 6) + ((j % 9) - 4);
    const y = 32 + r * SPOT_H + (((j >> 4) % 7) - 3); // room under the bed's sign
    soil += `<ellipse cx="${x + 14}" cy="${y + 36}" rx="${p.health === "empty" ? 7 : 11}" ry="3.2" class="mound ${p.health}"/>`;
    if (!alive(p)) {
      if (p.health === "gone") soil += `<path d="M${x + 9} ${y + 35} q5 -6 10 0" class="gone-mark"/>`;
      return;
    }
    const k2 = SIZE_K[p.size] || SIZE_K[0];
    plants += `<g class="gplant ${p.health}${newIds.has(p.id) ? " new" : ""}" data-k="${k}" transform="translate(${(x + 14 - 20 * k2).toFixed(1)} ${(y + 38 - 46 * k2).toFixed(1)}) scale(${k2})"><rect x="0" y="0" width="40" height="48" fill="transparent"/><use href="#pl-${p.plant}"/></g>`;
  });
  const wrap = h("div", { class: `bed${bed.current && !bed.learned ? " upcoming" : ""}` });
  const svg = h("div", {
    class: "bed-svg",
    html: `<svg viewBox="0 0 ${W} ${H}" width="100%" preserveAspectRatio="xMidYMin meet"><rect x="2" y="12" width="${W - 4}" height="${H - 14}" rx="14" class="soil"/><rect x="2" y="12" width="${W - 4}" height="${H - 14}" rx="14" class="edge"/>${soil}${plants}</svg>`,
  });
  svg.addEventListener("click", (e) => {
    const g = (e.target as Element).closest<SVGGElement>("g.gplant");
    if (g) onTap(bed.spots[Number(g.dataset.k)], g);
  });
  const n = bed.spots.filter(alive).length;
  wrap.append(
    h("div", { class: "bed-path", html: `<svg viewBox="0 0 360 30" width="100%" preserveAspectRatio="xMidYMid meet">${DECOR[i % DECOR.length]}</svg>` }),
    h("div", { class: "bed-sign" }, h("b", {}, bed.name), h("span", {}, `${n} / ${bed.spots.length}`), bed.current ? h("span", { class: "bed-now" }, "you're here") : null),
    svg
  );
  return wrap;
}

/** The whole garden: beds one after another along a path. Also used to visit a friend's garden. */
export function gardenEl(beds, { onTap, newIds = new Set<number>(), season = "summer" }: { onTap: (p, el: Element) => void; newIds?: Set<number>; season?: string }) {
  const wrap = h("div", { class: `garden-beds season-${season}` });
  wrap.insertAdjacentHTML("afterbegin", PLANT_DEFS);
  if (!beds.length) {
    wrap.append(h("div", { class: "card center" }, h("p", {}, "🌱"), h("p", { class: "muted" }, "Learn your first words and every one of them grows here as a plant.")));
    return wrap;
  }
  // Big gardens: the first beds are drawn at once, the rest just before they scroll into view.
  const lazy = typeof IntersectionObserver !== "undefined" && beds.length > EAGER;
  const io = lazy
    ? new IntersectionObserver(
        (entries) => {
          for (const e of entries) {
            if (!e.isIntersecting) continue;
            io.unobserve(e.target);
            const i = Number((e.target as HTMLElement).dataset.bed);
            e.target.replaceWith(bedEl(beds[i], i, onTap, newIds));
          }
        },
        { rootMargin: "800px 0px" }
      )
    : null;
  beds.forEach((b, i) => {
    if (!io || i < EAGER) return wrap.append(bedEl(b, i, onTap, newIds));
    // A placeholder of about the bed's height, so the page doesn't jump.
    const rows = Math.ceil(b.spots.length / COLS);
    const ph = h("div", { class: "bed-placeholder", "data-bed": String(i), style: { aspectRatio: `${COLS * SPOT_W + 16} / ${rows * SPOT_H + 40 + 40}` } });
    wrap.append(ph);
    io.observe(ph);
  });
  return wrap;
}

/** Plants that weren't there on your last visit pop up with a little animation. */
function newSinceLastVisit(beds, lang: string): Set<number> {
  const key = `gardenSeen:${lang}`; // one list per course
  let seen: number[] = [];
  try {
    seen = JSON.parse(localStorage.getItem(key) || "[]");
  } catch {}
  const now = beds.flatMap((b) => b.spots.filter(alive).map((p) => p.id));
  try {
    localStorage.setItem(key, JSON.stringify(now));
  } catch {}
  if (!seen.length) return new Set();
  const before = new Set(seen);
  const fresh = now.filter((id) => !before.has(id));
  return fresh.length > 40 ? new Set() : new Set(fresh); // a big jump (e.g. a placement test): no fireworks
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
      h("div", { class: "sb-title" }, h("span", {}, `${info.icon} `), h("span", {}, `${info.name} in your garden`)),
      h("div", { class: "sb-line" }, h("span", {}, info.line), " · ", h("span", {}, `You practised on ${s.days} of the last 14 days.`)),
      next
        ? h("div", { class: "sb-next" }, h("span", {}, `Practise on ${s.next} more day${s.next === 1 ? "" : "s"} to reach ${SEASON[next].name.toLowerCase()}`), h("span", {}, ` ${SEASON[next].icon}`))
        : h("div", { class: "sb-next" }, h("span", {}, "Keep it up to stay in summer"), h("span", {}, " ☀️"))
    )
  );
}

let tab = "mine";

/** #/forest — your garden, and your friends' gardens. */
export async function forestScreen(shell, loading, { water }) {
  shell(loading(), "#/");
  const d = await api("/api/forest");
  const onWater = (ids) => water(ids);
  for (const b of d.beds) for (const p of b.spots) if (p.t) p.plant = plantFor(d.lang, p.t).key;
  const all = d.beds.flatMap((b) => b.spots);
  const ids = (health: string) => all.filter((p) => p.health === health).map((p) => p.id);
  const urgent = [...ids("wilting"), ...ids("gone")];
  const living = all.filter((p) => ["healthy", "thirsty", "wilting"].includes(p.health)).length;
  const thirsty = ids("thirsty");

  const glade = d.glade.slice(-14);
  const gladeSvg = glade.length
    ? h("div", {
        class: "glade-svg",
        html: `<svg viewBox="0 0 ${Math.max(glade.length, 4) * 34} 50" width="100%" preserveAspectRatio="xMinYMid meet">${glade.map((g, i) => `<g class="tree flower" transform="translate(${i * 34} 2)"><title>${g.week}</title><use href="#tr-flower"/></g>`).join("")}</svg>`,
      })
    : h("p", { class: "muted small" }, "Finish a weekly challenge to plant your first flowering tree here.");

  const body = h("div");
  const tabs = h(
    "div",
    { class: "filter-row garden-tabs" },
    h("button", { class: tab === "mine" ? "on" : "", onclick: () => { tab = "mine"; show(); } }, "🌱 My garden"),
    h("button", { class: tab === "friends" ? "on" : "", onclick: () => { tab = "friends"; show(); } }, "👥 Friends")
  );

  const mine = () => {
    const garden = gardenEl(d.beds, {
      season: d.season.name,
      newIds: newSinceLastVisit(d.beds, d.lang),
      onTap: (p, el) => tagPlant(garden, el, p, () => plantSheet(p, onWater)),
    });
    return [
      seasonBanner(d.season),
      h(
        "div",
        { class: "forest-counts" },
        h("span", { class: "fc healthy" }, h("b", {}, d.healthy), " healthy"),
        h("span", { class: "fc thirsty" }, h("b", {}, d.thirsty), " thirsty"),
        h("span", { class: "fc wilting" }, h("b", {}, d.wilting), " wilting"),
        d.gone ? h("span", { class: "fc gone" }, h("b", {}, d.gone), " gone") : null
      ),
      urgent.length || thirsty.length
        ? h(
            "button",
            { class: "primary-go water-go", onclick: () => onWater((urgent.length ? urgent : thirsty).slice(0, 15)) },
            h(
              "div",
              {},
              h("div", { class: "pg-title" }, urgent.length ? `Save ${Math.min(urgent.length, 15)} plant${urgent.length === 1 ? "" : "s"}` : `Water ${Math.min(thirsty.length, 15)} thirsty plant${thirsty.length === 1 ? "" : "s"}`),
              h("div", { class: "pg-sub" }, urgent.length ? "Wilting and gone plants come back when you practise their words" : "A short practice keeps them green")
            ),
            h("span", { class: "pg-arrow" }, "💧")
          )
        : null,
      h("div", { class: "home-label" }, `Your garden · ${living} plant${living === 1 ? "" : "s"}`),
      h("p", { class: "muted small", style: { margin: "-4px 0 8px" } }, "Every word you learn grows into a plant in the bed of its topic. Forget it for long and the plant disappears — tap any plant to see what it is."),
      garden,
      challengesCard(d.challenges, d.glade.length),
      h("div", { class: "home-label" }, "Your glade"),
      h("div", { class: `card glade season-${d.season.name}` }, gladeSvg),
    ];
  };

  const show = () => {
    tabs.querySelectorAll("button").forEach((b, i) => b.classList.toggle("on", (i === 0) === (tab === "mine")));
    body.replaceChildren(...(tab === "mine" ? mine() : [friendsPanel({ season: d.season.name })]).filter(Boolean)); // (a null child would show as "null")
  };

  shell(
    [
      h("div", { class: "topbar" }, h("button", { class: "icon-btn", "aria-label": "Back", onclick: () => history.length > 1 ? history.back() : (location.hash = "#/") }, "←"), h("h2", {}, "Your garden"), h("span", { class: "spacer" })),
      h("div", { class: `forest season-${d.season.name}`, html: `<svg width="0" height="0" style="position:absolute">${DEFS}</svg>` }),
      tabs,
      body,
    ],
    "#/"
  );
  show();
  window.scrollTo(0, 0);
}

/** Tells the weekly challenge about a word written (or spelled) without a mistake. */
export function noteWritePerfect(n) {
  api("/api/forest/event", { method: "POST", body: { kind: "write_perfect", n } }).catch(() => {});
}

export { SEASON, fill as fillChallenge };
