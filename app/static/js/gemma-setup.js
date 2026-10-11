// Simple, guided Gemma download for new users (Android app only).
// The download itself keeps running while the learner uses the rest of the app.
import { api, h, toast } from "./util.js";
import { state } from "./state.js";

export const MODELS = [
  { repo: "litert-community/gemma-4-E2B-it-litert-lm", name: "Standard", size: "2.6 GB", note: "Recommended · works on most phones (6 GB+ RAM)" },
  { repo: "litert-community/gemma-4-E4B-it-litert-lm", name: "Smarter", size: "3.7 GB", note: "Better answers, slower · needs 8 GB+ RAM" },
];
const SKIP = /npu|qualcomm|qnn|mediatek|mtk|sm8\d|intel|tpu|web|ios|apple/i;
export const mb = (b) => (b >= 1e9 ? `${(b / 1e9).toFixed(1)} GB` : `${Math.round(b / 1e6)} MB`);

/** The plain (non chip-specific) .litertlm file of a repo, smallest first. */
export const pickFile = (files) => files.slice().sort((a, b) => SKIP.test(a.path) - SKIP.test(b.path) || a.size - b.size)[0];

/** Settings only expose a masked token; the real one is read from the local backend. */
export async function hfToken(value) {
  if (value !== "••••") return value || "";
  return (await api("/api/gemma/token")).token || "";
}

const gemma = () => window.__native?.gemma;
export const hasGemmaSupport = () => !!gemma();

// ---------------------------------------------------------------- download manager

export const dl = { state: "idle", received: 0, total: 0, error: "", t0: 0, b0: null, speed: 0 };
const subs = new Set();
const emit = () => { subs.forEach((f) => f(dl)); updatePill(); };
export const onDownload = (f) => (subs.add(f), () => subs.delete(f));

let hooked = false;
async function hook() {
  if (hooked) return;
  hooked = true;
  await gemma().addListener("downloadProgress", (p) => {
    if (dl.state !== "downloading") return;
    dl.received = p.received;
    dl.total = p.total || dl.total;
    if (dl.b0 == null) { dl.b0 = p.received; dl.t0 = Date.now(); }
    const secs = (Date.now() - dl.t0) / 1000;
    if (secs > 3) dl.speed = (p.received - dl.b0) / secs;
    emit();
  });
}

export async function startDownload(repo) {
  const G = gemma();
  if (!G || dl.state === "downloading" || dl.state === "finding") return;
  await hook();
  Object.assign(dl, { state: "finding", error: "", b0: null, speed: 0, received: 0, total: 0 });
  emit();
  try {
    const token = await hfToken(state.settings?.hf_token);
    const { files } = await G.listRemote({ repo, token });
    const file = pickFile(files || []);
    if (!file) throw new Error("No model file found. Try again later, or pick a model in Settings.");
    state.settings = await api("/api/settings", { method: "PUT", body: { hf_repo: repo } });
    Object.assign(dl, { state: "downloading", total: file.size });
    emit();
    await G.download({ repo, file: file.path, token });
    dl.state = "done";
    state.settings = await api("/api/settings", { method: "PUT", body: { ai_enabled: true } });
    state.aiStatus = { ok: true, message: "Gemma ready on device" };
    if (!document.querySelector(".gsetup")) toast("🌱 Your AI tutor is ready!", 4000);
    if (state.settings.gemma_preload !== false) G.load({ backend: state.settings.gemma_backend || "cpu" }).catch(() => {});
  } catch (e) {
    const msg = e.message || String(e);
    if (/cancel/i.test(msg)) dl.state = "idle";
    else Object.assign(dl, { state: "error", error: /access denied|401|403/i.test(msg) ? "The download was refused. Open Settings → Gemma and add a Hugging Face token." : msg.replace(/\s*Tap download again to resume\.?/i, "") });
  }
  emit();
}

export const cancelDownload = () => gemma()?.cancelDownload();

function eta() {
  if (!dl.speed || !dl.total) return "";
  const s = (dl.total - dl.received) / dl.speed;
  if (s < 60) return "less than a minute left";
  if (s < 3600) return `about ${Math.round(s / 60)} min left`;
  return `about ${(s / 3600).toFixed(1)} h left`;
}
const pct = () => (dl.total ? Math.min(100, (100 * dl.received) / dl.total) : 0);

// Small progress pill shown on every screen while the model downloads.
function updatePill() {
  let pill = document.getElementById("dl-pill");
  const show = (dl.state === "downloading" || dl.state === "finding" || dl.state === "error") && !document.querySelector(".gsetup");
  if (!show) return pill?.remove();
  if (!pill) {
    pill = h("a", { id: "dl-pill", class: "dl-pill", href: "#/gemma" });
    document.body.append(pill);
  }
  pill.classList.toggle("err", dl.state === "error");
  pill.replaceChildren(
    h("span", { class: "dl-pill-ico" }, dl.state === "error" ? "⚠️" : "🌱"),
    h("span", {}, dl.state === "error" ? "Gemma download stopped · tap to resume" : `Downloading AI tutor · ${pct().toFixed(0)}%`),
    h("i", { style: { width: `${pct()}%` } })
  );
}

// ---------------------------------------------------------------- setup screen

/**
 * Full-screen guided setup. Resolves when the learner continues (download running or done) or skips.
 * `step` ("2 of 2") is shown on first start, right after the welcome screen.
 */
export function gemmaSetupScreen({ step } = {}) {
  const root = document.getElementById("app");
  return new Promise(async (resolve) => {
    let choice = MODELS.find((m) => m.repo === state.settings?.hf_repo) || MODELS[0];
    let st = {};
    try { st = await gemma().status(); } catch { /* ignore */ }
    if (st.hasModel && dl.state === "idle") dl.state = "done";
    if (st.downloading && dl.state === "idle") Object.assign(dl, { state: "downloading" });

    const wrap = h("div", { class: "welcome gsetup" });
    const finish = () => {
      unsub();
      wrap.remove();
      window.scrollTo(0, 0);
      resolve();
      updatePill();
    };
    const unsub = onDownload(() => render());

    const stepTag = step ? h("div", { class: "gsetup-step" }, h("i", { class: "on" }), h("i", { class: "on" }), `Step ${step}`) : null;
    const features = h(
      "div",
      { class: "gsetup-feats" },
      [
        ["✍️", "Fresh practice sentences", "made from the words you know"],
        ["✅", "Checks your translations", "and explains what to fix"],
        ["💡", "Memory hooks", "to help new words stick"],
      ].map(([e, t, s]) => h("div", { class: "gsetup-feat" }, h("span", { class: "e" }, e), h("div", {}, h("b", {}, t), h("small", {}, s))))
    );

    function choose() {
      const free = st.freeBytes || 0;
      const need = parseFloat(choice.size) * 1e9;
      const lowSpace = free && free < need * 1.05;
      const opts = MODELS.map((m) =>
        h(
          "button",
          { class: "welcome-course gsetup-opt" + (m === choice ? " on" : ""), onclick: () => { choice = m; render(); } },
          h("span", { class: "radio" }),
          h("span", { style: { flex: 1 } }, h("b", {}, m.name, " ", h("span", { class: "muted" }, "· " + m.size)), h("small", {}, m.note))
        )
      );
      return [
        h("div", { class: "journey-avatar welcome-avatar gsetup-avatar" }, "🌱"),
        h("h1", {}, "Add your AI tutor"),
        h("p", { class: "muted" }, "Gemma is a small Google AI that runs right on your phone — private, free and offline after one download."),
        features,
        h("div", { class: "welcome-courses" }, opts),
        h(
          "p",
          { class: "small gsetup-info" + (lowSpace ? " warn" : "") },
          lowSpace ? `⚠️ Not enough free space: ${mb(free)} free, ${choice.size} needed.` : `One-time download · Wi-Fi recommended${free ? ` · ${mb(free)} free` : ""}`
        ),
        h("div", { style: { width: "100%" } }, h("button", { class: "btn", disabled: !!lowSpace, onclick: () => startDownload(choice.repo) }, `Download (${choice.size})`)),
        h("button", { class: "btn flat", onclick: () => finish() }, "Skip for now"),
        h("p", { class: "muted small" }, "The app works without AI too. You can add Gemma anytime in Settings."),
      ];
    }

    function downloading() {
      const p = pct();
      return [
        h("div", { class: "gsetup-ring", style: { "--p": `${p}` } }, h("span", {}, dl.state === "finding" ? "…" : `${p.toFixed(0)}%`)),
        h("h1", {}, "Downloading Gemma"),
        h(
          "p",
          { class: "muted" },
          dl.state === "finding" ? "Connecting…" : `${mb(dl.received)} of ${mb(dl.total)}${eta() ? ` · ${eta()}` : ""}`
        ),
        h("div", { class: "card gsetup-tip" }, "💡 You can start learning now — the download keeps going. Just keep the app open; if it stops, it continues where it left off."),
        h("div", { style: { width: "100%" } }, h("button", { class: "btn", onclick: () => finish() }, "Start learning")),
        h("button", { class: "btn flat", onclick: () => cancelDownload() }, "Cancel download"),
      ];
    }

    function done() {
      return [
        h("div", { class: "journey-avatar welcome-avatar gsetup-avatar ok" }, "✓"),
        h("h1", {}, "Your AI tutor is ready!"),
        h("p", { class: "muted" }, "Gemma is on your phone. Sentences, grading and memory hooks now work — even offline."),
        features,
        h("div", { style: { width: "100%", marginTop: "8px" } }, h("button", { class: "btn", onclick: () => finish() }, "Start learning")),
      ];
    }

    function failed() {
      return [
        h("div", { class: "journey-avatar welcome-avatar gsetup-avatar" }, "⚠️"),
        h("h1", {}, "Download stopped"),
        h("p", { class: "muted" }, dl.error),
        h("p", { class: "muted small" }, "Check your internet connection. Trying again continues where it stopped."),
        h("div", { style: { width: "100%" } }, h("button", { class: "btn", onclick: () => startDownload(choice.repo) }, "Try again")),
        h("button", { class: "btn flat", onclick: () => finish() }, "Skip for now"),
      ];
    }

    let shown = "";
    function render() {
      if (shown !== dl.state) { shown = dl.state; window.scrollTo(0, 0); }
      const body = { downloading, finding: downloading, done, error: failed }[dl.state] || choose;
      wrap.replaceChildren(...[stepTag, ...body()].filter(Boolean));
    }
    render();
    root.replaceChildren(wrap);
    updatePill();
  });
}
