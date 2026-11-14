// Encrypted cloud backup (2.0): the Settings card, and restoring on a new phone (also from the
// welcome screen). The backup key is shown once when backup is turned on, and can be shown again.
import { api, h, toast, confirmDialog, fill } from "./util.js";

const when = (iso: string | null) => (iso ? new Date(iso).toLocaleString([], { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" }) : "never");

async function copy(text: string) {
  try {
    await navigator.clipboard.writeText(text);
    toast("Key copied");
  } catch {
    toast(text, 8000);
  }
}

/** Save the key somewhere safe: the share sheet in the app, a small text file in the browser. */
async function saveKey(key: string) {
  const text = `Bloomko backup key\n\n${key}\n\nKeep it somewhere safe (a password manager, a note, a photo). You need it to restore your progress on a new phone: Bloomko → welcome screen → “Restore from a backup”, or Settings → Cloud backup → Restore.`;
  if (window.__native?.shareFile) {
    await window.__native.shareFile("bloomko-backup-key.txt", text);
    return;
  }
  const a = h("a", { href: URL.createObjectURL(new Blob([text], { type: "text/plain" })), download: "bloomko-backup-key.txt" });
  document.body.append(a);
  a.click();
  a.remove();
}

function keyBox(key: string) {
  return h(
    "div",
    { class: "backup-key" },
    h("b", { class: "sync-code" }, key),
    h("div", { class: "row", style: { gap: "8px", marginTop: "10px" } }, h("button", { class: "btn ghost small", onclick: () => copy(key) }, "Copy"), h("button", { class: "btn ghost small", onclick: () => saveKey(key) }, "Save as file"))
  );
}

async function busy(btn: HTMLButtonElement, label: string, fn: () => Promise<unknown>) {
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
}

/** Settings → Cloud backup. */
export function cloudBackupCard() {
  const card = h("div", { class: "card sync-card" }, h("div", { class: "spinner" }));
  let showKey = false;
  async function render() {
    const s = await api("/api/cloud-backup");
    if (!s.on) {
      fill(card,
        h("p", { class: "small muted", style: { marginTop: 0 } }, "A copy of all your progress, encrypted on this device and kept on bloomko.eu — about once a day, the last 10 copies. Lost or new phone? Restore it with your backup key. Without the key nobody can read it, not even us."),
        h("button", {
          class: "btn",
          onclick: (e) => busy(e.currentTarget, "Backing up…", async () => {
            await api("/api/cloud-backup/enable", { method: "POST" });
            showKey = true;
            toast("☁️ First backup done");
            render();
          }),
        }, "Turn on cloud backup"),
        h("button", { class: "btn ghost", style: { marginTop: "10px" }, onclick: () => restoreFlow() }, "Restore from a backup")
      );
      return;
    }
    fill(card,
      h("div", { class: "row", style: { alignItems: "center" } }, h("span", { class: "sync-dot" + (s.error ? " bad" : "") }), h("b", {}, s.error ? "Backup problem" : "Cloud backup is on"), h("span", { class: "spacer" }), h("small", { class: "muted" }, `Last: ${when(s.last)}`)),
      s.error ? h("p", { class: "small", style: { color: "var(--red)" } }, s.error) : null,
      showKey
        ? h("div", {}, h("div", { class: "small", style: { margin: "12px 0 6px" } }, h("b", {}, "Your backup key — save it now. "), "You need it to restore on a new phone."), keyBox(s.key))
        : h("button", { class: "link-btn", style: { margin: "10px 0 0" }, onclick: () => { showKey = true; render(); } }, "Show backup key"),
      h(
        "label",
        { class: "switch-row", style: { marginTop: "12px" } },
        h("div", {}, "Back up automatically", h("div", { class: "small muted" }, "About once a day, when you open or leave the app")),
        (() => {
          const t = h("input", { type: "checkbox", class: "toggle" });
          t.checked = s.auto;
          t.onchange = async () => { await api("/api/cloud-backup/auto", { method: "POST", body: { auto: t.checked } }); };
          return t;
        })()
      ),
      h(
        "div",
        { class: "row", style: { marginTop: "12px", gap: "8px", flexWrap: "wrap" } },
        h("button", {
          class: "btn",
          onclick: (e) => busy(e.currentTarget, "Backing up…", async () => {
            await api("/api/cloud-backup/now", { method: "POST" });
            toast("☁️ Backed up");
            render();
          }),
        }, "Back up now"),
        h("button", { class: "btn ghost", onclick: () => restoreFlow({ key: s.key }) }, "Restore…"),
        h("button", {
          class: "btn ghost",
          onclick: async () => {
            if (!(await confirmDialog({ icon: "☁️", title: "Turn off cloud backup?", message: "New backups won't be made.", confirmLabel: "Turn off", cancelLabel: "Cancel" }))) return;
            const wipe = await confirmDialog({ icon: "🗑️", title: "Delete the backups on bloomko.eu too?", message: "Keep them if you may want to restore one later (you need your backup key for that).", confirmLabel: "Delete them", cancelLabel: "Keep them", danger: true });
            try {
              await api(wipe ? "/api/cloud-backup/wipe" : "/api/cloud-backup/disable", { method: "POST" });
              if (wipe) toast("🗑️ Backups deleted from bloomko.eu");
            } catch (e) {
              toast(e.message, 5000);
            }
            showKey = false;
            render();
          },
        }, "Turn off")
      )
    );
  }
  render().catch((e) => card.replaceChildren(h("p", { class: "small muted" }, e.message)));
  return card;
}

/**
 * Restore on a new phone: enter the backup key, pick one of the copies, and everything on this
 * device is replaced by it. Resolves true when something was restored (the app then reloads).
 */
export function restoreFlow({ key = "" }: { key?: string } = {}): Promise<boolean> {
  return new Promise((resolve) => {
    const close = (v: boolean) => {
      bg.remove();
      resolve(v);
    };
    const body = h("div");
    const sheet = h("div", { class: "sheet restore-sheet" }, h("h2", {}, "Restore from a backup"), body);
    const bg = h("div", { class: "sheet-bg", onclick: (e) => e.target === bg && close(false) }, sheet);
    document.body.append(bg);

    const askKey = () => {
      const input = h("input", { class: "input", placeholder: "XXXX-XXXX-XXXX-XXXX-XXXX-XXXX", autocapitalize: "characters", spellcheck: "false", value: key });
      const go = h("button", { class: "btn" }, "Find my backups");
      go.onclick = () => busy(go, "Looking…", async () => {
        if (!input.value.trim()) throw new Error("Enter your backup key");
        const r = await api("/api/cloud-backup/list", { method: "POST", body: { key: input.value } });
        showList(r.key, r.backups);
      });
      body.replaceChildren(h("p", { class: "muted small" }, "Enter the backup key you saved when you turned on cloud backup (Settings → Cloud backup)."), input, h("div", { style: { marginTop: "12px" } }, go));
      setTimeout(() => input.focus(), 100);
    };

    const showList = (k: string, items: any[]) => {
      if (!items.length) {
        body.replaceChildren(h("p", { class: "muted" }, "No backups for this key yet."), h("button", { class: "btn ghost", onclick: askKey }, "Try another key"));
        return;
      }
      body.replaceChildren(
        h("p", { class: "muted small" }, "Pick a copy. Everything on this device will be replaced by it."),
        h(
          "div",
          { class: "restore-list" },
          items.map((b, i) =>
            h(
              "button",
              { class: "restore-item", onclick: () => restore(k, b) },
              h("div", {}, h("b", {}, when(b.at)), i === 0 ? h("span", { class: "tag" }, "newest") : null),
              h("div", { class: "small muted" }, [b.learned != null ? `${b.learned} words learned` : null, b.streak ? `🔥 ${b.streak}` : null, b.device, b.version ? `v${b.version}` : null].filter(Boolean).join(" · "))
            )
          )
        )
      );
    };

    const restore = async (k: string, b: any) => {
      if (!(await confirmDialog({ icon: "☁️", title: "Restore this backup?", message: `Your progress on this device will be replaced by the copy from ${when(b.at)}.`, confirmLabel: "Restore", cancelLabel: "Cancel" }))) return;
      body.replaceChildren(h("div", { class: "spinner" }));
      try {
        const r = await api("/api/cloud-backup/restore", { method: "POST", body: { key: k, n: b.n } });
        toast(`☁️ Restored — ${r.learned} words learned`, 4000);
        close(true);
        setTimeout(() => location.reload(), 600);
      } catch (e) {
        toast(e.message, 6000);
        showList(k, [b]);
      }
    };

    askKey();
  });
}
