// Tiny DOM + API helpers. No framework, no build step.

export function h(tag, attrs = {}, ...children) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs || {})) {
    if (v == null || v === false) continue;
    if (k === "class") el.className = v;
    else if (k === "style" && typeof v === "object") {
      for (const [sk, sv] of Object.entries(v)) sk.startsWith("--") ? el.style.setProperty(sk, sv) : (el.style[sk] = sv);
    }
    else if (k.startsWith("on") && typeof v === "function") el.addEventListener(k.slice(2).toLowerCase(), v);
    else if (k === "html") el.innerHTML = v;
    else if (v === true) el.setAttribute(k, "");
    else el.setAttribute(k, v);
  }
  for (const c of children.flat(Infinity)) {
    if (c == null || c === false) continue;
    el.append(c instanceof Node ? c : document.createTextNode(String(c)));
  }
  return el;
}

export async function api(path, { method = "GET", body } = {}) {
  // In the Android app there is no server: requests are answered by the local backend.
  if (window.__localApi) {
    try {
      return await window.__localApi(path, { method, body: body ? JSON.parse(JSON.stringify(body)) : undefined });
    } catch (e) {
      const err = new Error(e.message || String(e));
      err.status = e.status || 500;
      err.aiError = !!e.aiError;
      throw err;
    }
  }
  const res = await fetch(path, {
    method,
    headers: body ? { "Content-Type": "application/json" } : {},
    body: body ? JSON.stringify(body) : undefined,
  });
  let data = null;
  try { data = await res.json(); } catch { /* empty body */ }
  if (!res.ok) {
    const err = new Error((data && data.detail) || `${res.status} ${res.statusText}`);
    err.status = res.status;
    err.aiError = data && data.ai_error;
    throw err;
  }
  return data;
}

let toastTimer;
export function toast(msg, ms = 2600) {
  const t = document.getElementById("toast");
  t.textContent = msg;
  t.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => (t.hidden = true), ms);
}

export function shuffle(arr) {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

export const icons = {
  speaker: `<svg viewBox="0 0 24 24" fill="currentColor"><path d="M3 9v6h4l5 5V4L7 9H3z"/><path d="M16.5 12a4.5 4.5 0 0 0-2.5-4v8a4.5 4.5 0 0 0 2.5-4z"/><path d="M14 3.2v2.1a7 7 0 0 1 0 13.4v2.1a9 9 0 0 0 0-17.6z"/></svg>`,
  slow: `<span style="font-size:20px;line-height:1">🐢</span>`,
  mic: `<svg viewBox="0 0 24 24" fill="currentColor"><path d="M12 14a3 3 0 0 0 3-3V5a3 3 0 0 0-6 0v6a3 3 0 0 0 3 3z"/><path d="M17 11a5 5 0 0 1-10 0H5a7 7 0 0 0 6 6.9V21h2v-3.1a7 7 0 0 0 6-6.9h-2z"/></svg>`,
  stop: `<svg viewBox="0 0 24 24" fill="currentColor"><rect x="6" y="6" width="12" height="12" rx="2"/></svg>`,
  play: `<svg viewBox="0 0 24 24" fill="currentColor"><path d="M8 5v14l11-7z"/></svg>`,
};

export function iconBtn(name, cls, onClick, title) {
  const b = h("button", { class: cls, onclick: onClick, title, "aria-label": title });
  b.innerHTML = icons[name];
  return b;
}

/** In-app replacement for window.confirm(), styled like the rest of the app. Resolves true/false. */
export function confirmDialog({ title, message = "", icon = "", confirmLabel = "OK", cancelLabel = "Cancel", danger = false } = {}) {
  return new Promise((resolve) => {
    const done = (v) => { bg.remove(); document.removeEventListener("keydown", onKey); resolve(v); };
    const onKey = (e) => { if (e.key === "Escape") done(false); };
    const bg = h("div", { class: "dialog-bg", onclick: (e) => { if (e.target === bg) done(false); } },
      h("div", { class: "dialog", role: "alertdialog", "aria-modal": "true" },
        icon ? h("div", { class: "dialog-icon" + (icon instanceof Node ? " art" : "") }, icon) : null,
        h("h2", {}, title),
        message ? h("p", { class: "muted" }, message) : null,
        h("div", { class: "dialog-actions" },
          cancelLabel ? h("button", { class: "btn", onclick: () => done(false) }, cancelLabel) : null,
          h("button", { class: cancelLabel ? `btn ghost${danger ? " danger" : ""}` : "btn", onclick: () => done(true) }, confirmLabel),
        ),
      ),
    );
    document.addEventListener("keydown", onKey);
    document.body.append(bg);
    bg.querySelector(".btn").focus();
  });
}

/**
 * Replace native <select> pop-ups (white system dialogs on Android) with a bottom sheet in the
 * app's style. The <select> stays in the page (hidden) as the source of truth, so code that
 * reads .value or listens for "change" keeps working.
 */
function enhanceSelect(sel) {
  if (sel.dataset.enhanced) return;
  sel.dataset.enhanced = "1";
  const split = (text) => {
    const [main, ...rest] = String(text).split(" — ");
    return [main, rest.join(" — ")];
  };
  const label = h("span", { class: "select-label" });
  const btn = h("button", { type: "button", class: "select-btn" }, label, h("span", { class: "select-chevron", "aria-hidden": "true" }, "▾"));
  const sync = () => {
    const o = sel.options[sel.selectedIndex];
    const [main, sub] = split(o ? o.textContent : "");
    label.replaceChildren(h("b", {}, main), sub ? h("small", {}, sub) : null);
    btn.hidden = sel.hidden;
  };
  sel.addEventListener("change", sync);
  btn.addEventListener("click", () => {
    const title = sel.closest(".field")?.querySelector("label")?.textContent || "";
    const bg = h("div", { class: "sheet-bg", onclick: (e) => e.target === bg && bg.remove() });
    const pick = (i) => {
      bg.remove();
      if (sel.selectedIndex === i) return;
      sel.selectedIndex = i;
      sel.dispatchEvent(new Event("change", { bubbles: true }));
    };
    bg.append(
      h(
        "div",
        { class: "sheet select-sheet" },
        title ? h("h3", { class: "select-title" }, title) : null,
        [...sel.options].map((o, i) => {
          const [main, sub] = split(o.textContent);
          return h(
            "button",
            { type: "button", class: "select-opt" + (i === sel.selectedIndex ? " on" : ""), onclick: () => pick(i) },
            h("span", { class: "radio" }),
            h("span", { class: "select-opt-text" }, h("b", {}, main), sub ? h("small", {}, sub) : null)
          );
        })
      )
    );
    document.body.append(bg);
  });
  sel.after(btn);
  sel.classList.add("select-native");
  sync();
  // Keep the button's visibility in step with the select (e.g. shown/hidden by code).
  new MutationObserver(sync).observe(sel, { attributes: true, attributeFilter: ["hidden"] });
}

export function enhanceSelects(root = document.body) {
  root.querySelectorAll("select:not([data-enhanced])").forEach(enhanceSelect);
  new MutationObserver((muts) => {
    for (const m of muts)
      for (const n of m.addedNodes) {
        if (n.nodeType !== 1) continue;
        if (n.tagName === "SELECT") enhanceSelect(n);
        else n.querySelectorAll?.("select:not([data-enhanced])").forEach(enhanceSelect);
      }
  }).observe(root, { childList: true, subtree: true });
}
