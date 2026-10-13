import { api, h, iconBtn, toast, confirmDialog, enhanceSelects } from "./util.js";
import { state, T, isJa, isSl, sayText, applyCourse } from "./state.js";
import { speak, stopSpeaking, canRecognize, canRecord } from "./audio.js";
import { strokeDemo } from "./writer.js";
import * as flows from "./flows.js";
import { gemmaSetupScreen, hasGemmaSupport, dl as gemmaDl } from "./gemma-setup.js";
import { soundsOn, setSounds, playCorrect } from "./sounds.js";
import { plantArt, gardenSheet, gardenNotice, dayLeafArt } from "./garden.js";
import { canRemind, ensurePermission, scheduleReminders } from "./reminders.js";
import { pickTime } from "./timepicker.js";
import { genderTag } from "./exercises.js";
import { gemmaCard, backupCard } from "./gemma-settings.js";
import { talkSheet } from "./talk.js";
import { syncCard } from "./sync-ui.js";
import { photoSheet, canReadPhotos } from "./photo.js";

const app = document.getElementById("app");
// The app build serves static files from its root; the Python server under /static/.
const LOGO = `${window.__localApi ? "" : "/static/"}icons/logo.png`;
const UNIT_COLORS = ["#6f8f6c", "#557389", "#a9643f", "#8a6d3b", "#6b5b7b", "#3f7065", "#9a5a55", "#5c6e3a", "#7a6a55", "#4f5f7a"];

// ------------------------------------------------------------------ theme

function applyTheme() {
  let t = "auto";
  try { t = localStorage.getItem("theme") || "forest"; } catch { /* ignore */ }
  if (t === "auto") document.documentElement.removeAttribute("data-theme");
  else document.documentElement.setAttribute("data-theme", t);
}
applyTheme();

// ------------------------------------------------------------------ shell

const TAB_ICONS = {
  learn: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"><path d="M4 11l8-6 8 6v8a1 1 0 0 1-1 1h-4v-6H9v6H5a1 1 0 0 1-1-1z"/></svg>',
  words: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"><path d="M12 6c-2-1.5-5-2-8-1.5V19c3-.5 6 0 8 1.5 2-1.5 5-2 8-1.5V4.5C17 4 14 4.5 12 6z"/><path d="M12 6v14.5"/></svg>',
  stats: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><rect x="4" y="11" width="3.5" height="9" rx="1"/><rect x="10.25" y="5" width="3.5" height="15" rx="1"/><rect x="16.5" y="14" width="3.5" height="6" rx="1"/></svg>',
  settings: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><circle cx="12" cy="12" r="3.2"/><path d="M12 2.8v2.6M12 18.6v2.6M2.8 12h2.6M18.6 12h2.6M5.5 5.5l1.8 1.8M16.7 16.7l1.8 1.8M5.5 18.5l1.8-1.8M16.7 7.3l1.8-1.8"/></svg>',
};
const TABS = [
  ["#/", "learn", "Learn"],
  ["#/words", "words", "Words"],
  ["#/stats", "stats", "Stats"],
  ["#/settings", "settings", "Settings"],
];

// The last drawn screen of each tab: shown instantly when you come back, then refreshed.
const screenCache = new Map();

function shell(content, active) {
  const waiting = content?.classList?.contains("spinner");
  if (waiting && screenCache.has(active)) {
    // Coming back to a tab: show it as it was while fresh data loads (no spinner flash).
    const cached = screenCache.get(active);
    if (!cached.isConnected) app.replaceChildren(...cached.nodes);
    return;
  }
  const tabbar = h(
    "nav",
    { class: "tabbar" },
    TABS.map(([href, ico, label]) => h("a", { href, class: href === active ? "active" : "" }, h("span", { class: "ico", html: TAB_ICONS[ico] }), label))
  );
  const screen = h("div", { class: "screen" }, content);
  app.replaceChildren(screen, tabbar);
  if (!waiting) screenCache.set(active, { nodes: [screen, tabbar], get isConnected() { return screen.isConnected; } });
}

function loading() {
  return h("div", { class: "spinner" });
}

async function route() {
  const hash = location.hash || "#/";
  // Highlight the tapped tab right away, before the screen is ready.
  const tab = TABS.find(([href]) => href !== "#/" && hash.startsWith(href))?.[0] || "#/";
  document.querySelectorAll(".tabbar a").forEach((a) => a.classList.toggle("active", a.getAttribute("href") === tab));
  try {
    if (hash.startsWith("#/words")) return await wordsScreen();
    if (hash.startsWith("#/stats")) return await statsScreen();
    if (hash.startsWith("#/settings")) return await settingsScreen();
    if (hash.startsWith("#/gemma")) {
      await gemmaSetupScreen();
      location.hash = "#/";
      return;
    }
    return await homeScreen();
  } catch (e) {
    shell(h("div", { class: "empty" }, h("div", { class: "e" }, "😵"), h("h2", {}, "Something went wrong"), h("p", { class: "muted" }, e.message)), hash);
  }
}
window.addEventListener("hashchange", route);
// Sync brought progress from another device: redraw (unless a lesson is open).
window.addEventListener("bloomko-synced", () => {
  screenCache.clear();
  if (!document.querySelector(".lesson")) route();
});

async function startFlow(fn) {
  try {
    const result = await fn();
    if (result !== undefined) route();
    scheduleReminders();
  } catch (e) {
    toast(e.message, 4000);
  }
}

// ------------------------------------------------------------------ home

const COURSES = {
  zh: { flag: "🇨🇳", name: "Chinese", script: "汉字", sub: "Mandarin · HSK 1–3" },
  ja: { flag: "🇯🇵", name: "Japanese", script: "漢字", sub: "Kana & kanji · JLPT N5–N3" },
  sl: { flag: "🇸🇮", name: "Slovenian", script: "Aa", sub: "A1 · first words" },
};

const LEVEL_INFO = {
  "HSK 1": "Beginner · official HSK 3.0 level 1",
  "HSK 2": "Elementary · official HSK 3.0 level 2",
  "HSK 3": "Intermediate · official HSK 3.0 level 3",
  Kana: "Start here · hiragana and katakana, stroke by stroke",
  "JLPT N5": "Beginner · kanji, kana words and loanwords",
  "JLPT N4": "Elementary · everyday life, work, plans",
  "JLPT N3": "Intermediate · work, news, feelings, travel",
  A1: "Beginner · first words",
  "My words": "Words you added yourself",
};

/** Level cards (JLPT N5, N3 …) for one course. */
function levelCards(levels, current, onPick) {
  return h(
    "div",
    { class: "level-cards" },
    levels.map((l) =>
      h(
        "button",
        { class: "level-card" + (l.name === current ? " on" : ""), onclick: () => onPick(l.name) },
        h("div", { class: "level-top" }, h("b", {}, l.name), h("span", {}, `${l.learned}/${l.total}`)),
        h("small", {}, LEVEL_INFO[l.name] || `${l.total} words`),
        h("i", { style: { width: `${Math.round((100 * l.learned) / Math.max(l.total, 1))}%` } })
      )
    )
  );
}

/** Pick a language, then (for courses with several levels) a level. */
function courseSheet(home, startWith = null) {
  const sheet = h("div", { class: "sheet" });
  const bg = h("div", { class: "sheet-bg", onclick: (e) => e.target === bg && bg.remove() }, sheet);
  const choose = async (lang, level) => {
    const body = { course: lang };
    if (level) body[`section_${lang}`] = level;
    state.settings = await api("/api/settings", { method: "PUT", body });
    screenCache.clear(); // other language: nothing cached applies
    applyCourse();
    bg.remove();
    route();
  };
  const levelsStep = (c) => {
    const info = COURSES[c.lang];
    sheet.replaceChildren(
      h("button", { class: "link-btn back", onclick: languagesStep }, "‹ All languages"),
      h("h2", { style: { margin: "4px 0 4px" } }, `${info.flag} ${info.name}: choose your level`),
      h("p", { class: "muted small", style: { margin: "0 0 14px" } }, "You can switch levels any time by tapping the flag."),
      levelCards(c.levels, c.level || c.levels[0]?.name, (name) => choose(c.lang, name))
    );
  };
  const languagesStep = () => {
    sheet.replaceChildren(
      h("h2", { style: { marginBottom: "14px" } }, "Choose a language"),
      h(
        "div",
        { class: "modes", style: { marginTop: 0 } },
        home.courses.map((c) => {
          const info = COURSES[c.lang];
          const multi = c.levels.length > 1;
          return h(
            "button",
            {
              class: "mode" + (c.lang === "ja" ? " blue" : c.lang === "sl" ? " purple" : ""),
              style: c.lang === home.course ? { outline: "4px solid var(--yellow)" } : {},
              onclick: () => (multi ? levelsStep(c) : choose(c.lang)),
            },
            h("div", { class: "badge-ico" }, info.flag),
            h(
              "div",
              {},
              h("h3", {}, `${info.name} `, h("span", { class: "hz" }, info.script)),
              h("p", {}, multi ? `${c.levels.map((l) => l.name).join(" · ")} · ${c.learned}/${c.total} learned` : `${info.sub} · ${c.learned}/${c.total} learned`)
            ),
            multi ? h("div", { class: "count", style: { background: "rgba(255,255,255,.18)" } }, "›") : null
          );
        })
      ),
      h("p", { class: "muted small center", style: { marginTop: "14px" } }, "Each course keeps its own words and progress. Your streak and XP are shared.")
    );
  };
  const start = startWith && home.courses.find((c) => c.lang === startWith);
  start && start.levels.length > 1 ? levelsStep(start) : languagesStep();
  document.body.append(bg);
}

/** "JLPT N5" → "N5", "HSK 1" → "HSK 1" (fits next to the flag). */
const shortLevel = (name) => String(name || "").replace(/^JLPT\s*/, "");

function topbar(home) {
  const ai = state.aiStatus;
  return h(
    "div",
    { class: "topbar" },
    home.courses
      ? h(
          "button",
          { class: "stat course-btn", title: "Switch language or level", onclick: () => courseSheet(home) },
          h("span", { class: "ico" }, COURSES[home.course].flag),
          home.sections?.length > 1 ? h("span", { class: "course-level" }, shortLevel(home.section)) : null
        )
      : null,
    h(
      "button",
      { class: `stat streak-plant ${home.plant || "seed"}`, title: "Your streak plant", "aria-label": `${home.streak}-day streak`, onclick: () => gardenSheet() },
      plantArt(home.plant || "seed", "ico"),
      home.streak
    ),
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
    { class: "mode" + (next.words.length ? "" : " done"), onclick: async () => {
      if (!next.words.length) return;
      const m = await flows.pickStudyMode({
        title: "Learn new words",
        writingSub: "See, trace and write each word, then a mixed quiz",
        choiceSub: "See each word, then pick meanings, readings and sounds",
      });
      if (m) startFlow(() => flows.learnNew(m));
    } },
    h("div", { class: "badge-ico", html: SVG.sprout }),
    h(
      "div",
      {},
      h("h3", {}, "Learn new words", home.sections?.length > 1 ? h("span", { class: "level-tag" }, home.section) : null),
      next.words.length
        ? h("div", { class: "preview" }, preview)
        : h("p", {}, home.sections?.length > 1 ? `${home.section} complete — tap the flag to pick another level` : "All words learned — add more!")
    )
  );
  const reviewCard = h(
    "button",
    { class: "mode blue" + (home.learned ? "" : " done"), onclick: async () => {
      if (!home.learned) return;
      const d = home.due_by_skill || {};
      const m = await flows.pickStudyMode({
        title: "Practice",
        writingSub: home.due ? `All reviews: writing, speaking, recall · ${home.due} due` : "Nothing due — extra writing practice",
        choiceSub: d.recall ? `Recognise characters & meanings · ${d.recall} due` : "Nothing due — extra recognition practice",
        extraNote: "Choice-only practice doesn't count as writing practice — writing reviews stay due until you write them.",
      });
      if (m) startFlow(() => flows.review({ writing: m.writing, extra: m.writing ? home.due === 0 : !d.recall }));
    } },
    h("div", { class: "badge-ico", html: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M4 12a8 8 0 1 0 2.5-5.8"/><path d="M4 4v4h4"/><path d="M12 8v4l3 2"/></svg>' }),
    h(
      "div",
      {},
      h("h3", {}, "Practice"),
      h("p", {}, !home.learned ? "Learn a few words first" : home.due ? (home.sections?.length > 1 ? `${home.section} words ready for review` : "Words ready for review") : `All caught up${home.sections?.length > 1 ? ` in ${home.section}` : ""}! ${nextDueText(home.next_due)} Tap for extra practice`)
    ),
    home.due + (home.grammar?.due || 0) ? h("div", { class: "count" }, home.due + (home.grammar?.due || 0)) : null
  );
  const g = home.grammar;
  const grammarCard = g?.available
    ? h(
        "button",
        { class: "mode teal" + (g.unlocked ? "" : " soft"), onclick: () => (g.unlocked ? startFlow(flows.grammarLesson) : grammarBook()) },
        h("div", { class: "badge-ico", html: SVG.book }),
        h(
          "div",
          {},
          h("h3", {}, "Grammar"),
          h(
            "p",
            {},
            g.unlocked
              ? `Lesson ${g.lesson} of ${g.lessons} · 3 new grammar points`
              : g.finished
                ? `All ${g.total} ${home.section} grammar points learned · tap to look them up`
                : `Learn ${g.words_to_next} more word${g.words_to_next === 1 ? "" : "s"} to unlock lesson ${g.lesson}${g.learned ? " · tap for your grammar book" : ""}`
          )
        ),
        g.unlocked ? h("div", { class: "count" }, "NEW") : h("div", { class: "lock-ico", html: SVG.lock })
      )
    : null;

  const listenCard = h(
    "button",
    { class: "mode sky", onclick: () => listenSheet(home) },
    h("div", { class: "badge-ico", html: SVG.ear }),
    h("div", {}, h("h3", {}, "Listen, read & talk"), h("p", {}, home.course === "zh" ? "Dictation, stories, tones and chats with Gemma" : home.course === "sl" ? "Dictation and chats with Gemma" : "Dictation, stories and chats with Gemma"))
  );

  const sentenceCard = h(
    "button",
    { class: "mode purple", onclick: () => startFlow(flows.sentences) },
    h("div", { class: "badge-ico", html: SVG.chat }),
    h("div", {}, h("h3", {}, "Sentences"), h("p", {}, state.settings.ai_enabled ? "Write, type & say AI-made sentences" : "Write, type & say sentences"))
  );

  const lookalikeCard = home.lookalikes
    ? h(
        "button",
        { class: "mode orange", onclick: () => startFlow(flows.lookalikes) },
        h("div", { class: "badge-ico", html: SVG.twins }),
        h("div", {}, h("h3", {}, "Look-alikes"), h("p", {}, home.course === "ja" ? "未 or 末? 待, 持 or 特? Tell similar kanji apart" : "未 or 末? 己 or 已? Tell similar characters apart"))
      )
    : null;

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
      planCard(home.plan),
      aiInviteCard(),
      h("div", { class: "modes" }, learnCard, grammarCard, reviewCard, listenCard, sentenceCard, lookalikeCard),
      h("h2", { class: "section-title" }, "This week"),
      weekChart(home.week, home.saved_days),
      h("h2", { class: "section-title" }, `Your ${T.lang()} path`),
      units,
    ],
    "#/"
  );
  gardenNotice(home.garden_notice);
}

/** Today's plan: what's left to keep the garden growing, with a time estimate. */
function planCard(plan) {
  if (!plan) return null;
  const rows = [
    ["Reviews", plan.reviews_done, plan.reviews_left],
    ["New words", plan.new_done, plan.new_left],
  ];
  const left = plan.reviews_left + plan.new_left;
  return h(
    "div",
    { class: "card plan-card" + (left ? "" : " done") },
    h(
      "div",
      { class: "row" },
      h("h3", {}, left ? "🌿 Today's plan" : "🌳 All done for today"),
      h("span", { class: "spacer" }),
      left ? h("span", { class: "plan-time" }, `≈ ${Math.max(1, plan.minutes)} min`) : null
    ),
    h(
      "div",
      { class: "plan-rows" },
      rows.map(([label, done, rest]) =>
        h(
          "div",
          { class: "plan-row" + (rest ? "" : done ? " ok" : " none") },
          h("span", { class: "plan-check" }, rest || !done ? "" : "✓"),
          h("span", {}, label),
          h("span", { class: "spacer" }),
          h("b", {}, rest ? `${done} / ${done + rest}` : done ? `${done} done` : label === "Reviews" ? "nothing due" : "—")
        )
      )
    ),
    left ? null : h("p", { class: "small muted", style: { margin: "6px 0 0" } }, "Your garden is watered. Extra practice is always welcome.")
  );
}

/** Home card inviting learners without a model to download Gemma (Android app only). */
function aiInviteCard() {
  if (!hasGemmaSupport() || state.settings.gemma_card_hidden || gemmaDl.state === "downloading") return null;
  const slot = h("div");
  window.__native.gemma.status().then((st) => {
    if (st.hasModel || st.downloading) return;
    slot.replaceWith(
      h(
        "a",
        { class: "card ai-invite", href: "#/gemma" },
        h("div", { class: "ai-invite-ico" }, "🌱"),
        h("div", { style: { flex: 1 } }, h("h3", {}, "Add your AI tutor"), h("p", { class: "muted small" }, "AI sentences, grading & memory hooks. Free, private, offline.")),
        h("button", {
          class: "icon-btn",
          "aria-label": "Hide",
          onclick: async (e) => {
            e.preventDefault();
            e.currentTarget.closest(".ai-invite").remove();
            state.settings = await api("/api/settings", { method: "PUT", body: { gemma_card_hidden: true } });
            toast("You can add Gemma anytime in Settings");
          },
        }, "✕")
      )
    );
  }).catch(() => {});
  return slot;
}

function nextDueText(nextDue) {
  if (!nextDue) return "";
  const mins = Math.round((new Date(nextDue.replace(" ", "T")) - new Date()) / 60000);
  if (mins < 60) return `Next review in ${Math.max(1, mins)} min.`;
  if (mins < 60 * 24) return `Next review in ${Math.round(mins / 60)} h.`;
  return `Next review in ${Math.round(mins / 1440)} d.`;
}

function weekChart(week, saved = []) {
  const byDay = Object.fromEntries(week.map((d) => [d.day, d.xp]));
  const days = [];
  for (let i = 6; i >= 0; i--) {
    const d = new Date();
    d.setDate(d.getDate() - i);
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
    days.push({ label: d.toLocaleDateString(undefined, { weekday: "narrow" }), xp: byDay[key] || 0, saved: saved.includes(key) });
  }
  const max = Math.max(30, ...days.map((d) => d.xp));
  return h(
    "div",
    { class: "card" },
    h(
      "div",
      { class: "week" },
      days.map((d) =>
        h(
          "div",
          { class: "bar" + (d.xp ? "" : " empty") + (d.saved ? " saved" : ""), title: d.saved ? "Saved by a raindrop" : "" },
          d.saved ? dayLeafArt("saved", "week-dry") : h("span", {}, d.xp || ""),
          h("i", { style: { height: `${Math.max(4, (80 * d.xp) / max)}px` } }),
          h("span", {}, d.label)
        )
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
      const body = h("div", { class: "unit-body" });
      // Word chips are only built when a unit is opened (a level can have dozens of units).
      const fill = () => {
        if (body.childElementCount) return;
        body.append(
          ...(byUnit[u.name] || []).map((w) =>
            h(
              "button",
              { class: "chip" + (w.cards ? " learned" : " locked") + (w.lapses > 2 ? " weak" : ""), onclick: () => wordSheet(w) },
              h("span", { class: "hz" }, w.hanzi),
              h("span", { class: "py" }, w.cards ? w.pinyin : "·")
            )
          )
        );
      };
      const started = u.learned > 0 && !complete;
      body.hidden = !(started || (i === 0 && !u.learned));
      if (!body.hidden) fill();
      return h(
        "div",
        { class: "unit" },
        h(
          "div",
          { class: "unit-head", style: { "--c": UNIT_COLORS[i % UNIT_COLORS.length] }, onclick: () => { fill(); body.hidden = !body.hidden; } },
          h("div", {}, h("div", { class: "sub" }, `UNIT ${i + 1} · ${u.learned}/${u.total}`), h("h3", {}, u.name)),
          h("div", { class: "crown" }, complete ? "👑" : started ? "📖" : "🔒")
        ),
        body
      );
    })
  );
}

// ------------------------------------------------------------------ listen & read

function listenSheet(home) {
  const bg = h("div", { class: "sheet-bg", onclick: (e) => e.target === bg && bg.remove() });
  const option = (ico, title, sub, fn) =>
    h("button", { class: "mode-opt", onclick: () => { bg.remove(); fn(); } }, h("span", { class: "mo-ico" }, ico), h("span", {}, h("b", {}, title), h("small", {}, sub)));
  bg.append(
    h(
      "div",
      { class: "sheet" },
      h("h2", { style: { margin: "0 0 4px" } }, "Listen, read & talk"),
      h("p", { class: "muted small", style: { margin: "0 0 14px" } }, "Train your ear, read little stories and have a real chat — all with the words you know."),
      option("🎧", "Dictation & listening", isSl() ? "Hear a sentence, type it — or pick what it means" : "Hear a sentence, write it by hand — or pick what it means", () => startFlow(flows.listening)),
      home.course !== "sl" ? option("📖", "Stories", `Short graded stories for ${home.section} — tap any word`, () => storiesSheet()) : null,
      home.course === "zh" ? option("🎵", "Tones", "Hear the tones — and see the pitch of your own voice", () => startFlow(flows.tones)) : null,
      option("💬", "Talk", state.settings.ai_enabled ? "Chat with Gemma — at a café, in a shop, asking the way…" : "Chat with Gemma (turn on AI in Settings)", () => talkSheet())
    )
  );
  document.body.append(bg);
}

async function storiesSheet() {
  const data = await api("/api/stories");
  const bg = h("div", { class: "sheet-bg", onclick: (e) => e.target === bg && bg.remove() });
  const gen = state.settings.ai_enabled
    ? h(
        "button",
        {
          class: "btn ghost small",
          onclick: async (e) => {
            const b = e.currentTarget;
            b.disabled = true;
            b.textContent = "✨ Gemma is writing…";
            try {
              const r = await api("/api/stories/generate", { method: "POST" });
              bg.remove();
              storyReader(r.id);
            } catch (err) {
              toast(err.message, 4000);
              b.disabled = false;
              b.textContent = "✨ New story from my words";
            }
          },
        },
        "✨ New story from my words"
      )
    : null;
  bg.append(
    h(
      "div",
      { class: "sheet" },
      h("h2", { style: { margin: "0 0 4px" } }, `${data.section} stories`),
      h("p", { class: "muted small", style: { margin: "0 0 12px" } }, data.stories.length ? "The bar shows how many of the story's words you already know." : "No stories for this level yet."),
      gen,
      h(
        "div",
        { class: "story-list" },
        data.stories.map((st) =>
          h(
            "button",
            { class: "story-item" + (st.done ? " done" : ""), onclick: () => { bg.remove(); storyReader(st.id); } },
            h("div", {}, h("b", { class: "hz" }, st.title), h("small", {}, `${st.ai ? "✨ " : ""}${st.title_en} · ${st.sentences} sentences`)),
            h("div", { class: "story-known" }, h("i", { style: { width: `${st.known}%` } }), h("span", {}, st.done ? `✓ ${st.best ?? ""}%` : `${st.known}% known`))
          )
        )
      ),
      h("button", { class: "btn", style: { marginTop: "14px" }, onclick: () => bg.remove() }, "Close")
    )
  );
  document.body.append(bg);
}

/** Full-screen reader: tap words for reading and meaning, listen, then answer questions. */
async function storyReader(id) {
  const st = await api(`/api/stories/${encodeURIComponent(id)}`);
  const pop = h("div", { class: "word-pop", hidden: true });
  const showWord = (tok, el) => {
    document.querySelectorAll(".tok.on").forEach((x) => x.classList.remove("on"));
    el.classList.add("on");
    const status = tok.word_id ? (tok.learned ? "✓ learned" : `in ${tok.level}`) : "not in your course";
    pop.replaceChildren(
      h("div", { class: "row", style: { alignItems: "center", gap: "10px" } }, h("b", { class: "hz wp-word" }, tok.t), h("span", { class: "py" }, tok.r), h("span", { class: "spacer" }), iconBtn("speaker", "speaker sm", () => speak(tok.t), "Listen")),
      h("div", { class: "wp-mean" }, tok.m || "—"),
      h(
        "div",
        { class: "row", style: { alignItems: "center", marginTop: "6px" } },
        h("small", { class: "muted" }, status),
        h("span", { class: "spacer" }),
        !tok.word_id && tok.m
          ? h(
              "button",
              {
                class: "btn ghost small",
                onclick: async (e) => {
                  try {
                    await api("/api/words", { method: "POST", body: { hanzi: tok.t, pinyin: tok.r, english: tok.m } });
                    tok.word_id = -1;
                    e.currentTarget.replaceWith(h("small", { class: "good" }, "✓ Added to My words"));
                  } catch (err) {
                    toast(err.message, 3000);
                  }
                },
              },
              "+ Add to my words"
            )
          : null
      )
    );
    pop.hidden = false;
    speak(tok.t);
  };
  const sentences = st.sentences.map((x) => {
    const en = h("button", { class: "g-en-reveal small", onclick: () => en.replaceWith(h("div", { class: "st-en small" }, x.en)) }, "👁 Translation");
    return h(
      "div",
      { class: "st-sent" },
      h(
        "p",
        { class: "st-text hz" },
        x.tokens.map((tok) => (tok.punct ? h("span", {}, tok.t) : h("span", { class: "tok" + (tok.word_id && !tok.learned ? " new" : "") + (!tok.word_id ? " out" : ""), onclick: (e) => showWord(tok, e.currentTarget) }, tok.t)))
      ),
      h("div", { class: "row", style: { alignItems: "center", gap: "8px" } }, iconBtn("speaker", "speaker sm", () => speak(x.text), "Listen"), en)
    );
  });
  let playing = false;
  const playAll = h(
    "button",
    {
      class: "btn ghost small auto",
      onclick: async () => {
        playing = !playing;
        playAll.textContent = playing ? "■ Stop" : "▶ Listen to the story";
        for (const x of st.sentences) {
          if (!playing) break;
          await speak(x.text);
          await new Promise((r) => setTimeout(r, 350));
        }
        playing = false;
        playAll.textContent = "▶ Listen to the story";
      },
    },
    "▶ Listen to the story"
  );
  const close = () => { playing = false; stopSpeaking(); root.remove(); };
  const root = h(
    "div",
    { class: "lesson story-reader" },
    h("div", { class: "lesson-top" }, h("button", { class: "icon-btn", "aria-label": "Close", onclick: close }, "✕"), h("div", { class: "st-head" }, h("b", { class: "hz" }, st.title), h("small", {}, st.title_en))),
    h(
      "div",
      { class: "lesson-body st-body", onclick: (e) => { if (!e.target.closest(".tok, .word-pop")) { pop.hidden = true; document.querySelectorAll(".tok.on").forEach((x) => x.classList.remove("on")); } } },
      h("p", { class: "muted small" }, "Tap any word to see its reading and meaning. Words in yellow you haven't learned yet."),
      playAll,
      sentences
    ),
    pop,
    h(
      "div",
      { class: "lesson-foot" },
      h(
        "div",
        { class: "inner" },
        h("button", { class: "btn", onclick: () => { close(); startFlow(() => flows.storyQuestions(st)); } }, st.questions?.length ? `Answer ${st.questions.length} questions` : "Finish story")
      )
    )
  );
  document.body.append(root);
}

// ------------------------------------------------------------------ grammar book

/** The level's grammar: learned points with pattern, explanation and examples; the rest locked. */
async function grammarBook() {
  const b = await api("/api/grammar/book");
  const bg = h("div", { class: "sheet-bg", onclick: (e) => e.target === bg && bg.remove() });
  const item = (p) =>
    p.learned
      ? h(
          "details",
          { class: "g-book-item" },
          h("summary", {}, h("b", {}, p.title), h("small", {}, p.short)),
          h("div", { class: "g-pattern hz" }, p.pattern),
          h("p", { class: "g-explain" }, p.explain),
          p.examples.slice(0, 3).map((x) => h("div", { class: "g-example" }, h("div", { class: "g-text hz" }, x.text), x.reading && x.reading !== x.text ? h("div", { class: "small muted" }, x.reading) : null, h("div", { class: "small" }, x.en)))
        )
      : h("div", { class: "g-book-item locked" }, h("span", { html: SVG.lock }), p.title);
  bg.append(
    h(
      "div",
      { class: "sheet" },
      h("h2", { style: { margin: "0 0 4px" } }, `${b.section} grammar`),
      h("p", { class: "muted small", style: { margin: "0 0 14px" } }, b.finished ? `All ${b.total} points learned.` : `${b.learned} of ${b.total} learned · next lesson unlocks after ${b.words_to_next} more word${b.words_to_next === 1 ? "" : "s"}.`),
      h("div", { class: "g-book" }, b.points.map(item)),
      h("button", { class: "btn", style: { marginTop: "14px" }, onclick: () => bg.remove() }, "Close")
    )
  );
  document.body.append(bg);
}

// ------------------------------------------------------------------ word sheet

function wordSheet(w) {
  const demo = isSl()
    ? { el: h("div", { class: "sl-word" }, h("div", { class: "sl-word-text" }, w.hanzi), genderTag(w)) }
    : strokeDemo(w.hanzi, { size: Math.min(160, Math.floor((window.innerWidth - 80) / [...w.hanzi].length)) });
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
          ? h("button", { class: "btn ghost small", style: { "--fg": "var(--red)" }, onclick: async () => { if (!(await confirmDialog({ icon: "🗑️", title: `Delete ${w.hanzi}?`, message: "Its review progress will be removed too.", cancelLabel: "Keep", confirmLabel: "Delete", danger: true }))) return; await api(`/api/words/${w.id}`, { method: "DELETE" }); bg.remove(); route(); } }, "Delete")
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
let wordSection = "all"; // level: "all" or a section name such as "JLPT N3"
let wordsObserver = null;

async function wordsScreen() {
  shell(loading(), "#/words");
  const words = await api("/api/words");
  const list = h("div", { class: "list" });
  const count = h("p", { class: "muted small" });
  // Levels present in this course, in path order (JLPT N5, JLPT N3, My words…)
  const sections = [...new Set(words.map((w) => w.section).filter(Boolean))];
  const customLevels = new Set(words.filter((w) => w.source === "custom").map((w) => w.section));
  if (!sections.includes(wordSection)) wordSection = "all";
  const render = () => {
    const q = wordSearch.toLowerCase();
    const inLevel = words.filter((w) => wordSection === "all" || w.section === wordSection);
    count.textContent = `${inLevel.filter((w) => w.cards).length} of ${inLevel.length} learned${wordSection === "all" ? "" : ` in ${wordSection}`}`;
    const shown = inLevel.filter((w) => {
      if (wordFilter === "learned" && !w.cards) return false;
      if (wordFilter === "new" && w.cards) return false;
      if (wordFilter === "weak" && !(w.lapses > 0)) return false;
      if (wordFilter === "mine" && w.source !== "custom") return false;
      return !q || w.hanzi.includes(q) || w.english.toLowerCase().includes(q) || w.pinyin.toLowerCase().includes(q);
    });
    const item = (w) => {
      const s = Math.min(5, Math.ceil(Math.log2(1 + (w.strength || 0)) * 1.3));
      return h(
        "div",
        { class: "list-item", onclick: () => wordSheet(w), style: { cursor: "pointer" } },
        h("div", { class: "hz" }, w.hanzi),
        h("div", { class: "meta" }, h("div", { class: "py" }, w.pinyin), h("div", { class: "en" }, w.english)),
        w.cards ? h("div", { class: "strength" }, [0, 1, 2, 3, 4].map((i) => h("i", { class: i < s ? "on" : "" }))) : h("span", { class: "tag blue" }, "new")
      );
    };
    if (!shown.length) {
      list.replaceChildren(h("div", { class: "empty" }, h("div", { class: "e" }, "🔍"), h("p", { class: "muted" }, "No words here")));
      return;
    }
    // Draw the first screenful at once and the rest while scrolling (levels have thousands of words).
    let drawn = 0;
    const sentinel = h("div", { class: "list-more" });
    const more = () => {
      const next = shown.slice(drawn, drawn + (drawn ? 120 : 60));
      drawn += next.length;
      sentinel.before(...next.map(item));
      if (drawn >= shown.length) { observer.disconnect(); sentinel.remove(); }
    };
    const observer = new IntersectionObserver((es) => es.some((e) => e.isIntersecting) && more(), { rootMargin: "800px" });
    wordsObserver?.disconnect();
    wordsObserver = observer;
    list.replaceChildren(sentinel);
    more();
    if (sentinel.isConnected) observer.observe(sentinel);
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
  const levels = [["all", "All levels"], ...sections.map((x) => [x, x])];
  const lbtns = levels.map(([k, label]) =>
    h("button", { class: k === wordSection ? "on" : "", onclick: () => { wordSection = k; lbtns.forEach((b, i) => b.classList.toggle("on", levels[i][0] === k)); render(); } }, label)
  );
  render();
  shell(
    [
      h(
        "div",
        { class: "topbar" },
        h("h2", {}, "Words"),
        h("span", { class: "spacer" }),
        canReadPhotos() ? h("button", { class: "btn ghost small", onclick: () => photoSheet(() => { screenCache.clear(); route(); }), "aria-label": "Words from a photo" }, "📷") : null,
        h("button", { class: "btn ghost small", onclick: importSheet }, "⇪ Import"),
        h("button", { class: "btn small", onclick: addWordSheet }, "+ Add")
      ),
      h("input", { class: "input search", placeholder: isSl() ? "Search Slovenian or English" : isJa() ? "Search 漢字, reading or English" : "Search 汉字, pinyin or English", value: wordSearch, oninput: (e) => { wordSearch = e.target.value; render(); } }),
      sections.length > 1 ? h("div", { class: "section-pick level-filter", role: "group", "aria-label": "Level" }, lbtns) : null,
      h("div", { class: "filter-row" }, fbtns),
      customLevels.has(wordSection)
        ? h(
            "div",
            { class: "row list-tools" },
            h("span", { class: "muted small" }, "Your own list"),
            h("span", { class: "spacer" }),
            h("button", { class: "link-btn danger", onclick: () => deleteList(wordSection) }, "Delete this list")
          )
        : null,
      count,
      list,
    ],
    "#/words"
  );
}

async function deleteList(name) {
  const ok = await confirmDialog({ icon: "🗑️", title: `Delete “${name}”?`, message: "All its words and their review progress will be removed.", cancelLabel: "Keep", confirmLabel: "Delete", danger: true });
  if (!ok) return;
  const r = await api(`/api/lists/${encodeURIComponent(name)}`, { method: "DELETE" });
  toast(`Deleted ${r.removed} words`);
  wordSection = "all";
  route();
}

const IMPORT_EXAMPLE = {
  zh: "朋友, péng you, friend\n电脑, computer\n喜欢\txǐ huan\tto like",
  ja: "友達, ともだち, friend\n電車, densha, train\n食べる\tたべる\tto eat",
  sl: "kolo, bicycle\nhiša, HI-ša, house\njabolko\tapple",
};

/** Import your own list (from a textbook, Anki, Pleco…): paste lines or pick a .txt / .csv file. */
function importSheet() {
  const lang = state.settings.course || "zh";
  const name = h("input", { class: "input", placeholder: "e.g. Textbook lesson 3", maxlength: 40 });
  const text = h("textarea", { class: "input import-text", rows: 7, placeholder: IMPORT_EXAMPLE[lang], spellcheck: "false" });
  const report = h("div", { class: "import-report small" });
  const go = h("button", { class: "btn", disabled: true }, "Import");
  const file = h("input", { type: "file", accept: ".txt,.csv,.tsv,text/plain,text/csv", hidden: true });
  file.onchange = async () => {
    const f = file.files[0];
    if (!f) return;
    text.value = await f.text();
    if (!name.value) name.value = f.name.replace(/\.[^.]+$/, "").slice(0, 40);
    preview();
  };
  let timer = null;
  let last = null;
  async function preview() {
    clearTimeout(timer);
    if (!text.value.trim()) { report.replaceChildren(); go.disabled = true; return; }
    try {
      last = await api("/api/words/import", { method: "POST", body: { text: text.value, list: name.value, preview: true } });
    } catch (e) {
      report.replaceChildren(h("p", { class: "bad" }, e.message));
      go.disabled = true;
      return;
    }
    const n = last.added.length;
    go.disabled = !n;
    go.textContent = n ? `Import ${n} word${n === 1 ? "" : "s"}` : "Import";
    report.replaceChildren(
      h("p", { class: n ? "good" : "muted" }, n ? `✓ ${n} ready: ${last.added.slice(0, 8).map((w) => w.hanzi).join(" ")}${n > 8 ? " …" : ""}` : "No words found yet"),
      last.skipped.length
        ? h(
            "details",
            {},
            h("summary", {}, `${last.skipped.length} line${last.skipped.length === 1 ? "" : "s"} skipped`),
            h("ul", {}, last.skipped.slice(0, 30).map((x) => h("li", {}, h("b", {}, x.line), " — ", x.reason)))
          )
        : null
    );
  }
  const later = () => { clearTimeout(timer); timer = setTimeout(preview, 350); };
  text.addEventListener("input", later);
  name.addEventListener("input", later);
  go.onclick = async () => {
    go.disabled = true;
    try {
      const r = await api("/api/words/import", { method: "POST", body: { text: text.value, list: name.value } });
      bg.remove();
      toast(`Added ${r.added.length} words to “${r.list}”. Pick it as your level to learn them.`, 4000);
      wordSection = r.list;
      route();
    } catch (e) {
      toast(e.message, 4000);
      go.disabled = false;
    }
  };
  const bg = h(
    "div",
    { class: "sheet-bg", onclick: (e) => e.target === bg && bg.remove() },
    h(
      "div",
      { class: "sheet" },
      h("h2", { style: { marginBottom: "4px" } }, "Import a word list"),
      h(
        "p",
        { class: "muted small", style: { margin: "0 0 14px" } },
        lang === "zh"
          ? "One word per line: characters, pinyin (optional — added automatically), meaning."
          : lang === "ja"
            ? "One word per line: word, reading in hiragana or romaji (not needed for kana words), meaning."
            : "One word per line: Slovenian word, pronunciation (optional), meaning.",
        " Separate with commas, tabs or semicolons — exports from Anki or Pleco work too."
      ),
      h("div", { class: "field" }, h("label", {}, "List name"), name),
      h("div", { class: "field" }, h("label", {}, "Words"), text),
      h("button", { class: "link-btn", onclick: () => file.click() }, "📁 Or choose a .txt / .csv file"),
      file,
      report,
      go
    )
  );
  document.body.append(bg);
  setTimeout(() => text.focus(), 200);
}

function addWordSheet() {
  const hz = h("input", { class: "input hz", placeholder: isSl() ? "Slovenian word" : isJa() ? "漢字" : "汉字", style: { fontSize: "24px" } });
  const py = h("input", { class: "input", placeholder: isSl() ? "pronunciation, e.g. ZDRA-vo (optional)" : isJa() ? "reading in hiragana or romaji" : "pinyin (auto-filled if empty)" });
  const en = h("input", { class: "input", placeholder: "English meaning" });
  const q = h("input", { class: "input", placeholder: isSl() ? "e.g. “bicycle” or “kolo”" : isJa() ? "e.g. “bicycle” or “jitensha”" : "e.g. “bicycle” or “zixingche”" });
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
      h("div", { class: "field" }, h("label", {}, isSl() ? "Pronunciation" : isJa() ? "Reading" : "Pinyin"), py),
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

const SVG = {
  leaf: '<svg viewBox="0 0 24 24" fill="none" stroke="#3d5a40" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M12 21c0-6-1-10-6-14 7 0 12 4 12 10-2 1-4 2-6 4z"/><path d="M12 21c-1-4-2-7-5-10M9 15H6M11 18H7"/></svg>',
  hourglass: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"><path d="M6 3h12M6 21h12M7 3c0 5 10 6 10 9s-10 4-10 9M17 3c0 5-10 6-10 9s10 4 10 9"/></svg>',
  book: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M12 6c-2-1.5-5-2-8-1.5V19c3-.5 6 0 8 1.5 2-1.5 5-2 8-1.5V4.5C17 4 14 4.5 12 6z"/><path d="M12 6v14.5"/><path d="M12 9c1-2 2-3 4-3.5M12 9c-1-2-2-3-4-3.5"/></svg>',
  sprout: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M12 21v-9"/><path d="M12 12C12 8 9 5 4 5c0 4 3 7 8 7zM12 10c0-3 2-6 8-6 0 4-3 6-8 6z"/></svg>',
  plant: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M12 20v-9"/><path d="M12 15c-4 0-7-2-7-6 4 0 7 2 7 6zM12 11c0-4 3-7 7-7 0 4-3 7-7 7z"/><path d="M7 20h10"/></svg>',
  flame: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3c1 4 6 6 6 11a6 6 0 0 1-12 0c0-3 2-5 3-7 1 2 2 3 3 3 0-2-1-4 0-7z"/></svg>',
  twins: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M3 19c0-6 3-10 8-11-.5 6-3 10-8 11z"/><path d="M21 19c0-6-3-10-8-11 .5 6 3 10 8 11z"/><path d="M3 19l5-6M21 19l-5-6"/></svg>',
  chat: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"><path d="M4 5h16v11H9l-5 4z"/></svg>',
  star: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"><path d="M12 3l2.7 5.6 6.1.9-4.4 4.3 1 6.1L12 17l-5.4 2.9 1-6.1L3.2 9.5l6.1-.9z"/></svg>',
  ear: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M7 9a5 5 0 0 1 10 0c0 3-3 4-3 7a3 3 0 0 1-5.5 1.6"/><path d="M10 9.5a2 2 0 0 1 4 0c0 1.2-1 1.6-1.5 2.5"/></svg>',
  lock: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="5" y="11" width="14" height="9" rx="2"/><path d="M8 11V8a4 4 0 0 1 8 0v3"/></svg>',
  brush: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M20 4L10 14"/><path d="M10 14c-3 0-5 2-5 5-1 1-2 1-2 1 4 1 8 0 9-3 1-1 0-2-2-3z"/></svg>',
};
const svgEl = (markup, attrs = {}) => {
  const span = h("span", attrs);
  span.innerHTML = markup;
  return span.firstChild;
};

/** Smooth line through points (Catmull-Rom → cubic Bézier). */
const dkey = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
const shiftDays = (d, n) => { const x = new Date(d); x.setDate(x.getDate() + n); return x; };
const fmtDate = (d, opts) => d.toLocaleDateString("en-GB", opts);

const PERIODS = {
  week: { label: "Week", days: 7, unit: "day" },
  month: { label: "Month", days: 30, unit: "day" },
  quarter: { label: "3 months", days: 84, unit: "week" },
};

/** Points for a period ending today (offset = how many periods back). Daily, or weekly for 3 months. */
function periodPoints(byDay, saved, period, offset = 0) {
  const P = PERIODS[period];
  const end = shiftDays(new Date(), -offset * P.days);
  const pts = [];
  const step = P.unit === "week" ? 7 : 1;
  for (let i = P.days - step; i >= 0; i -= step) {
    const start = shiftDays(end, -i - (step - 1));
    const last = shiftDays(end, -i);
    let xp = 0, words = 0, secs = 0, active = 0, isSaved = false;
    for (let d = new Date(start); d <= last; d = shiftDays(d, 1)) {
      const a = byDay[dkey(d)];
      if (saved.has(dkey(d))) isSaved = true;
      if (!a) continue;
      xp += a.xp || 0;
      words += a.new_words || 0;
      secs += a.seconds || 0;
      if (a.xp > 0) active++;
    }
    pts.push({
      xp, words, secs, active, saved: step === 1 && isSaved,
      label: step === 1 ? (P.days === 7 ? fmtDate(last, { weekday: "short" }) : fmtDate(last, { day: "numeric", month: "short" })) : fmtDate(start, { day: "numeric", month: "short" }),
      tip: step === 1 ? fmtDate(last, { weekday: "short", day: "numeric", month: "short" }) : `${fmtDate(start, { day: "numeric", month: "short" })} – ${fmtDate(last, { day: "numeric", month: "short" })}`,
    });
  }
  return pts;
}

/** Monotone cubic path (Fritsch–Carlson): smooth, but never overshoots the data (no dips below zero). */
function monotonePath(pts) {
  const n = pts.length;
  if (n < 2) return "";
  const dx = [], m = [], t = [];
  for (let i = 0; i < n - 1; i++) { dx[i] = pts[i + 1][0] - pts[i][0]; m[i] = (pts[i + 1][1] - pts[i][1]) / dx[i]; }
  t[0] = m[0]; t[n - 1] = m[n - 2];
  for (let i = 1; i < n - 1; i++) t[i] = m[i - 1] * m[i] <= 0 ? 0 : (m[i - 1] + m[i]) / 2;
  for (let i = 0; i < n - 1; i++) {
    if (m[i] === 0) { t[i] = 0; t[i + 1] = 0; continue; }
    const a = t[i] / m[i], b = t[i + 1] / m[i], h2 = a * a + b * b;
    if (h2 > 9) { const k = 3 / Math.sqrt(h2); t[i] = k * a * m[i]; t[i + 1] = k * b * m[i]; }
  }
  let d = `M${pts[0][0]},${pts[0][1]}`;
  for (let i = 0; i < n - 1; i++) {
    const h3 = dx[i] / 3;
    d += ` C${(pts[i][0] + h3).toFixed(1)},${(pts[i][1] + t[i] * h3).toFixed(1)} ${(pts[i + 1][0] - h3).toFixed(1)},${(pts[i + 1][1] - t[i + 1] * h3).toFixed(1)} ${pts[i + 1][0]},${pts[i + 1][1]}`;
  }
  return d;
}

const NSVG = "http://www.w3.org/2000/svg";
const sv = (tag, attrs = {}, text) => {
  const el = document.createElementNS(NSVG, tag);
  for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, v);
  if (text != null) el.textContent = text;
  return el;
};

/** XP as bars, new words as a line (own scale); tap a bar for details. */
function progressChart(pts, onPick) {
  const W = 340, H = 170, padL = 6, padR = 6, top = 12, bottom = 28;
  const base = H - bottom;
  const n = pts.length;
  const slot = (W - padL - padR) / n;
  const maxXp = Math.max(20, ...pts.map((p) => p.xp));
  const maxW = Math.max(3, ...pts.map((p) => p.words));
  const cx = (i) => padL + slot * (i + 0.5);
  const yXp = (v) => base - (base - top) * (v / maxXp);
  const yW = (v) => base - (base - top) * (v / maxW);
  const svg = sv("svg", { class: "journey-chart", viewBox: `0 0 ${W} ${H}`, role: "img", "aria-label": "XP per day as bars and new words as a line" });
  for (const f of [0.25, 0.5, 0.75]) svg.append(sv("line", { x1: padL, x2: W - padR, y1: top + (base - top) * f, y2: top + (base - top) * f, class: "pc-grid" }));
  svg.append(sv("line", { x1: padL, x2: W - padR, y1: base, y2: base, class: "pc-axis" }));
  const bw = Math.max(3, Math.min(26, slot * 0.62));
  const bars = pts.map((p, i) => {
    const y = yXp(p.xp);
    const hgt = Math.max(p.xp ? 3 : 0, base - y);
    const r = sv("rect", { x: cx(i) - bw / 2, y: base - hgt, width: bw, height: hgt, rx: Math.min(4, bw / 2), class: "pc-bar" });
    svg.append(r);
    return r;
  });
  const linePts = pts.map((p, i) => [+cx(i).toFixed(1), +yW(p.words).toFixed(1)]);
  svg.append(sv("path", { d: monotonePath(linePts), class: "pc-line" }));
  if (n <= 31) linePts.forEach(([x, y], i) => pts[i].words && svg.append(sv("circle", { cx: x, cy: y, r: n > 14 ? 2.5 : 3.5, class: "pc-dot" })));
  // Raindrop-saved days: a small dried leaf under the axis.
  pts.forEach((p, i) => {
    if (!p.saved) return;
    const g = sv("g", { transform: `translate(${cx(i) - 5} ${base - 12}) scale(.42)` });
    g.append(sv("path", { d: "M5 19 C4 12 8 6 18 4 C19 8 18 11 15 13 C13 14.5 13 16 15 17 C11 19.5 7.5 19.8 5 19 Z", class: "pc-dry" }));
    svg.append(g);
  });
  const every = n <= 7 ? 1 : n <= 12 ? 3 : 7;
  pts.forEach((p, i) => {
    if ((n - 1 - i) % every) return;
    // Keep the first/last labels inside the chart.
    const edge = n > 7 && i === n - 1 ? { "text-anchor": "end", x: W - 1 } : n > 7 && i === 0 ? { "text-anchor": "start", x: 1 } : {};
    svg.append(sv("text", { x: cx(i), y: H - 6, "text-anchor": "middle", class: "pc-label", ...edge }, p.label));
  });
  // One invisible hit area per bar slot.
  const sel = sv("rect", { x: 0, y: top - 6, width: slot, height: base - top + 6, class: "pc-sel" });
  svg.insertBefore(sel, svg.firstChild);
  const pick = (i) => {
    bars.forEach((b, k) => b.classList.toggle("on", k === i));
    sel.setAttribute("x", padL + slot * i);
    onPick(pts[i]);
  };
  pts.forEach((_, i) => {
    const hit = sv("rect", { x: padL + slot * i, y: 0, width: slot, height: H, class: "pc-hit" });
    hit.addEventListener("click", () => pick(i));
    svg.append(hit);
  });
  return { svg, pick };
}

function progressCard(s) {
  const byDay = Object.fromEntries((s.days || []).map((d) => [d.day, d]));
  const saved = new Set(s.saved_days || []);
  let period = "month";
  try { period = localStorage.getItem("journey_period") || "month"; } catch { /* ignore */ }
  if (!PERIODS[period]) period = "month";
  const tabs = h("div", { class: "section-pick pc-tabs", role: "tablist" });
  const summary = h("div", { class: "pc-summary" });
  const chartBox = h("div");
  const detail = h("div", { class: "pc-detail" });
  const mins = (secs) => Math.round(secs / 60);

  function render() {
    tabs.replaceChildren(
      ...Object.entries(PERIODS).map(([k, P]) =>
        h("button", { class: k === period ? "on" : "", role: "tab", onclick: () => { period = k; try { localStorage.setItem("journey_period", k); } catch { /* ignore */ } render(); } }, h("b", {}, P.label))
      )
    );
    const pts = periodPoints(byDay, saved, period);
    const prev = periodPoints(byDay, saved, period, 1);
    const sum = (arr, f) => arr.reduce((a, p) => a + p[f], 0);
    const xp = sum(pts, "xp"), prevXp = sum(prev, "xp");
    const activeDays = sum(pts, "active");
    const words = sum(pts, "words");
    const avgMin = activeDays ? mins(sum(pts, "secs") / activeDays) : 0;
    const change = prevXp ? Math.round(((xp - prevXp) / prevXp) * 100) : null;
    summary.replaceChildren(
      h("div", { class: "pc-stat" }, h("b", {}, activeDays), h("span", {}, activeDays === 1 ? "day of study" : "days of study")),
      h("div", { class: "pc-stat" }, h("b", {}, xp), h("span", {}, "XP"), change != null && xp + prevXp > 0 ? h("em", { class: change >= 0 ? "up" : "down" }, `${change >= 0 ? "▲" : "▼"} ${Math.abs(change)}%`) : null),
      h("div", { class: "pc-stat" }, h("b", {}, words), h("span", {}, "new words")),
      h("div", { class: "pc-stat" }, h("b", {}, avgMin), h("span", {}, "min / study day"))
    );
    const { svg, pick } = progressChart(pts, (p) => {
      detail.replaceChildren(
        h("b", {}, p.tip),
        p.xp || p.words ? ` · ${p.xp} XP · ${p.words} new ${p.words === 1 ? "word" : "words"}${p.secs ? ` · ${mins(p.secs)} min` : ""}` : p.saved ? " · saved by a raindrop 🍂" : " · no practice"
      );
    });
    chartBox.replaceChildren(svg);
    pick(pts.length - 1);
  }
  render();
  return h(
    "div",
    { class: "card" },
    tabs,
    summary,
    chartBox,
    detail,
    h("div", { class: "journey-legend" }, h("span", {}, h("i", { class: "bar" }), "XP"), h("span", {}, h("i", { style: { background: "#e2bd4e" } }), "New words"), saved.size ? h("span", {}, "🍂 raindrop") : null)
  );
}

function achievements(s, learned, best, sentences, level) {
  const list = [
    { icon: "sprout", title: "First steps", goal: 1, have: learned, unit: "word", date: s.first_day },
    { icon: "book", title: "10 words", goal: 10, have: learned, unit: "words" },
    { icon: "plant", title: "Daily streak ×7", goal: 7, have: best, unit: "days", active: s.streak >= 7 },
    { icon: "chat", title: "First sentence", goal: 1, have: sentences, unit: "sentence" },
    { icon: "plant", title: "Daily streak ×10", goal: 10, have: best, unit: "days", active: s.streak >= 10 },
    { icon: "book", title: "50 words", goal: 50, have: learned, unit: "words" },
    { icon: "star", title: "Level 5", goal: 5, have: level, unit: "" },
    { icon: "brush", title: "100 words", goal: 100, have: learned, unit: "words" },
    { icon: "plant", title: "Daily streak ×30", goal: 30, have: best, unit: "days", active: s.streak >= 30 },
    { icon: "chat", title: "50 sentences", goal: 50, have: sentences, unit: "sentences" },
    { icon: "book", title: "250 words", goal: 250, have: learned, unit: "words" },
    { icon: "star", title: "Level 10", goal: 10, have: level, unit: "" },
  ];
  const done = list.filter((a) => a.have >= a.goal);
  const next = list.filter((a) => a.have < a.goal).slice(0, 2);
  const colors = { sprout: "#9cbc8f", book: "#a9c6da", flame: "#e08d6c", plant: "#8cc06b", chat: "#e2bd4e", star: "#e2bd4e", brush: "#c9b48a" };
  const row = (a, locked) =>
    h(
      "div",
      { class: "achv" + (locked ? " locked" : "") },
      h("div", { class: "achv-ico", style: { color: colors[a.icon] } }, svgEl(SVG[a.icon])),
      h(
        "div",
        {},
        h("b", {}, a.title),
        h("span", {}, locked ? `${Math.min(a.have, a.goal)} / ${a.goal}${a.unit ? " " + a.unit : ""}` : a.active ? "Active" : a.date ? `Completed ${new Date(a.date).toLocaleDateString(undefined, { day: "numeric", month: "short" })}` : "Completed")
      )
    );
  return [...done.reverse().map((a) => row(a, false)), ...next.map((a) => row(a, true))];
}

async function statsScreen() {
  shell(loading(), "#/stats");
  const s = await api("/api/stats");
  const days = s.days || [];
  const totalXp = s.total_xp ?? days.reduce((a, d) => a + d.xp, 0);
  const level = s.level ?? Math.floor(Math.sqrt(totalXp / 20)) + 1;
  const learned = s.learned_total ?? Math.max(0, ...(s.skills || []).map((k) => k.n));
  const sentences = s.sentences_total ?? days.reduce((a, d) => a + (d.sentences || 0), 0);
  const best = Math.max(s.best_streak || 0, s.streak || 0);
  const hours = (s.study_seconds_month || 0) / 3600;
  const skillNames = { write: ["✍️", "Writing"], speak: ["🎤", "Speaking"], recall: ["🧠", "Recall"] };
  const name = (state.settings?.display_name || "").trim();

  shell(
    [
      h("div", { class: "topbar" }, h("h2", { style: { letterSpacing: "1px", fontWeight: 700 } }, "MY JOURNEY")),
      h(
        "div",
        { class: "journey-head" },
        // Your streak plant, the same one as next to the streak count on the home screen.
        h("button", { class: "journey-avatar journey-plant", title: "Your streak plant", "aria-label": "Your streak plant", onclick: () => gardenSheet() }, plantArt(s.plant || "seed", "journey-plant-art")),
        h("div", {}, h("div", { class: "journey-name" }, name || "Learner"), h("div", { class: "journey-level" }, `Level ${level} · ${totalXp} XP · 🌱 ${s.streak || 0}-day streak`))
      ),
      h(
        "div",
        { class: "journey-tiles" },
        h("div", { class: "journey-tile time" }, h("div", { class: "lbl" }, "Study time"), svgEl(SVG.hourglass), h("div", { class: "big" }, `${hours < 10 ? hours.toFixed(1) : Math.round(hours)} h`), h("div", { class: "sub" }, "This month")),
        h("div", { class: "journey-tile words" }, h("div", { class: "lbl" }, "Words mastered"), svgEl(SVG.book), h("div", { class: "big" }, learned), h("div", { class: "sub" }, "Active vocabulary"))
      ),
      h("h2", { class: "section-title" }, "Progress over time"),
      progressCard(s),
      h("h2", { class: "section-title" }, "Achievements"),
      h("div", { class: "card", style: { paddingTop: "6px", paddingBottom: "6px" } }, achievements(s, learned, best, sentences, level)),
      h("h2", { class: "section-title" }, "Skills"),
      h(
        "div",
        { class: "list" },
        (s.skills || []).length
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
      (s.hardest || []).length
        ? h(
            "div",
            { class: "list" },
            s.hardest.map((w) =>
              h("div", { class: "list-item", style: { cursor: "pointer" }, onclick: () => wordSheet({ ...w, cards: 3 }) }, h("div", { class: "hz" }, w.hanzi), h("div", { class: "meta" }, h("div", { class: "py" }, w.pinyin), h("div", { class: "en" }, w.english)), h("span", { class: "tag" }, `${w.lapses}×`))
            )
          )
        : h("p", { class: "muted" }, "No trouble words yet."),
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
  try { theme = localStorage.getItem("theme") || "forest"; } catch { /* ignore */ }
  const soundToggle = h("input", { type: "checkbox", class: "toggle", checked: soundsOn(), onchange: (e) => { setSounds(e.target.checked); if (e.target.checked) playCorrect(); } });
  const themeSel = h(
    "select",
    { onchange: (e) => { try { localStorage.setItem("theme", e.target.value); } catch { /* ignore */ } applyTheme(); } },
    [["forest", "Naravni eko (forest)"], ["auto", "Classic · match system"], ["light", "Classic light"], ["dark", "Classic dark"]].map(([v, l]) => h("option", { value: v, selected: v === theme }, l))
  );

  const isApp = !!window.__native?.gemma;
  // Browser version (GitHub Pages / computer): no server, data in this browser.
  const isWeb = !!window.__localApi && !isApp;
  const ollamaHelp = isWeb
    ? h(
        "details",
        { class: "hint", style: { margin: "0 0 14px" } },
        h("summary", { style: { cursor: "pointer", color: "var(--blue)" } }, "How to run Gemma on this computer"),
        h(
          "ol",
          { style: { paddingLeft: "20px", margin: "8px 0 0" } },
          h("li", {}, "Install Ollama from ollama.com"),
          h("li", {}, "In a terminal: ollama pull gemma4:e4b"),
          h("li", {}, "Allow this site to talk to it — set the environment variable OLLAMA_ORIGINS to ", h("code", {}, location.origin), " (or *) and restart Ollama"),
          h("li", {}, "Press “Test connection”. If the browser asks to access devices on your local network, allow it.")
        )
      )
    : null;
  const aiCard = isApp
    ? gemmaCard(s, f, (quiet) => save(quiet))
    : h(
        "div",
        { class: "card" },
        h("div", { class: "switch-row" }, h("div", {}, "Use AI", h("div", { class: "small muted" }, "Sentences, translation grading, memory hooks")), aiToggle),
        field("Server URL (OpenAI-compatible)", input("llm_base_url"), "Ollama: http://<host>:11434/v1 · llama.cpp: http://<host>:8080/v1"),
        field("Model", input("llm_model"), isWeb ? "e.g. gemma4:e4b — bigger: gemma4:26b if your computer has the memory" : "e.g. gemma4:e4b (Ollama) — E2B/E4B variants understand audio"),
        ollamaHelp,
        field("API key (optional)", input("llm_api_key", { type: "password", placeholder: "none" })),
        statusEl,
        h("div", { style: { marginTop: "12px" } }, h("button", { class: "btn ghost", onclick: testAI }, "Test connection"))
      );
  const speechOptions = isApp
    ? [["browser", "Android speech recognition"], ["ai", "Gemma listens (offline · Gemma 3n / 4 E2B, E4B)"], ["self", "Record & compare myself"]]
    : isWeb
    ? [["browser", "Browser speech recognition (Chrome / Edge)"], ["self", "Record & compare myself"]]
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
      canRemind() ? h("h2", { class: "section-title" }, "🔔 Daily reminder") : null,
      canRemind() ? reminderCard(s) : null,
      h("h2", { class: "section-title" }, "🎯 Lessons"),
      h(
        "div",
        { class: "card" },
        field("Daily goal", select("daily_goal", [["10", "Casual · 10 XP"], ["30", "Regular · 30 XP"], ["60", "Serious · 60 XP"], ["100", "Intense · 100 XP"]])),
        field("New words per lesson", select("new_per_lesson", [["3", "3"], ["5", "5"], ["8", "8"], ["10", "10"]])),
        field("Reviews per practice", select("review_size", [["10", "10"], ["15", "15"], ["25", "25"], ["40", "40"]])),
        field("Sentences per session", select("sentence_count", [["4", "4"], ["6", "6"], ["9", "9"], ["12", "12"]])),
        field("Theme", themeSel),
        h("div", { class: "switch-row" }, h("div", {}, "Sounds", h("div", { class: "small muted" }, "Nature sounds for answers and your plant")), soundToggle),
        field("Your name", input("display_name", { placeholder: "Shown on “My journey”" }))
      ),
      isWeb
        ? h("a", { class: "btn ghost", href: "Bloomko.apk", download: "Bloomko.apk", style: { marginTop: "20px", textDecoration: "none" } }, "📱 Download the Android app")
        : null,
      window.__localApi ? h("h2", { class: "section-title" }, "🔄 Sync between devices") : null,
      window.__localApi ? syncCard() : null,
      window.__localApi ? h("h2", { class: "section-title" }, "💾 Backup") : null,
      window.__localApi ? backupCard() : null,
      h("div", { style: { marginTop: "20px" } }, h("button", { class: "btn", onclick: () => save() }, "Save settings")),
      h("img", { class: "app-logo settings-logo", src: LOGO, alt: "" }),
      h("p", { class: "muted small center", style: { marginTop: "4px" } }, `${window.__appVersion ? `Bloomko ${window.__appVersion} · ` : ""}Stroke data: Hanzi Writer + Make Me a Hanzi (Arphic PL). ${window.__native ? "Everything runs on this phone." : window.__localApi ? "Your data stays in this browser." : "Runs entirely on your network."}`),
    ],
    "#/settings"
  );
}

/** Reminder toggle + time; changes apply right away. */
function reminderCard(s) {
  const toggle = h("input", { type: "checkbox", class: "toggle" });
  toggle.checked = s.reminder_on;
  let value = s.reminder_time || "19:00";
  const timeLabel = h("b", { class: "time-value" }, value);
  const apply = async () => {
    if (toggle.checked && !(await ensurePermission())) {
      toggle.checked = false;
      toast("Allow notifications for Bloomko in Android settings to get reminders", 5000);
    }
    state.settings = await api("/api/settings", { method: "PUT", body: { reminder_on: toggle.checked, reminder_time: value } });
    await scheduleReminders();
    toast(toggle.checked ? `🌱 We'll remind you at ${value} if your plant is thirsty` : "Reminder off");
  };
  toggle.onchange = apply;
  const timeBtn = h(
    "button",
    {
      type: "button",
      class: "select-btn time-btn",
      onclick: async () => {
        const v = await pickTime(value);
        if (!v || v === value) return;
        value = v;
        timeLabel.textContent = v;
        if (toggle.checked) apply();
        else state.settings = await api("/api/settings", { method: "PUT", body: { reminder_time: v } });
      },
    },
    h("span", { class: "time-ico", "aria-hidden": "true" }, "🕰️"),
    h("span", { class: "select-label" }, timeLabel, h("small", {}, "Tap to change")),
    h("span", { class: "select-chevron", "aria-hidden": "true" }, "▾")
  );
  return h(
    "div",
    { class: "card" },
    h("div", { class: "switch-row" }, h("div", {}, "Remind me to practise", h("div", { class: "small muted" }, "Only on days you haven't watered your plant yet")), toggle),
    h("div", { class: "field", style: { marginTop: "12px", marginBottom: 0 } }, h("label", {}, "Time"), timeBtn)
  );
}

// ------------------------------------------------------------------ boot

// ------------------------------------------------------------------ welcome (first start)

function welcomeScreen(gemmaNext) {
  return new Promise(async (resolve) => {
    let chosen = state.settings.course === "ja" ? "ja" : "zh";
    let level = null;
    // Levels of each course (JLPT N5, N3 …), so a course with several can be started at the right one.
    const courses = (await api("/api/home").catch(() => ({}))).courses || [];
    const levelBox = h("div", { class: "welcome-levels" });
    const showLevels = () => {
      const c = courses.find((x) => x.lang === chosen);
      if (!c || c.levels.length < 2) { level = null; levelBox.replaceChildren(); return; }
      level = level && c.levels.some((l) => l.name === level) ? level : c.levels[0].name;
      levelBox.replaceChildren(
        h("div", { class: "small muted", style: { margin: "14px 0 8px", textAlign: "left" } }, "Which level?"),
        levelCards(c.levels, level, (name) => { level = name; showLevels(); })
      );
    };
    const name = h("input", {
      class: "input",
      placeholder: "Your name",
      maxlength: "30",
      autocomplete: "given-name",
      "aria-label": "Your name",
      oninput: () => (go.disabled = !name.value.trim()),
      onkeydown: (e) => e.key === "Enter" && name.value.trim() && go.click(),
    });
    const courseBtns = Object.entries(COURSES).map(([lang, info]) => {
      const b = h(
        "button",
        {
          class: "welcome-course" + (lang === chosen ? " on" : ""),
          onclick: () => { chosen = lang; level = null; courseBtns.forEach((x) => x.classList.toggle("on", x === b)); showLevels(); },
        },
        h("span", { class: "flag" }, info.flag),
        h("span", {}, h("b", {}, info.name, " ", h("span", { class: "hz" }, info.script)), h("small", {}, info.sub))
      );
      return b;
    });
    const go = h(
      "button",
      {
        class: "btn",
        disabled: true,
        onclick: async () => {
          const body = { display_name: name.value.trim(), course: chosen };
          if (level) body[`section_${chosen}`] = level;
          state.settings = await api("/api/settings", { method: "PUT", body });
          applyCourse();
          resolve();
        },
      },
      gemmaNext ? "Continue" : "Start learning"
    );
    app.replaceChildren(
      h(
        "div",
        { class: "welcome" },
        gemmaNext ? h("div", { class: "gsetup-step" }, h("i", { class: "on" }), h("i"), "Step 1 of 2") : null,
        h("img", { class: "app-logo welcome-logo", src: LOGO, alt: "" }),
        h("h1", {}, "Welcome to Bloomko"),
        h("p", { class: "muted" }, "Learn a new language — write, read and speak it, without wasting paper."),
        h("label", { class: "field", style: { width: "100%", textAlign: "left" } }, h("span", { class: "small muted" }, "What should we call you?"), name),
        h("div", { class: "small muted", style: { alignSelf: "flex-start", margin: "6px 0 8px" } }, "What do you want to learn?"),
        h("div", { class: "welcome-courses" }, courseBtns),
        levelBox,
        h("div", { style: { width: "100%", marginTop: "18px" } }, go),
        h("p", { class: "muted small" }, "Everything stays on this device. You can change this later in Settings.")
      )
    );
    showLevels();
    setTimeout(() => name.focus(), 200);
  });
}

enhanceSelects();

(async function boot() {
  try {
    state.settings = await api("/api/settings");
    applyCourse();
  } catch (e) {
    app.replaceChildren(h("div", { class: "empty" }, h("div", { class: "e" }, "🔌"), h("h2", {}, "Can't reach the server"), h("p", {}, e.message)));
    return;
  }
  // First start: ask for the learner's name (shown on "My journey").
  if ("display_name" in state.settings && !String(state.settings.display_name || "").trim()) {
    // Android app: step 2 sets up the on-device AI right away (skippable).
    const offerGemma = hasGemmaSupport() && !(await window.__native.gemma.status().catch(() => ({}))).hasModel;
    await welcomeScreen(offerGemma);
    if (offerGemma) await gemmaSetupScreen({ step: "2 of 2" });
  }
  route();
  if (canRemind()) {
    scheduleReminders();
    document.addEventListener("visibilitychange", () => document.visibilityState === "visible" && scheduleReminders());
  }
  api("/api/ai/status")
    .then((st) => {
      state.aiStatus = st;
      const dot = document.querySelector(".topbar .status-dot");
      if (dot) dot.classList.toggle("ok", !!st.ok);
    })
    .catch(() => {});
})();
