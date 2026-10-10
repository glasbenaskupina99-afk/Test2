import { api, h, iconBtn, toast } from "./util.js";
import { state, T, isJa, sayText, applyCourse } from "./state.js";
import { speak, canRecognize, canRecord } from "./audio.js";
import { strokeDemo } from "./writer.js";
import * as flows from "./flows.js";
import { gemmaCard, backupCard } from "./gemma-settings.js";

const app = document.getElementById("app");
const UNIT_COLORS = ["#58cc02", "#ce82ff", "#1cb0f6", "#ff9600", "#ff4b4b", "#2b70c9", "#00cd9c", "#ff86d0", "#a5a5a5", "#cc348d"];

// ------------------------------------------------------------------ theme

function applyTheme() {
  let t = "auto";
  try { t = localStorage.getItem("theme") || "auto"; } catch { /* ignore */ }
  if (t === "auto") document.documentElement.removeAttribute("data-theme");
  else document.documentElement.setAttribute("data-theme", t);
}
applyTheme();

// ------------------------------------------------------------------ shell

const TABS = [
  ["#/", "🏠", "Learn"],
  ["#/words", "📖", "Words"],
  ["#/stats", "📊", "Stats"],
  ["#/settings", "⚙️", "Settings"],
];

function shell(content, active) {
  const tabbar = h(
    "nav",
    { class: "tabbar" },
    TABS.map(([href, ico, label]) => h("a", { href, class: href === active ? "active" : "" }, h("span", { class: "ico" }, ico), label))
  );
  app.replaceChildren(h("div", { class: "screen" }, content), tabbar);
}

function loading() {
  return h("div", { class: "spinner" });
}

async function route() {
  const hash = location.hash || "#/";
  try {
    if (hash.startsWith("#/words")) return await wordsScreen();
    if (hash.startsWith("#/stats")) return await statsScreen();
    if (hash.startsWith("#/settings")) return await settingsScreen();
    return await homeScreen();
  } catch (e) {
    shell(h("div", { class: "empty" }, h("div", { class: "e" }, "😵"), h("h2", {}, "Something went wrong"), h("p", { class: "muted" }, e.message)), hash);
  }
}
window.addEventListener("hashchange", route);

async function startFlow(fn) {
  try {
    const result = await fn();
    if (result !== undefined) route();
  } catch (e) {
    toast(e.message, 4000);
  }
}

// ------------------------------------------------------------------ home

const COURSES = {
  zh: { flag: "🇨🇳", name: "Chinese", script: "汉字", sub: "Mandarin · HSK 1" },
  ja: { flag: "🇯🇵", name: "Japanese", script: "漢字", sub: "Kanji · JLPT N5" },
};

function courseSheet(home) {
  const bg = h(
    "div",
    { class: "sheet-bg", onclick: (e) => e.target === bg && bg.remove() },
    h(
      "div",
      { class: "sheet" },
      h("h2", { style: { marginBottom: "14px" } }, "Choose a course"),
      h(
        "div",
        { class: "modes", style: { marginTop: 0 } },
        home.courses.map((c) => {
          const info = COURSES[c.lang];
          return h(
            "button",
            {
              class: "mode" + (c.lang === "ja" ? " blue" : "") + (c.lang === home.course ? "" : ""),
              style: c.lang === home.course ? { outline: "4px solid var(--yellow)" } : {},
              onclick: async () => {
                state.settings = await api("/api/settings", { method: "PUT", body: { course: c.lang } });
                applyCourse();
                bg.remove();
                route();
              },
            },
            h("div", { class: "badge-ico" }, info.flag),
            h("div", {}, h("h3", {}, `${info.name} `, h("span", { class: "hz" }, info.script)), h("p", {}, `${info.sub} · ${c.learned}/${c.total} learned`))
          );
        })
      ),
      h("p", { class: "muted small center", style: { marginTop: "14px" } }, "Each course keeps its own words and progress. Your streak and XP are shared.")
    )
  );
  document.body.append(bg);
}

function topbar(home) {
  const ai = state.aiStatus;
  return h(
    "div",
    { class: "topbar" },
    home.courses
      ? h(
          "button",
          { class: "stat", title: "Switch course", onclick: () => courseSheet(home), style: { background: "none", border: "2px solid var(--border)", borderRadius: "12px", padding: "4px 8px", cursor: "pointer" } },
          h("span", { class: "ico" }, COURSES[home.course].flag)
        )
      : null,
    h("div", { class: "stat fire" + (home.streak ? "" : " dim") }, h("span", { class: "ico" }, "🔥"), home.streak),
    h("div", { class: "stat gem" }, h("span", { class: "ico" }, "📚"), `${home.learned}`),
    h("div", { class: "stat xp" }, h("span", { class: "ico" }, "⚡"), home.xp_today),
    h(
      "a",
      { class: "stat", href: "#/settings", title: ai?.message || "AI status", style: { textDecoration: "none", color: "var(--muted)", fontSize: "14px" } },
      h("span", { class: "status-dot" + (ai?.ok ? " ok" : "") }),
      "AI"
    )
  );
}

async function homeScreen() {
  shell(loading(), "#/");
  const [home, next] = await Promise.all([api("/api/home"), api("/api/learn/next")]);
  const goalPct = Math.min(100, Math.round((100 * home.xp_today) / Math.max(home.daily_goal, 1)));
  const preview = next.words.map((w) => w.hanzi).join(" ");

  const learnCard = h(
    "button",
    { class: "mode" + (next.words.length ? "" : " done"), onclick: () => next.words.length && startFlow(flows.learnNew) },
    h("div", { class: "badge-ico" }, "🌱"),
    h(
      "div",
      {},
      h("h3", {}, "Learn new words"),
      next.words.length ? h("div", { class: "preview" }, preview) : h("p", {}, "All words learned — add more!")
    )
  );
  const reviewCard = h(
    "button",
    { class: "mode blue" + (home.learned ? "" : " done"), onclick: () => home.learned && startFlow(() => flows.review({ extra: home.due === 0 })) },
    h("div", { class: "badge-ico" }, "🏋️"),
    h(
      "div",
      {},
      h("h3", {}, "Practice"),
      h("p", {}, !home.learned ? "Learn a few words first" : home.due ? "Words ready for review" : `All caught up! ${nextDueText(home.next_due)} Tap for extra practice`)
    ),
    home.due ? h("div", { class: "count" }, home.due) : null
  );
  const sentenceCard = h(
    "button",
    { class: "mode purple", onclick: () => startFlow(flows.sentences) },
    h("div", { class: "badge-ico" }, "💬"),
    h("div", {}, h("h3", {}, "Sentences"), h("p", {}, state.settings.ai_enabled ? "Write, type & say AI-made sentences" : "Write, type & say sentences"))
  );

  const units = await unitsView(home.units);

  shell(
    [
      topbar(home),
      h(
        "div",
        { class: "card goal-card" },
        h("div", { class: "goal-icon" }, goalPct >= 100 ? "🏆" : "🎯"),
        h(
          "div",
          { style: { flex: 1 } },
          h("div", { class: "row" }, h("h3", {}, "Daily goal"), h("span", { class: "spacer" }), h("span", { class: "muted small" }, `${home.xp_today} / ${home.daily_goal} XP`)),
          h("div", { class: "progress yellow", style: { marginTop: "8px" } }, h("i", { style: { width: goalPct + "%" } }))
        )
      ),
      h("div", { class: "modes" }, learnCard, reviewCard, sentenceCard),
      h("h2", { class: "section-title" }, "This week"),
      weekChart(home.week),
      h("h2", { class: "section-title" }, `Your ${T.lang()} path`),
      units,
    ],
    "#/"
  );
}

function nextDueText(nextDue) {
  if (!nextDue) return "";
  const mins = Math.round((new Date(nextDue.replace(" ", "T")) - new Date()) / 60000);
  if (mins < 60) return `Next review in ${Math.max(1, mins)} min.`;
  if (mins < 60 * 24) return `Next review in ${Math.round(mins / 60)} h.`;
  return `Next review in ${Math.round(mins / 1440)} d.`;
}

function weekChart(week) {
  const byDay = Object.fromEntries(week.map((d) => [d.day, d.xp]));
  const days = [];
  for (let i = 6; i >= 0; i--) {
    const d = new Date();
    d.setDate(d.getDate() - i);
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
    days.push({ label: d.toLocaleDateString(undefined, { weekday: "narrow" }), xp: byDay[key] || 0 });
  }
  const max = Math.max(30, ...days.map((d) => d.xp));
  return h(
    "div",
    { class: "card" },
    h(
      "div",
      { class: "week" },
      days.map((d) =>
        h("div", { class: "bar" + (d.xp ? "" : " empty") }, h("span", {}, d.xp || ""), h("i", { style: { height: `${Math.max(4, (80 * d.xp) / max)}px` } }), h("span", {}, d.label))
      )
    )
  );
}

async function unitsView(units) {
  const words = await api("/api/words");
  const byUnit = {};
  words.forEach((w) => (byUnit[w.unit] ||= []).push(w));
  return h(
    "div",
    {},
    units.map((u, i) => {
      const complete = u.learned === u.total;
      const body = h(
        "div",
        { class: "unit-body" },
        (byUnit[u.name] || []).map((w) =>
          h(
            "button",
            { class: "chip" + (w.cards ? " learned" : " locked") + (w.lapses > 2 ? " weak" : ""), onclick: () => wordSheet(w) },
            h("span", { class: "hz" }, w.hanzi),
            h("span", { class: "py" }, w.cards ? w.pinyin : "·")
          )
        )
      );
      const started = u.learned > 0 && !complete;
      body.hidden = !(started || (i === 0 && !u.learned));
      return h(
        "div",
        { class: "unit" },
        h(
          "div",
          { class: "unit-head", style: { "--c": UNIT_COLORS[i % UNIT_COLORS.length] }, onclick: () => (body.hidden = !body.hidden) },
          h("div", {}, h("div", { class: "sub" }, `UNIT ${i + 1} · ${u.learned}/${u.total}`), h("h3", {}, u.name)),
          h("div", { class: "crown" }, complete ? "👑" : started ? "📖" : "🔒")
        ),
        body
      );
    })
  );
}

// ------------------------------------------------------------------ word sheet

function wordSheet(w) {
  const demo = strokeDemo(w.hanzi, { size: Math.min(160, Math.floor((window.innerWidth - 80) / [...w.hanzi].length)) });
  const bg = h(
    "div",
    { class: "sheet-bg", onclick: (e) => e.target === bg && bg.remove() },
    h(
      "div",
      { class: "sheet" },
      demo.el,
      h(
        "div",
        { class: "word-hero" },
        h("div", { class: "py" }, w.pinyin),
        h("div", { class: "en" }, w.english),
        h("div", { class: "row", style: { justifyContent: "center", marginTop: "10px" } }, iconBtn("speaker", "speaker", () => speak(sayText(w)), "Listen"))
      ),
      w.cards
        ? h("p", { class: "muted small center" }, `Strength: ${Math.round(w.strength || 0)} day interval · ${w.lapses || 0} lapses`)
        : h("p", { class: "muted small center" }, "Not learned yet"),
      h(
        "div",
        { class: "row", style: { marginTop: "10px" } },
        h("button", { class: "btn blue", onclick: () => { bg.remove(); startFlow(() => flows.drillWord(w)); } }, "✍️ Drill writing")
      ),
      h(
        "div",
        { class: "row", style: { marginTop: "14px" } },
        w.cards
          ? h("button", { class: "btn ghost small", onclick: async () => { await api(`/api/words/${w.id}/reset`, { method: "POST" }); bg.remove(); toast("Progress reset"); route(); } }, "Reset progress")
          : null,
        w.source === "custom"
          ? h("button", { class: "btn ghost small", style: { "--fg": "var(--red)" }, onclick: async () => { if (!confirm(`Delete ${w.hanzi}?`)) return; await api(`/api/words/${w.id}`, { method: "DELETE" }); bg.remove(); route(); } }, "Delete")
          : null
      )
    )
  );
  document.body.append(bg);
  speak(sayText(w));
}

// ------------------------------------------------------------------ words

let wordFilter = "all";
let wordSearch = "";

async function wordsScreen() {
  shell(loading(), "#/words");
  const words = await api("/api/words");
  const list = h("div", { class: "list" });
  const render = () => {
    const q = wordSearch.toLowerCase();
    const shown = words.filter((w) => {
      if (wordFilter === "learned" && !w.cards) return false;
      if (wordFilter === "new" && w.cards) return false;
      if (wordFilter === "weak" && !(w.lapses > 0)) return false;
      if (wordFilter === "mine" && w.source !== "custom") return false;
      return !q || w.hanzi.includes(q) || w.english.toLowerCase().includes(q) || w.pinyin.toLowerCase().includes(q);
    });
    list.replaceChildren(
      ...(shown.length
        ? shown.map((w) => {
            const s = Math.min(5, Math.ceil(Math.log2(1 + (w.strength || 0)) * 1.3));
            return h(
              "div",
              { class: "list-item", onclick: () => wordSheet(w), style: { cursor: "pointer" } },
              h("div", { class: "hz" }, w.hanzi),
              h("div", { class: "meta" }, h("div", { class: "py" }, w.pinyin), h("div", { class: "en" }, w.english)),
              w.cards ? h("div", { class: "strength" }, [0, 1, 2, 3, 4].map((i) => h("i", { class: i < s ? "on" : "" }))) : h("span", { class: "tag blue" }, "new")
            );
          })
        : [h("div", { class: "empty" }, h("div", { class: "e" }, "🔍"), h("p", { class: "muted" }, "No words here"))])
    );
  };
  const filters = [
    ["all", "All"],
    ["learned", "Learned"],
    ["new", "Not learned"],
    ["weak", "Tricky"],
    ["mine", "My words"],
  ];
  const fbtns = filters.map(([k, label]) =>
    h("button", { class: k === wordFilter ? "on" : "", onclick: () => { wordFilter = k; fbtns.forEach((b, i) => b.classList.toggle("on", filters[i][0] === k)); render(); } }, label)
  );
  render();
  shell(
    [
      h("div", { class: "topbar" }, h("h2", {}, "Words"), h("button", { class: "btn small", onclick: addWordSheet }, "+ Add word")),
      h("input", { class: "input search", placeholder: isJa() ? "Search 漢字, reading or English" : "Search 汉字, pinyin or English", value: wordSearch, oninput: (e) => { wordSearch = e.target.value; render(); } }),
      h("div", { class: "filter-row" }, fbtns),
      h("p", { class: "muted small" }, `${words.filter((w) => w.cards).length} of ${words.length} learned`),
      list,
    ],
    "#/words"
  );
}

function addWordSheet() {
  const hz = h("input", { class: "input hz", placeholder: isJa() ? "漢字" : "汉字", style: { fontSize: "24px" } });
  const py = h("input", { class: "input", placeholder: isJa() ? "reading in hiragana or romaji" : "pinyin (auto-filled if empty)" });
  const en = h("input", { class: "input", placeholder: "English meaning" });
  const q = h("input", { class: "input", placeholder: isJa() ? "e.g. “bicycle” or “jitensha”" : "e.g. “bicycle” or “zixingche”" });
  hz.addEventListener("change", async () => {
    if (hz.value && !py.value) py.value = (await api("/api/words/pinyin", { method: "POST", body: { query: hz.value } })).pinyin;
  });
  const aiRow = state.settings.ai_enabled
    ? h(
        "div",
        { class: "card", style: { marginBottom: "16px" } },
        h("div", { class: "field" }, h("label", {}, "✨ Ask Gemma"), q),
        h(
          "button",
          {
            class: "btn purple",
            onclick: async (e) => {
              if (!q.value.trim()) return;
              e.target.disabled = true;
              e.target.textContent = "Thinking…";
              try {
                const r = await api("/api/words/ai-fill", { method: "POST", body: { query: q.value } });
                hz.value = r.hanzi;
                py.value = r.pinyin;
                en.value = r.english;
              } catch (err) {
                toast(err.message, 4000);
              }
              e.target.disabled = false;
              e.target.textContent = "Fill in";
            },
          },
          "Fill in"
        )
      )
    : null;
  const bg = h(
    "div",
    { class: "sheet-bg", onclick: (e) => e.target === bg && bg.remove() },
    h(
      "div",
      { class: "sheet" },
      h("h2", { style: { marginBottom: "14px" } }, "Add a word"),
      aiRow,
      h("div", { class: "field" }, h("label", {}, "Characters"), hz),
      h("div", { class: "field" }, h("label", {}, isJa() ? "Reading" : "Pinyin"), py),
      h("div", { class: "field" }, h("label", {}, "English"), en),
      h(
        "button",
        {
          class: "btn",
          onclick: async () => {
            try {
              await api("/api/words", { method: "POST", body: { hanzi: hz.value, pinyin: py.value, english: en.value } });
              bg.remove();
              toast(`Added ${hz.value} — it'll show up in “Learn new words” after the built-in list. Use Drill to start now.`, 4000);
              route();
            } catch (e) {
              toast(e.message, 4000);
            }
          },
        },
        "Save"
      )
    )
  );
  document.body.append(bg);
}

// ------------------------------------------------------------------ stats

async function statsScreen() {
  shell(loading(), "#/stats");
  const s = await api("/api/stats");
  const total = s.days.reduce((a, d) => a + d.xp, 0);
  const skillNames = { write: ["✍️", "Writing"], speak: ["🎤", "Speaking"], recall: ["🧠", "Recall"] };
  // 5-week calendar
  const byDay = Object.fromEntries(s.days.map((d) => [d.day, d.xp]));
  const cells = [];
  for (let i = 34; i >= 0; i--) {
    const d = new Date();
    d.setDate(d.getDate() - i);
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
    const xp = byDay[key] || 0;
    const lvl = xp === 0 ? 0 : xp < 15 ? 0.35 : xp < 40 ? 0.65 : 1;
    cells.push(h("div", { title: `${key}: ${xp} XP`, style: { aspectRatio: "1", borderRadius: "6px", background: lvl ? `color-mix(in srgb, var(--green) ${lvl * 100}%, transparent)` : "var(--border)" } }));
  }
  shell(
    [
      h("div", { class: "topbar" }, h("h2", {}, "Statistics")),
      h(
        "div",
        { class: "end-stats", style: { maxWidth: "none" } },
        h("div", { class: "end-stat", style: { "--c": "var(--orange)" } }, h("div", { class: "lbl" }, "Streak"), h("div", { class: "val" }, `🔥${s.streak}`)),
        h("div", { class: "end-stat", style: { "--c": "var(--yellow)" } }, h("div", { class: "lbl" }, "XP (60d)"), h("div", { class: "val" }, `⚡${total}`)),
        h("div", { class: "end-stat", style: { "--c": "var(--purple)" } }, h("div", { class: "lbl" }, "Sentences"), h("div", { class: "val" }, `💬${s.days.reduce((a, d) => a + d.sentences, 0)}`))
      ),
      h("h2", { class: "section-title" }, "Activity"),
      h("div", { class: "card" }, h("div", { style: { display: "grid", gridTemplateColumns: "repeat(7, 1fr)", gap: "6px" } }, cells)),
      h("h2", { class: "section-title" }, "Skills"),
      h(
        "div",
        { class: "list" },
        s.skills.length
          ? s.skills.map((k) =>
              h(
                "div",
                { class: "list-item" },
                h("div", { style: { fontSize: "28px" } }, skillNames[k.skill]?.[0] || "•"),
                h("div", { class: "meta" }, h("div", {}, skillNames[k.skill]?.[1] || k.skill), h("div", { class: "en" }, `${k.n} words · avg interval ${k.avg_interval.toFixed(1)} days · ${k.lapses} lapses`))
              )
            )
          : h("div", { class: "list-item muted" }, "Learn some words to see skill stats.")
      ),
      h("h2", { class: "section-title" }, "Trickiest words"),
      s.hardest.length
        ? h(
            "div",
            { class: "list" },
            s.hardest.map((w) =>
              h("div", { class: "list-item", style: { cursor: "pointer" }, onclick: () => wordSheet({ ...w, cards: 3 }) }, h("div", { class: "hz" }, w.hanzi), h("div", { class: "meta" }, h("div", { class: "py" }, w.pinyin), h("div", { class: "en" }, w.english)), h("span", { class: "tag" }, `${w.lapses}×`))
            )
          )
        : h("p", { class: "muted" }, "No trouble words yet. 🎉"),
    ],
    "#/stats"
  );
}

// ------------------------------------------------------------------ settings

async function settingsScreen() {
  shell(loading(), "#/settings");
  const s = await api("/api/settings");
  const f = {};
  const input = (key, attrs = {}) => (f[key] = h("input", { class: "input", value: s[key], ...attrs }));
  const select = (key, options) => {
    const el = h("select", {}, options.map(([v, label]) => h("option", { value: v, selected: String(s[key]) === String(v) }, label)));
    f[key] = el;
    return el;
  };
  const field = (label, el, hint) => h("div", { class: "field" }, h("label", {}, label), el, hint ? h("div", { class: "hint", style: { marginTop: 0 } }, hint) : null);

  const aiToggle = h("input", { type: "checkbox", class: "toggle" });
  aiToggle.checked = s.ai_enabled;
  const statusEl = h("div", { class: "row small" }, h("span", { class: "status-dot" + (state.aiStatus?.ok ? " ok" : "") }), state.aiStatus?.message || "");

  const testAI = async () => {
    await save(true);
    statusEl.replaceChildren("Testing…");
    state.aiStatus = await api("/api/ai/status");
    const st = state.aiStatus;
    statusEl.replaceChildren(
      h("span", { class: "status-dot" + (st.ok ? " ok" : "") }),
      st.message,
      st.models?.length && !st.ok ? h("div", { class: "muted", style: { width: "100%" } }, "Available: " + st.models.join(", ")) : ""
    );
  };

  const save = async (quiet = false) => {
    const body = isApp ? {} : { ai_enabled: aiToggle.checked };
    for (const [k, el] of Object.entries(f)) body[k] = el.value;
    state.settings = await api("/api/settings", { method: "PUT", body });
    if (!quiet) toast("Saved ✓");
  };

  let theme = "auto";
  try { theme = localStorage.getItem("theme") || "auto"; } catch { /* ignore */ }
  const themeSel = h(
    "select",
    { onchange: (e) => { try { localStorage.setItem("theme", e.target.value); } catch { /* ignore */ } applyTheme(); } },
    [["auto", "Match system"], ["light", "Light"], ["dark", "Dark"]].map(([v, l]) => h("option", { value: v, selected: v === theme }, l))
  );

  const isApp = !!window.__native?.gemma;
  const aiCard = isApp
    ? gemmaCard(s, f, (quiet) => save(quiet))
    : h(
        "div",
        { class: "card" },
        h("div", { class: "switch-row" }, h("div", {}, "Use AI", h("div", { class: "small muted" }, "Sentences, translation grading, memory hooks")), aiToggle),
        field("Server URL (OpenAI-compatible)", input("llm_base_url"), "Ollama: http://<host>:11434/v1 · llama.cpp: http://<host>:8080/v1"),
        field("Model", input("llm_model"), "e.g. gemma4:e4b (Ollama) — E2B/E4B variants understand audio"),
        field("API key (optional)", input("llm_api_key", { type: "password", placeholder: "none" })),
        statusEl,
        h("div", { style: { marginTop: "12px" } }, h("button", { class: "btn ghost", onclick: testAI }, "Test connection"))
      );
  const speechOptions = isApp
    ? [["browser", "Android speech recognition"], ["self", "Record & compare myself"]]
    : [["browser", "Phone speech recognition (fast)"], ["ai", "Gemma audio (needs audio-capable server)"], ["self", "Record & compare myself"]];

  const speechSupport = isApp ? [`Tip: for offline recognition, install the ${isJa() ? "Japanese" : "Chinese (Mandarin)"} offline speech pack in Android settings → Google → Voice.`] : [
    `Browser speech recognition: ${canRecognize() ? "✅ available" : "❌ not available"}`,
    `Recording: ${canRecord() ? "✅ available" : "❌ not available"}`,
    window.isSecureContext ? "" : "⚠️ Not on HTTPS — the microphone is blocked. Use the https:// address.",
  ].filter(Boolean);
  if (isApp) speechSupport.splice(1);

  shell(
    [
      h("div", { class: "topbar" }, h("h2", {}, "Settings")),
      h("h2", { class: "section-title", style: { marginTop: 0 } }, isApp ? "✨ Gemma on this phone" : "✨ Gemma AI"),
      aiCard,
      h("h2", { class: "section-title" }, "🎤 Pronunciation"),
      h(
        "div",
        { class: "card" },
        field(
          "Check my pronunciation with",
          select("speech_mode", speechOptions)
        ),
        h("div", { class: "hint", style: { marginTop: 0 } }, speechSupport.map((t) => h("div", {}, t))),
        field("Voice speed", select("tts_rate", [["0.6", "Slow"], ["0.8", "Normal"], ["1", "Native"]])),
        h("button", { class: "btn ghost small", onclick: () => { save(true).then(() => speak(isJa() ? "こんにちは、勉強を始めましょう" : "你好，我们开始学习吧")); } }, "🔊 Test voice")
      ),
      h("h2", { class: "section-title" }, "✍️ Handwriting"),
      h(
        "div",
        { class: "card" },
        field("Stroke strictness", select("leniency", [["0.7", "Strict"], ["1", "Normal"], ["1.4", "Relaxed"]])),
        field("Show a hint after", select("hint_after_misses", [["2", "2 misses"], ["3", "3 misses"], ["5", "5 misses"], ["99", "Never"]]))
      ),
      h("h2", { class: "section-title" }, "🎯 Lessons"),
      h(
        "div",
        { class: "card" },
        field("Daily goal", select("daily_goal", [["10", "Casual · 10 XP"], ["30", "Regular · 30 XP"], ["60", "Serious · 60 XP"], ["100", "Intense · 100 XP"]])),
        field("New words per lesson", select("new_per_lesson", [["3", "3"], ["5", "5"], ["8", "8"], ["10", "10"]])),
        field("Reviews per practice", select("review_size", [["10", "10"], ["15", "15"], ["25", "25"], ["40", "40"]])),
        field("Sentences per session", select("sentence_count", [["4", "4"], ["6", "6"], ["9", "9"], ["12", "12"]])),
        field("Theme", themeSel)
      ),
      isApp ? h("h2", { class: "section-title" }, "💾 Backup") : null,
      isApp ? backupCard() : null,
      h("div", { style: { marginTop: "20px" } }, h("button", { class: "btn", onclick: () => save() }, "Save settings")),
      h("p", { class: "muted small center", style: { marginTop: "24px" } }, `Stroke data: Hanzi Writer + Make Me a Hanzi (Arphic PL). ${window.__native ? "Everything runs on this phone." : "Runs entirely on your network."}`),
    ],
    "#/settings"
  );
}

// ------------------------------------------------------------------ boot

(async function boot() {
  try {
    state.settings = await api("/api/settings");
    applyCourse();
  } catch (e) {
    app.replaceChildren(h("div", { class: "empty" }, h("div", { class: "e" }, "🔌"), h("h2", {}, "Can't reach the server"), h("p", {}, e.message)));
    return;
  }
  route();
  api("/api/ai/status")
    .then((st) => {
      state.aiStatus = st;
      const dot = document.querySelector(".topbar .status-dot");
      if (dot) dot.classList.toggle("ok", !!st.ok);
    })
    .catch(() => {});
})();
