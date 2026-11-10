// Friends (2.1): share your friend code, add friends, visit their gardens and water them once a
// day — a gentle nudge to keep their streak. Who watered yours shows on your home screen.
import { api, h, toast, fill, confirmDialog } from "./util.js";
import { gardenEl, tagPlant } from "./forest.js";

const ago = (iso: string) => {
  const m = Math.round((Date.now() - Date.parse(iso)) / 60000);
  return m < 60 ? `${Math.max(1, m)} min ago` : m < 1440 ? `${Math.round(m / 60)} h ago` : new Date(iso).toLocaleDateString();
};

async function share(code: string) {
  const text = `Visit my garden in Bloomko 🌱 My friend code: ${code}`;
  try {
    if (navigator.share) return await navigator.share({ text });
  } catch {
    return;
  }
  try {
    await navigator.clipboard.writeText(code);
    toast("Friend code copied");
  } catch {
    toast(code, 6000);
  }
}

/** A friend's garden, full screen: look around, tap plants for their names, water it. */
export async function visitGarden(code: string, onChange?: () => void) {
  const body = h("div", { class: "visit-body" }, h("div", { class: "spinner" }));
  const root = h("div", { class: "lesson visit" }, h("div", { class: "lesson-top" }, h("button", { class: "icon-btn", "aria-label": "Close", onclick: () => close() }, "✕"), h("b", { class: "visit-title" }, "A friend's garden")), body);
  const close = () => {
    root.remove();
    document.body.style.overflow = "";
    onChange?.();
  };
  document.body.append(root);
  document.body.style.overflow = "hidden";
  let g;
  try {
    g = await api(`/api/friends/garden?code=${encodeURIComponent(code)}`);
  } catch (e) {
    fill(body, h("p", { class: "muted center" }, e.message));
    return;
  }
  root.querySelector(".visit-title").textContent = `${g.name}'s garden`;
  const waterBtn = h("button", { class: "btn water-friend", disabled: g.watered }, g.watered ? "💧 Watered today" : `💧 Water ${g.name}'s garden`);
  const garden = gardenEl(g.beds, { season: g.season, onTap: (p, el) => tagPlant(garden, el, p) });
  waterBtn.onclick = async () => {
    waterBtn.disabled = true;
    try {
      await api("/api/friends/water", { method: "POST", body: { code } });
      garden.classList.add("raining");
      setTimeout(() => garden.classList.remove("raining"), 2600);
      waterBtn.textContent = "💧 Watered today";
      toast(`💧 You watered ${g.name}'s garden — they'll see it next time they open Bloomko`, 4500);
    } catch (e) {
      toast(e.message, 4000);
      waterBtn.disabled = false;
    }
  };
  fill(
    body,
    h(
      "div",
      { class: "card visit-card" },
      h("div", { class: "row", style: { alignItems: "center", gap: "12px" } }, h("span", { class: "visit-ava" }, "🌱"), h("div", {}, h("b", {}, g.name), h("div", { class: "small muted" }, `🔥 ${g.streak}-day streak · ${g.plants} plants · ${g.today ? "practised today ✓" : "hasn't practised yet today"}`))),
      !g.today ? h("p", { class: "small", style: { margin: "10px 0 0" } }, `A little water is a friendly nudge — ${g.name} will see it when they open Bloomko.`) : null,
      h("div", { style: { marginTop: "12px" } }, waterBtn)
    ),
    garden
  );
}

/** The Friends tab of the garden screen. */
export function friendsPanel({ season }: { season?: string } = {}) {
  const panel = h("div", { class: "friends" }, h("div", { class: "spinner" }));
  async function render() {
    let d;
    try {
      d = await api("/api/friends");
    } catch (e) {
      fill(panel, h("p", { class: "muted center" }, e.message));
      return;
    }
    if (!d.on) {
      const go = h("button", { class: "btn" }, "Turn on friends");
      go.onclick = async () => {
        go.disabled = true;
        try {
          await api("/api/friends/enable", { method: "POST" });
          render();
        } catch (e) {
          toast(e.message, 5000);
          go.disabled = false;
        }
      };
      fill(
        panel,
        h(
          "div",
          { class: "card friends-intro" },
          h("div", { class: "fi-art" }, "🌱💧🌷"),
          h("h3", {}, "Visit each other's gardens"),
          h("p", { class: "muted small" }, "Share your friend code, add your friends, and water their gardens once a day — a gentle nudge to keep their streak going. They'll see who watered theirs."),
          h("p", { class: "small muted" }, `Friends see your name${d.name ? ` (“${d.name}”)` : ""}, your streak and how your garden looks — not your words or anything else.`),
          go
        )
      );
      return;
    }
    const codeIn = h("input", { class: "input", placeholder: "Friend's code: XXXX-XXXX", autocapitalize: "characters", spellcheck: "false" });
    const add = h("button", { class: "btn ghost" }, "Add");
    add.onclick = async () => {
      add.disabled = true;
      try {
        const r = await api("/api/friends/add", { method: "POST", body: { code: codeIn.value } });
        toast(`🌱 ${r.name} added`);
        render();
      } catch (e) {
        toast(e.message, 5000);
        add.disabled = false;
      }
    };
    const unwatered = d.list.filter((f) => !f.watered && !f.error);
    fill(
      panel,
      h(
        "div",
        { class: "card my-code" },
        h("div", { class: "small muted" }, "Your friend code"),
        h("div", { class: "row", style: { alignItems: "center", gap: "10px" } }, h("b", { class: "sync-code" }, d.code), h("span", { class: "spacer" }), h("button", { class: "btn small", onclick: () => share(d.code) }, "Share")),
        h("div", { class: "row", style: { gap: "8px", marginTop: "12px" } }, codeIn, add)
      ),
      d.inbox.length
        ? h("div", { class: "card friend-inbox" }, d.inbox.map((w) => h("div", { class: "fib-row" }, h("span", {}, "💧"), h("span", {}, h("b", {}, w.name), " watered your garden"), h("span", { class: "spacer" }), h("small", { class: "muted" }, ago(w.at)))))
        : null,
      h("div", { class: "home-label" }, d.list.length ? `Friends · ${d.list.length}` : "Friends"),
      d.list.length
        ? h(
            "div",
            { class: "friend-list" },
            d.list.map((f) =>
              h(
                "div",
                { class: "card friend-row" },
                h("button", { class: "fr-main", onclick: () => visitGarden(f.code, render) },
                  h("span", { class: "fr-ava" }, f.profile?.today ? "🌷" : "🌱"),
                  h("div", {}, h("b", {}, f.name), h("div", { class: "small muted" }, f.error ? f.error : `🔥 ${f.profile?.streak ?? 0} · ${f.profile?.plants ?? 0} plants · ${f.profile?.today ? "practised today" : "not yet today"}`))),
                h("button", { class: `btn small ${f.watered ? "ghost" : ""}`, disabled: !!f.error, onclick: () => visitGarden(f.code, render) }, f.watered ? "Visit ✓" : "💧 Visit"),
                h("button", {
                  class: "icon-btn fr-remove",
                  "aria-label": "Remove friend",
                  onclick: async () => {
                    if (!(await confirmDialog({ icon: "👥", title: `Remove ${f.name}?`, message: "You can add them again with their friend code.", confirmLabel: "Remove", cancelLabel: "Keep" }))) return;
                    await api("/api/friends/remove", { method: "POST", body: { code: f.code } });
                    render();
                  },
                }, "×")
              )
            )
          )
        : h("p", { class: "muted small" }, "No friends yet — share your code, or add a friend's code above."),
      unwatered.length ? h("p", { class: "small muted center" }, `${unwatered.length} garden${unwatered.length === 1 ? "" : "s"} could use some water today 💧`) : null
    );
    if (d.inbox.some((w) => !w.seen)) api("/api/friends/seen", { method: "POST" }).catch(() => {});
  }
  render();
  return panel;
}
