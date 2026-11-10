// Accounts (2.0): create one, sign in (also from the welcome screen), sign out, change password.
// Signing in on another device or in the other app brings everything you've done along.
import { api, h, toast, confirmDialog, fill } from "./util.js";

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

const field = (label: string, input: HTMLInputElement) => h("div", { class: "field" }, h("label", {}, label), input);
const emailInput = () => h("input", { class: "input", type: "email", autocomplete: "email", placeholder: "you@example.com", spellcheck: "false" });
const passwordInput = (autocomplete: string) => h("input", { class: "input", type: "password", autocomplete, placeholder: "At least 8 characters" });

/**
 * The sign-in / create-account sheet. Resolves true when signed in (the app then reloads, so
 * everything synced from the account shows up).
 */
export function accountSheet(mode: "login" | "register" = "login"): Promise<boolean> {
  return new Promise((resolve) => {
    const close = (v: boolean) => {
      bg.remove();
      resolve(v);
    };
    const body = h("div");
    const bg = h("div", { class: "sheet-bg", onclick: (e) => e.target === bg && close(false) }, h("div", { class: "sheet account-sheet" }, body));
    document.body.append(bg);

    const render = () => {
      const email = emailInput();
      const pw = passwordInput(mode === "login" ? "current-password" : "new-password");
      const pw2 = passwordInput("new-password");
      pw2.placeholder = "Repeat the password";
      const go = h("button", { class: "btn" }, mode === "login" ? "Sign in" : "Create account");
      const submit = () =>
        busy(go, mode === "login" ? "Signing in…" : "Creating…", async () => {
          if (mode === "register" && pw.value !== pw2.value) throw new Error("The passwords aren't the same");
          const r = await api(`/api/account/${mode}`, { method: "POST", body: { email: email.value, password: pw.value } });
          toast(mode === "login" ? (r.changed ? "👤 Signed in — your progress is here" : "👤 Signed in") : "👤 Account created — your progress is saved to it", 4000);
          close(true);
          setTimeout(() => location.reload(), 700);
        });
      go.onclick = submit;
      [email, pw, pw2].forEach((i) => (i.onkeydown = (e) => e.key === "Enter" && submit()));
      fill(
        body,
        h("h2", {}, mode === "login" ? "Sign in" : "Create an account"),
        h(
          "p",
          { class: "muted small" },
          mode === "login"
            ? "Sign in with your Bloomko account — on a new phone, the computer or the other Bloomko app — and everything you've done comes along."
            : "Your progress is then kept with your account: sign in on any device or in the other Bloomko app and carry on where you left off."
        ),
        field("Email", email),
        field("Password", pw),
        mode === "register" ? field("Password again", pw2) : null,
        mode === "register" ? h("p", { class: "small muted" }, "🔒 Your password never leaves this device and your data is encrypted with it — so we can't reset a forgotten password. Keep it safe (a cloud backup key also restores your progress).") : null,
        h("div", { style: { marginTop: "12px" } }, go),
        h("button", { class: "link-btn", onclick: () => { mode = mode === "login" ? "register" : "login"; render(); } }, mode === "login" ? "No account yet? Create one" : "Already have an account? Sign in")
      );
      setTimeout(() => email.focus(), 100);
    };
    render();
  });
}

/** Settings → Account. */
export function accountCard() {
  const card = h("div", { class: "card sync-card account-card" }, h("div", { class: "spinner" }));
  async function render() {
    const a = await api("/api/account");
    if (!a.signed_in) {
      fill(
        card,
        h("p", { class: "small muted", style: { marginTop: 0 } }, "With an account your progress follows you: sign in on another phone, the computer, or the other Bloomko app (East or Heritage) and everything you've done is there — words, reviews, streak, forest."),
        h("div", { class: "row", style: { gap: "8px" } }, h("button", { class: "btn", onclick: () => accountSheet("register") }, "Create account"), h("button", { class: "btn ghost", onclick: () => accountSheet("login") }, "Sign in"))
      );
      return;
    }
    const changePw = () => {
      const old = passwordInput("current-password");
      old.placeholder = "Current password";
      const pw = passwordInput("new-password");
      const save = h("button", { class: "btn small" }, "Change password");
      save.onclick = () => busy(save, "Saving…", async () => {
        await api("/api/account/password", { method: "POST", body: { old: old.value, password: pw.value } });
        toast("🔒 Password changed");
        render();
      });
      fill(card, h("b", {}, "Change password"), field("Current password", old), field("New password", pw), h("div", { class: "row", style: { gap: "8px" } }, save, h("button", { class: "btn ghost small", onclick: () => render() }, "Cancel")));
    };
    fill(
      card,
      h("div", { class: "row", style: { alignItems: "center" } }, h("span", { class: "sync-dot" + (a.sync_error ? " bad" : "") }), h("div", {}, h("b", {}, a.email), h("div", { class: "small muted" }, a.sync_error ? a.sync_error : "Signed in · progress synced with your account"))),
      h(
        "div",
        { class: "row", style: { gap: "8px", marginTop: "12px", flexWrap: "wrap" } },
        h("button", {
          class: "btn",
          onclick: (e) => busy(e.currentTarget, "Syncing…", async () => {
            const r = await api("/api/sync/now", { method: "POST" });
            toast(r.changed ? "🔄 Synced — new progress from your other devices" : "🔄 Up to date");
            if (r.changed) window.dispatchEvent(new Event("bloomko-synced"));
            render();
          }),
        }, "Sync now"),
        h("button", { class: "btn ghost", onclick: changePw }, "Change password"),
        h("button", {
          class: "btn ghost",
          onclick: async () => {
            if (!(await confirmDialog({ icon: "👤", title: "Sign out?", message: "What you've learned stays on this device; it just stops syncing. Sign in again any time.", confirmLabel: "Sign out", cancelLabel: "Cancel" }))) return;
            await api("/api/account/logout", { method: "POST" });
            render();
          },
        }, "Sign out")
      ),
      h("button", {
        class: "link-btn danger-link",
        onclick: async () => {
          const pw = passwordInput("current-password");
          pw.placeholder = "Your password";
          if (!(await confirmDialog({ icon: "👤", title: "Delete your account?", message: "This deletes your account on bloomko.eu. What's on this device stays. Enter your password to confirm:", content: pw, confirmLabel: "Delete", cancelLabel: "Keep", danger: true }))) return;
          try {
            await api("/api/account/delete", { method: "POST", body: { password: pw.value } });
            toast("Account deleted");
          } catch (e) {
            toast(e.message, 5000);
          }
          render();
        },
      }, "Delete account")
    );
  }
  render().catch((e) => fill(card, h("p", { class: "small muted" }, e.message)));
  return card;
}
