// Talk: short role-play conversations with Gemma (café, shop, asking the way …) using the words
// you know. You answer by voice or by typing; Gemma corrects you gently and keeps the scene going.
import { api, h, icons, iconBtn, toast } from "./util.js";
import { state, isJa, isSl } from "./state.js";
import { speak, stopSpeaking, canRecognize, recognize } from "./audio.js";
import { playComplete, playCorrect } from "./sounds.js";

const TURNS = 6;

/** Topic picker. */
export async function talkSheet() {
  if (!state.settings?.ai_enabled) {
    toast("Talk needs Gemma — turn on AI in Settings", 4000);
    location.hash = "#/settings";
    return;
  }
  const data = await api("/api/talk/topics");
  const bg = h("div", { class: "sheet-bg", onclick: (e) => e.target === bg && bg.remove() });
  bg.append(
    h(
      "div",
      { class: "sheet" },
      h("h2", { style: { margin: "0 0 4px" } }, "Talk"),
      h(
        "p",
        { class: "muted small", style: { margin: "0 0 14px" } },
        data.known < 10 ? "Learn at least 10 words first — Gemma talks with the words you know." : `A short chat with Gemma, using your ${data.known} words. Answer by voice or typing — Gemma helps when something isn't quite right.`
      ),
      h(
        "div",
        { class: "talk-topics" },
        data.topics.map((t) =>
          h(
            "button",
            { class: "talk-topic", disabled: data.known < 10, onclick: () => { bg.remove(); talkScreen(t); } },
            h("span", { class: "tt-ico" }, t.icon),
            h("b", {}, t.title),
            h("small", {}, t.sub)
          )
        )
      )
    )
  );
  document.body.append(bg);
}

const readingLine = (r) => (r && !isSl() ? h("div", { class: "py talk-py" }, r) : null);

function revealEn(en) {
  const b = h("button", { class: "g-en-reveal small", onclick: () => b.replaceWith(h("div", { class: "st-en small" }, en)) }, "👁 Translation");
  return b;
}

/** The conversation itself. */
async function talkScreen(topic) {
  const history = [];
  let turns = 0;
  let good = 0;
  let busy = false;
  let closed = false;

  const log = h("div", { class: "talk-log" });
  const ideasEl = h("div", { class: "talk-ideas" });
  const input = h("input", { class: "input talk-input", placeholder: isSl() ? "Write your answer…" : "Type or speak your answer…", enterkeyhint: "send", onkeydown: (e) => e.key === "Enter" && send() });
  const sendBtn = h("button", { class: "btn talk-send", onclick: () => send(), "aria-label": "Send" }, "➤");
  const mic = canRecognize() ? h("button", { class: "mic talk-mic", "aria-label": "Speak", html: icons.mic, onclick: () => listen() }) : null;
  const counter = h("small", { class: "muted" }, "");
  const body = h("div", { class: "lesson-body talk-body" }, log);

  const scroll = () => requestAnimationFrame(() => body.scrollTo({ top: body.scrollHeight, behavior: "smooth" }));
  const updateCounter = () => (counter.textContent = `${Math.min(turns, TURNS)} / ${TURNS}`);

  const close = () => { closed = true; stopSpeaking(); root.remove(); api("/api/talk/end", { method: "POST" }).catch(() => {}); };

  function gemmaBubble(r) {
    const say = () => speak(isJa() && r.reading ? r.reading : r.reply);
    log.append(
      h(
        "div",
        { class: "talk-msg gemma" },
        h("div", { class: "talk-who" }, topic.icon),
        h(
          "div",
          { class: "talk-bubble" },
          h("div", { class: "hz talk-text" }, r.reply),
          readingLine(r.reading),
          h("div", { class: "row", style: { alignItems: "center", gap: "8px" } }, iconBtn("speaker", "speaker sm", say, "Listen"), r.en ? revealEn(r.en) : null)
        )
      )
    );
    if (!closed) say();
  }

  function myBubble(text) {
    const el = h("div", { class: "talk-msg me" }, h("div", { class: "talk-bubble" }, h("div", { class: "hz talk-text" }, text)));
    log.append(el);
    return el;
  }

  function feedback(el, r) {
    if (r.correct === null) return;
    if (r.correct || !r.fixed) {
      el.querySelector(".talk-bubble").append(h("div", { class: "talk-ok" }, "✓ Nice!"));
      return;
    }
    el.after(
      h(
        "div",
        { class: "talk-fix" },
        h("div", { class: "small muted" }, "✏️ Better:"),
        h("div", { class: "row", style: { alignItems: "center", gap: "8px" } }, h("b", { class: "hz" }, r.fixed), iconBtn("speaker", "speaker sm", () => speak(r.fixed), "Listen")),
        readingLine(r.fixed_reading || ""),
        r.note ? h("div", { class: "small" }, r.note) : null
      )
    );
  }

  function showIdeas(ideas) {
    ideasEl.replaceChildren(
      ...(ideas || []).map((x) =>
        h(
          "button",
          { class: "talk-idea", onclick: () => { input.value = x.text; input.focus(); }, title: x.en },
          h("span", { class: "hz" }, x.text),
          x.en ? h("small", {}, x.en) : null
        )
      )
    );
  }

  function thinking() {
    const secs = h("small", { class: "talk-secs" });
    const el = h("div", { class: "talk-msg gemma" }, h("div", { class: "talk-who" }, topic.icon), h("div", { class: "talk-bubble talk-typing" }, h("span"), h("span"), h("span"), secs));
    const t0 = Date.now();
    const timer = setInterval(() => {
      if (!el.isConnected) return clearInterval(timer);
      const s = Math.round((Date.now() - t0) / 1000);
      if (s >= 5) secs.textContent = `${s} s`;
    }, 1000);
    log.append(el);
    scroll();
    return el;
  }

  async function turn(answer, mine) {
    busy = true;
    sendBtn.disabled = true;
    if (mic) mic.disabled = true;
    ideasEl.replaceChildren();
    const dots = thinking();
    try {
      const r = await api("/api/talk/turn", { method: "POST", body: { topic: topic.id, history, answer } });
      if (closed) return;
      dots.remove();
      if (mine) {
        feedback(mine, r);
        history.push({ who: "me", text: answer });
        turns++;
        if (r.correct) { good++; playCorrect(); }
        updateCounter();
      }
      history.push({ who: "gemma", text: r.reply });
      gemmaBubble(r);
      if (turns >= TURNS) finishBar();
      else showIdeas(r.ideas);
    } catch (e) {
      dots.remove();
      if (closed) return;
      if (mine) { mine.remove(); input.value = answer; }
      log.append(
        h(
          "div",
          { class: "talk-err small" },
          e.message,
          " ",
          h("button", { class: "btn ghost small", onclick: (ev) => { ev.currentTarget.parentElement.remove(); if (mine) send(); else turn("", null); } }, "Try again")
        )
      );
    } finally {
      busy = false;
      sendBtn.disabled = false;
      if (mic) mic.disabled = false;
      scroll();
    }
  }

  function send() {
    const text = input.value.trim();
    if (!text || busy || turns >= TURNS) return;
    input.value = "";
    stopSpeaking();
    turn(text, myBubble(text));
    scroll();
  }

  let listening = null;
  async function listen() {
    if (listening) { listening.stop(); return; }
    if (busy) return;
    stopSpeaking();
    mic.classList.add("rec");
    try {
      listening = recognize();
      const alts = await listening;
      if (alts[0]) { input.value = alts[0]; send(); }
      else toast("Didn't catch that — try again");
    } catch (e) {
      toast(e.message, 3000);
    } finally {
      listening = null;
      mic.classList.remove("rec");
    }
  }

  function finishBar() {
    foot.replaceChildren(
      h(
        "div",
        { class: "inner" },
        h(
          "button",
          {
            class: "btn",
            onclick: async () => {
              const r = await api("/api/talk/done", { method: "POST", body: { turns, good } }).catch(() => ({ xp: 0 }));
              playComplete();
              close();
              toast(`🌱 Nice chat! +${r.xp} XP · ${good}/${turns} answers spot on`, 4000);
            },
          },
          "Finish chat"
        )
      )
    );
  }

  const foot = h("div", { class: "lesson-foot talk-foot" }, h("div", { class: "inner" }, ideasEl, h("div", { class: "talk-bar" }, mic, input, sendBtn)));
  const root = h(
    "div",
    { class: "lesson talk-screen" },
    h(
      "div",
      { class: "lesson-top" },
      h("button", { class: "icon-btn", "aria-label": "Close", onclick: close }, "✕"),
      h("div", { class: "st-head" }, h("b", {}, `${topic.icon} ${topic.title}`), counter)
    ),
    body,
    foot
  );
  updateCounter();
  document.body.append(root);
  turn("", null);
}
