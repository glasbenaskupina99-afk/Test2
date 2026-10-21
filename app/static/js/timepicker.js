// Time picker in the app's style: a clock face whose hand is a leaf.
// Pick the hour (outer ring 1–12, inner ring 13–00), then the minutes (5-minute steps).
import { h } from "./util.js";

const NS = "http://www.w3.org/2000/svg";
const svgEl = (tag, attrs = {}) => {
  const el = document.createElementNS(NS, tag);
  for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, v);
  return el;
};
const pad = (n) => String(n).padStart(2, "0");
const C = 130; // centre of the 260×260 dial
const OUTER = 100;
const INNER = 64;

/** Opens the picker; resolves with "HH:MM" or null if cancelled. */
export function pickTime(value = "19:00", title = "Reminder time") {
  return new Promise((resolve) => {
    let [hh, mm] = String(value).split(":").map(Number);
    if (!(hh >= 0 && hh < 24)) hh = 19;
    mm = Math.round((mm >= 0 && mm < 60 ? mm : 0) / 5) * 5 % 60;
    let mode = "hour";

    const hEl = h("button", { type: "button", class: "tp-seg", onclick: () => setMode("hour") });
    const mEl = h("button", { type: "button", class: "tp-seg", onclick: () => setMode("minute") });
    const svg = svgEl("svg", { viewBox: "0 0 260 260", class: "tp-dial" });
    const hint = h("p", { class: "tp-hint" });

    const done = (v) => { bg.remove(); resolve(v); };
    const bg = h(
      "div",
      { class: "sheet-bg", onclick: (e) => e.target === bg && done(null) },
      h(
        "div",
        { class: "sheet tp-sheet" },
        h("h3", { class: "select-title" }, title),
        h("div", { class: "tp-display" }, hEl, h("span", { class: "tp-colon" }, ":"), mEl),
        svg,
        hint,
        h(
          "div",
          { class: "tp-actions" },
          h("button", { type: "button", class: "btn ghost", onclick: () => done(null) }, "Cancel"),
          h("button", { type: "button", class: "btn", onclick: () => done(`${pad(hh)}:${pad(mm)}`) }, "Set")
        )
      )
    );

    // Position of a value on the dial.
    const spot = (v) => {
      if (mode === "minute") return { a: (v / 60) * 360, r: OUTER };
      const outer = v >= 1 && v <= 12;
      return { a: ((v % 12) / 12) * 360, r: outer ? OUTER : INNER };
    };
    const xy = (a, r) => [C + r * Math.sin((a * Math.PI) / 180), C - r * Math.cos((a * Math.PI) / 180)];

    function render() {
      hEl.textContent = pad(hh);
      mEl.textContent = pad(mm);
      hEl.classList.toggle("on", mode === "hour");
      mEl.classList.toggle("on", mode === "minute");
      hint.textContent = mode === "hour" ? "Tap the hour — inner ring for afternoon & evening" : "Now tap the minutes";
      svg.replaceChildren();
      svg.append(svgEl("circle", { cx: C, cy: C, r: 124, class: "tp-face" }));
      const cur = mode === "hour" ? hh : mm;
      const { a, r } = spot(cur);
      // The leaf hand: stem from the centre, leaf blade towards the chosen number.
      const len = r - 18;
      const g = svgEl("g", { transform: `rotate(${a} ${C} ${C})`, class: "tp-hand" });
      g.append(
        svgEl("line", { x1: C, y1: C, x2: C, y2: C - len * 0.35, class: "tp-stem" }),
        svgEl("path", {
          d: `M${C} ${C - len * 0.3} C ${C + 13} ${C - len * 0.5}, ${C + 11} ${C - len * 0.85}, ${C} ${C - len} C ${C - 11} ${C - len * 0.85}, ${C - 13} ${C - len * 0.5}, ${C} ${C - len * 0.3} Z`,
          class: "tp-leaf",
        }),
        svgEl("path", { d: `M${C} ${C - len * 0.32} L ${C} ${C - len * 0.95}`, class: "tp-vein" })
      );
      svg.append(g);
      const [sx, sy] = xy(a, r);
      svg.append(svgEl("circle", { cx: sx, cy: sy, r: 17, class: "tp-sel" }));
      svg.append(svgEl("circle", { cx: C, cy: C, r: 5, class: "tp-pin" }));
      const labels = mode === "hour" ? [...Array(24).keys()] : [...Array(12).keys()].map((i) => i * 5);
      for (const v of labels) {
        const p = spot(v);
        const [x, y] = xy(p.a, p.r);
        const t = svgEl("text", { x, y, class: "tp-num" + (p.r === INNER ? " inner" : "") + (v === cur ? " on" : "") });
        t.textContent = mode === "hour" ? (v === 0 ? "00" : String(v)) : pad(v);
        svg.append(t);
      }
    }

    function setMode(m) { mode = m; render(); }

    // Tap or drag on the dial picks the nearest value.
    function pickAt(ev, final) {
      const box = svg.getBoundingClientRect();
      const x = ((ev.clientX - box.left) / box.width) * 260 - C;
      const y = ((ev.clientY - box.top) / box.height) * 260 - C;
      const dist = Math.hypot(x, y);
      if (dist < 25) return;
      const a = (Math.atan2(x, -y) * 180) / Math.PI;
      const ang = (a + 360) % 360;
      if (mode === "hour") {
        const step = Math.round(ang / 30) % 12; // 0 = top
        const inner = dist < (OUTER + INNER) / 2;
        hh = inner ? (step === 0 ? 0 : step + 12) : step === 0 ? 12 : step;
        render();
        if (final) setTimeout(() => setMode("minute"), 250);
      } else {
        mm = (Math.round(ang / 30) % 12) * 5;
        render();
      }
    }
    let dragging = false;
    svg.addEventListener("pointerdown", (e) => { dragging = true; svg.setPointerCapture(e.pointerId); pickAt(e, false); });
    svg.addEventListener("pointermove", (e) => dragging && pickAt(e, false));
    svg.addEventListener("pointerup", (e) => { if (dragging) { dragging = false; pickAt(e, true); } });

    render();
    document.body.append(bg);
  });
}
