// Settings card for running Gemma on the phone (Android app only).
import { api, h, toast } from "./util.js";
import { state } from "./state.js";

const REPOS = [
  ["litert-community/gemma-4-E2B-it-litert-lm", "Gemma 4 E2B — recommended (~2.6 GB, phones with 6 GB+ RAM)"],
  ["litert-community/gemma-4-E4B-it-litert-lm", "Gemma 4 E4B — smarter, slower (~3.7 GB, 8 GB+ RAM)"],
  ["custom", "Other Hugging Face repo…"],
];
const SKIP = /npu|qualcomm|qnn|mediatek|mtk|sm8\d|intel|tpu|web|ios|apple/i;

const mb = (b) => (b >= 1e9 ? `${(b / 1e9).toFixed(2)} GB` : `${Math.round(b / 1e6)} MB`);

export function gemmaCard(s, fields, save) {
  const G = window.__native.gemma;
  const card = h("div", { class: "card" });
  const statusEl = h("div", { class: "row small", style: { flexWrap: "wrap" } });
  const progress = h("div", { hidden: true }, h("div", { class: "progress", style: { margin: "8px 0" } }, h("i", { style: { width: "0%" } })), h("div", { class: "small muted" }));
  const files = h("div", { style: { margin: "10px 0" } });

  const aiToggle = h("input", { type: "checkbox", class: "toggle" });
  aiToggle.checked = s.ai_enabled;
  fields.ai_enabled = { get value() { return aiToggle.checked; } };

  const known = REPOS.some(([r]) => r === s.hf_repo);
  const repoSel = h("select", {}, REPOS.map(([v, l]) => h("option", { value: v, selected: known ? v === s.hf_repo : v === "custom" }, l)));
  const repoCustom = h("input", { class: "input", placeholder: "owner/repo", value: known ? "" : s.hf_repo });
  repoCustom.hidden = repoSel.value !== "custom";
  repoSel.onchange = () => { repoCustom.hidden = repoSel.value !== "custom"; files.replaceChildren(); };
  const repo = () => (repoSel.value === "custom" ? repoCustom.value.trim() : repoSel.value);
  fields.hf_repo = { get value() { return repo(); } };

  const token = h("input", { class: "input", type: "password", placeholder: "only if the download says access denied", value: s.hf_token || "" });
  fields.hf_token = token;

  const backend = h("select", {}, [["cpu", "CPU — works on every phone"], ["gpu", "GPU — faster, may crash on phones under 12 GB RAM"]].map(([v, l]) => h("option", { value: v, selected: s.gemma_backend === v }, l)));
  fields.gemma_backend = backend;

  let chosen = null;
  const downloadBtn = h("button", { class: "btn", disabled: true, onclick: () => startDownload() }, "Download");
  const cancelBtn = h("button", { class: "btn ghost", hidden: true, onclick: () => G.cancelDownload() }, "Cancel");

  async function refresh() {
    const st = await G.status();
    statusEl.replaceChildren(
      ...[
      h("span", { class: "status-dot" + (st.hasModel ? " ok" : "") }),
      st.hasModel ? `${st.modelName} · ${mb(st.modelSize)} · ${st.loaded ? `loaded (${st.backend})` : st.loading ? "loading…" : "not loaded yet"}` : "No model on this phone yet",
      h("div", { class: "muted", style: { width: "100%" } }, `Free space: ${mb(st.freeBytes)}`),
      st.lastError ? h("div", { style: { width: "100%", color: "var(--red)" } }, st.lastError) : null,
      ].filter(Boolean)
    );
    state.aiStatus = { ok: st.hasModel && s.ai_enabled, message: st.hasModel ? "Gemma ready on device" : "No model downloaded" };
    if (st.downloading) showProgress(true);
    return st;
  }

  function showProgress(on, label = "") {
    progress.hidden = !on;
    cancelBtn.hidden = !on;
    downloadBtn.hidden = on;
    if (label) progress.lastChild.textContent = label;
  }

  const onProgress = (verb) => (p) => {
    const pct = p.total ? (100 * p.received) / p.total : 0;
    progress.querySelector("i").style.width = `${pct.toFixed(1)}%`;
    progress.lastChild.textContent = `${verb} ${mb(p.received)}${p.total ? ` of ${mb(p.total)} (${pct.toFixed(0)}%)` : ""}`;
  };
  let listeners = [];
  (async () => {
    listeners.push(await G.addListener("downloadProgress", onProgress("Downloaded")));
    listeners.push(await G.addListener("importProgress", onProgress("Copied")));
  })();

  async function findFiles() {
    if (!repo()) return toast("Enter a repository");
    files.replaceChildren(h("div", { class: "muted small" }, "Looking…"));
    try {
      const r = await G.listRemote({ repo: repo(), token: token.value });
      if (!r.files.length) return files.replaceChildren(h("div", { class: "muted small" }, "No .litertlm files in that repository."));
      const sorted = r.files.slice().sort((a, b) => SKIP.test(a.path) - SKIP.test(b.path) || a.size - b.size);
      chosen = sorted[0];
      files.replaceChildren(
        ...sorted.map((f) => {
          const radio = h("input", { type: "radio", name: "gemmafile", checked: f === chosen, onchange: () => { chosen = f; } });
          return h("label", { class: "row small", style: { padding: "6px 0", cursor: "pointer" } }, radio, h("span", { style: { flex: 1, wordBreak: "break-all" } }, f.path), h("span", { class: "muted" }, mb(f.size)));
        }),
        h("div", { class: "hint" }, "Pick the plain one; NPU/chip-specific builds only work on those chips.")
      );
      downloadBtn.disabled = false;
    } catch (e) {
      files.replaceChildren(h("div", { class: "small", style: { color: "var(--red)" } }, e.message));
    }
  }

  async function startDownload() {
    if (!chosen) return;
    await save(true);
    showProgress(true, "Starting…");
    try {
      await G.download({ repo: repo(), file: chosen.path, token: token.value });
      toast("Model downloaded ✓");
    } catch (e) {
      toast(e.message, 5000);
    }
    showProgress(false);
    refresh();
  }

  async function importFile() {
    showProgress(true, "Choose the file…");
    try {
      await G.importFile();
      toast("Model imported ✓");
    } catch (e) {
      toast(e.message, 5000);
    }
    showProgress(false);
    refresh();
  }

  async function test(btn) {
    await save(true);
    btn.disabled = true;
    const t0 = Date.now();
    btn.textContent = "Loading model… (can take ~30 s)";
    try {
      const r = await api("/api/ai/test", { method: "POST" });
      toast(`Gemma: ${r.reply} (${((Date.now() - t0) / 1000).toFixed(0)} s)`, 6000);
    } catch (e) {
      toast(e.message, 6000);
    }
    btn.disabled = false;
    btn.textContent = "Load & test";
    refresh();
  }

  card.append(
    h("div", { class: "switch-row" }, h("div", {}, "Use AI", h("div", { class: "small muted" }, "Sentences, translation grading, memory hooks")), aiToggle),
    statusEl,
    h("h3", { style: { margin: "16px 0 8px", fontSize: "17px" } }, "Get the model"),
    h("p", { class: "small muted", style: { marginTop: 0 } }, "Downloads once (over Wi-Fi or mobile data — check your data plan, it's a few GB), then runs offline. Keep the app open while it downloads; if it stops, tap Download again to resume."),
    h("div", { class: "field" }, h("label", {}, "Model"), repoSel, repoCustom),
    h("div", { class: "field" }, h("label", {}, "Hugging Face token (optional)"), token),
    h("button", { class: "btn ghost", onclick: findFiles }, "Find model files"),
    files,
    progress,
    h("div", { class: "row" }, downloadBtn, cancelBtn),
    h("button", { class: "btn flat", onclick: importFile }, "…or import a .litertlm file from this phone"),
    h("h3", { style: { margin: "16px 0 8px", fontSize: "17px" } }, "Run it"),
    h("div", { class: "field" }, h("label", {}, "Processor"), backend),
    h(
      "div",
      { class: "row" },
      h("button", { class: "btn ghost", onclick: (e) => test(e.currentTarget) }, "Load & test"),
      h("button", { class: "btn ghost small", style: { "--fg": "var(--red)" }, onclick: async () => { if (confirm("Delete the downloaded model?")) { await G.deleteModel(); refresh(); } } }, "Delete")
    )
  );
  refresh();
  card.cleanup = () => listeners.forEach((l) => l.remove());
  return card;
}

export function backupCard() {
  const fileIn = h("input", {
    type: "file",
    accept: "application/json,.json",
    hidden: true,
    onchange: async () => {
      const f = fileIn.files[0];
      if (!f) return;
      if (!confirm("Replace all progress on this phone with the backup?")) return;
      try {
        await api("/api/backup/restore", { method: "POST", body: JSON.parse(await f.text()) });
        toast("Backup restored ✓");
        location.hash = "#/";
      } catch (e) {
        toast("Restore failed: " + e.message, 5000);
      }
    },
  });
  return h(
    "div",
    { class: "card" },
    h("p", { class: "small muted", style: { marginTop: 0 } }, "Your progress lives only on this phone. Export a backup now and then (e.g. to Google Drive)."),
    h(
      "div",
      { class: "row" },
      h("button", {
        class: "btn ghost",
        onclick: async () => {
          const data = await api("/api/backup");
          const name = `hanzi-backup-${new Date().toISOString().slice(0, 10)}.json`;
          try {
            await window.__native.shareFile(name, JSON.stringify(data));
          } catch (e) {
            if (!/cancel/i.test(e.message)) toast(e.message, 4000);
          }
        },
      }, "Export"),
      h("button", { class: "btn ghost", onclick: () => fileIn.click() }, "Import"),
      fileIn
    )
  );
}
