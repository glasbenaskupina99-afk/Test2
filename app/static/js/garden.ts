// The streak plant: grows while you practise every day, gets thirsty when today's practice
// is missing, and raindrops (streak freezes) water it on days you miss.
import { api, h, confirmDialog } from "./util.js";
import { playForest } from "./sounds.js";

const svg = (markup, cls = "") => {
  const el = document.createElement("span");
  el.className = "art " + cls;
  el.innerHTML = markup;
  return el;
};

/** The plant in three moods: healthy · thirsty (drooping, yellowing) · seed / dry. */
export function plantArt(mood = "healthy", cls = "") {
  return svg(
    `<svg viewBox="0 0 64 64" class="plant ${mood}" aria-hidden="true">
      <ellipse class="soil" cx="32" cy="58" rx="16" ry="4.5"/>
      <path class="stem" d="M32 57 C32 48 31.5 40 32 27" fill="none" stroke-width="3" stroke-linecap="round"/>
      <path class="leaf l1" d="M32 46 C24 47 15 43 11 35 C20 33 28 37 32 46 Z"/>
      <path class="leaf l2" d="M32 39 C40 40 49 35 52 26 C43 25 35 30 32 39 Z"/>
      <path class="leaf l3" d="M32 28 C27 23 27 14 32 7 C37 14 37 23 32 28 Z"/>
    </svg>`,
    cls
  );
}

export const raindropArt = (full = true, cls = "") =>
  svg(`<svg viewBox="0 0 24 24" class="drop ${full ? "drop-full" : "drop-empty"}" aria-hidden="true"><path d="M12 2.5 C12 2.5 5 10.5 5 15 a7 7 0 0 0 14 0 C19 10.5 12 2.5 12 2.5 Z"/><path class="shine" d="M9 15.5 a3.2 3.2 0 0 0 2.2 3.1" fill="none" stroke-width="1.6" stroke-linecap="round"/></svg>`, cls);

/** A leaf for a watered day; dried and curled for a day a raindrop saved. */
export const dayLeafArt = (state, cls = "") =>
  state === "missed"
    ? svg(`<svg viewBox="0 0 24 24" class="dayleaf missed" aria-hidden="true"><circle cx="12" cy="12" r="3"/></svg>`, cls)
    : svg(
        `<svg viewBox="0 0 24 24" class="dayleaf ${state}" aria-hidden="true">${
          state === "saved"
            ? `<path d="M5 19 C4 12 8 6 18 4 C19 8 18 11 15 13 C13 14.5 13 16 15 17 C11 19.5 7.5 19.8 5 19 Z"/><path class="vein" d="M5 19 C9 14 12 11 15 8" fill="none" stroke-width="1.2"/>`
            : `<path d="M4 20 C4 11 9 5 20 4 C20 14 14 20 4 20 Z"/><path class="vein" d="M4 20 C9 15 13 11 17 7" fill="none" stroke-width="1.2"/>`
        }</svg>`,
        cls
      );

const MOOD_TEXT = {
  healthy: "Watered today — it keeps growing. See you tomorrow!",
  thirsty: "Your plant is thirsty. A short lesson today keeps it growing.",
  seed: "Plant a seed: practise today to start a new streak.",
};

/** Bottom sheet with the plant, the last two weeks and your raindrops. */
export async function gardenSheet() {
  // Forest sounds while you look at your plant; they fade out as soon as the sheet closes.
  const stopSound = playForest();
  const g = await api("/api/garden").catch((e) => { stopSound(); throw e; });
  const bg = h("div", { class: "sheet-bg", onclick: (e) => e.target === bg && bg.remove() });
  const fmtDay = (k) => new Date(k + "T12:00:00").toLocaleDateString(document.documentElement.lang || undefined, { weekday: "narrow" });
  const reminder = window.__native?.notifications
    ? h("a", { class: "btn ghost small garden-remind", href: "#/settings", onclick: () => bg.remove() }, "🔔 Daily reminder")
    : null;
  bg.append(
    h(
      "div",
      { class: "sheet garden" },
      h("div", { class: "garden-hero" }, plantArt(g.plant, "garden-plant")),
      h("h2", { class: "center", style: { margin: "4px 0 2px" } }, g.streak ? `${g.streak}-day streak` : "No streak yet"),
      h("p", { class: "muted center", style: { margin: "0 0 14px" } }, MOOD_TEXT[g.plant]),
      h(
        "div",
        { class: "garden-days" },
        g.days.map((d) => h("div", { class: "gday", title: d.day }, dayLeafArt(d.state), h("small", {}, fmtDay(d.day))))
      ),
      h(
        "div",
        { class: "garden-legend small muted" },
        h("span", {}, dayLeafArt("watered"), "practised"),
        h("span", {}, dayLeafArt("saved"), "saved by a raindrop"),
        h("span", {}, dayLeafArt("missed"), "missed")
      ),
      h(
        "div",
        { class: "card garden-drops" },
        h("div", { class: "row" }, h("b", {}, "Raindrops"), h("span", { class: "spacer" }), ...Array.from({ length: g.max_raindrops }, (_, i) => raindropArt(i < g.raindrops))),
        h(
          "p",
          { class: "small muted", style: { margin: "6px 0 0" } },
          "Miss a day and a raindrop waters your plant, so the streak lives on — that day's leaf just dries a little. You earn a raindrop for every 7 days in a row (you can keep 2)."
        )
      ),
      h("div", { class: "row", style: { justifyContent: "space-between", marginTop: "12px" } }, h("span", { class: "muted small" }, `Best streak: ${g.best} days`), reminder),
      h("button", { class: "btn", style: { marginTop: "14px" }, onclick: () => bg.remove() }, "Close")
    )
  );
  document.body.append(bg);
  // The phone's back button closes the sheet (instead of leaving the screen behind it).
  history.pushState({ gardenSheet: true }, "");
  const onBack = () => bg.remove();
  window.addEventListener("popstate", onBack, { once: true });
  const watch = setInterval(() => {
    if (bg.isConnected) return;
    clearInterval(watch);
    stopSound();
    window.removeEventListener("popstate", onBack);
    if (history.state?.gardenSheet) history.back();
  }, 150);
}

/** One-time message after a raindrop was used, earned, or the streak dried out. */
export function gardenNotice(n) {
  if (!n) return;
  const plural = (k, w) => `${k} ${w}${k === 1 ? "" : "s"}`;
  const texts = {
    saved: {
      icon: dayLeafArt("saved", "big"),
      title: "A raindrop saved your streak",
      message: `You missed ${plural(n.days, "day")}, so a leaf dried a little — but a raindrop watered your plant. Your ${n.streak}-day streak lives on. Raindrops left: ${n.raindrops}.`,
      confirmLabel: "Keep growing",
    },
    lost: {
      icon: plantArt("dry", "big"),
      title: "Your plant dried out",
      message: `Your ${n.streak}-day streak has ended. Plant a new seed today — every lesson waters it again.`,
      confirmLabel: "Plant a new seed",
    },
    earned: {
      icon: raindropArt(true, "big"),
      title: "You earned a raindrop!",
      message: `${n.streak} days in a row! If you ever miss a day, this raindrop keeps your plant alive. You have ${plural(n.raindrops, "raindrop")}.`,
      confirmLabel: "Lovely",
    },
  }[n.kind];
  if (texts) confirmDialog({ ...texts, cancelLabel: null });
}
