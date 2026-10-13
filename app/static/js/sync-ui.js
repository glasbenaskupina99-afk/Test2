// Settings card for syncing progress between devices with a sync code (no account needed).
import { api, h, toast, confirmDialog } from "./util.js";

const ago = (iso) => {
  if (!iso) return "never";
  const s = Math.round((Date.now() - Date.parse(iso)) / 1000);
  if (s < 60) return "just now";
  if (s < 3600) return `${Math.round(s / 60)} min ago`;
  if (s < 86400) return `${Math.round(s / 3600)} h ago`;
  return new Date(iso).toLocaleDateString();
};

export function syncCard() {
  const card = h("div", { class: "card sync-card" }, h("div", { class: "spinner" }));
  const busy = async (btn, label, fn) => {
    const old = btn.textContent;
    btn.disabled = true;
    btn.textContent = label;
    try {
      await fn();
    } catch (e) {
      toast(e.message, 5000);
    } finally {
      btn.disabled = false;
      btn.textContent = old;
    }
  };

  async function render() {
    const s = await api("/api/sync");
    if (!s.on) {
      const codeIn = h("input", { class: "input", placeholder: "XXXX-XXXX-XXXX-XXXX", autocapitalize: "characters", spellcheck: "false" });
      card.replaceChildren(
        h("p", { class: "small muted", style: { marginTop: 0 } }, "Keep your progress on several devices — phone and computer, or an old and a new phone. No account: you get a code, and every device with that code shares the same progress. It's encrypted on your device, so nobody else can read it."),
        h("button", {
          class: "btn",
          onclick: (e) => busy(e.currentTarget, "Turning on…", async () => {
            await api("/api/sync/enable", { method: "POST", body: {} });
            toast("🔄 Sync is on");
            render();
          }),
        }, "Turn on sync"),
        h("div", { class: "small muted", style: { margin: "14px 0 6px" } }, "Already using sync on another device? Enter its code:"),
        h("div", { class: "row" }, codeIn, h("button", {
          class: "btn ghost",
          onclick: (e) => busy(e.currentTarget, "Connecting…", async () => {
            if (!codeIn.value.trim()) throw new Error("Enter the code from your other device");
            const r = await api("/api/sync/enable", { method: "POST", body: { code: codeIn.value } });
            toast("🔄 Connected — progress merged");
            render();
            if (r) window.dispatchEvent(new Event("bloomko-synced"));
          }),
        }, "Connect"))
      );
      return;
    }
    const codeEl = h("b", { class: "sync-code" }, s.code);
    card.replaceChildren(
      h("div", { class: "row", style: { alignItems: "center" } }, h("span", { class: "sync-dot" + (s.error ? " bad" : "") }), h("b", {}, s.error ? "Sync problem" : "Sync is on"), h("span", { class: "spacer" }), h("small", { class: "muted" }, `Last sync: ${ago(s.last)}`)),
      s.error ? h("p", { class: "small", style: { color: "var(--red)" } }, s.error) : null,
      h("div", { class: "small muted", style: { margin: "12px 0 4px" } }, "Your sync code — enter it on your other device (Settings → Sync):"),
      h("div", { class: "row sync-code-row" }, codeEl, h("button", {
        class: "btn ghost small",
        onclick: async () => {
          try {
            await navigator.clipboard.writeText(s.code);
            toast("Code copied");
          } catch {
            toast(s.code, 6000);
          }
        },
      }, "Copy")),
      h("p", { class: "small muted" }, "Keep the code private — anyone with it can see your progress. It syncs by itself when you open and leave the app."),
      h("div", { class: "row" },
        h("button", {
          class: "btn",
          onclick: (e) => busy(e.currentTarget, "Syncing…", async () => {
            const r = await api("/api/sync/now", { method: "POST" });
            toast(r.changed ? "🔄 Synced — new progress from your other device" : "🔄 Up to date");
            if (r.changed) window.dispatchEvent(new Event("bloomko-synced"));
            render();
          }),
        }, "Sync now"),
        h("button", {
          class: "btn ghost",
          onclick: async () => {
            if (!(await confirmDialog({ icon: "🔄", title: "Turn off sync?", message: "Your progress stays on this device. To sync again later, enter the same code.", confirmLabel: "Turn off", cancelLabel: "Cancel" }))) return;
            await api("/api/sync/disable", { method: "POST" });
            render();
          },
        }, "Turn off")
      )
    );
  }
  render().catch((e) => card.replaceChildren(h("p", { class: "small muted" }, e.message)));
  return card;
}
