// Interface language (English, Français, Español, 日本語).
// The app's code is written in English; this translates what ends up on screen: every text node
// and the placeholder / title / aria-label attributes, as they are added or changed. Texts with
// numbers or names in them are matched with patterns ("{0} words" → "{0} mots").

export const UI_LANGS = [
  ["en", "English"],
  ["fr", "Français"],
  ["es", "Español"],
  ["ja", "日本語"],
];

let lang = "en";
let exact = new Map();
let byFirst = new Map(); // first word → patterns starting with it
let loose = []; // patterns that start with a placeholder
let observer = null;
const ATTRS = ["placeholder", "title", "aria-label"];

export const uiLang = () => lang;

const escapeRe = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

function compile(src, dst) {
  const parts = src.split(/\{(\d+)\}/);
  let re = "^";
  const order = [];
  for (let i = 0; i < parts.length; i++) {
    if (i % 2) {
      re += "([\\s\\S]*?)";
      order.push(Number(parts[i]));
    } else {
      re += escapeRe(parts[i]);
    }
  }
  return { re: new RegExp(re + "$"), order, dst };
}

/** Loads the dictionary for a language ("en" = no translation). */
export async function setUiLang(next) {
  lang = UI_LANGS.some(([k]) => k === next) ? next : "en";
  document.documentElement.lang = lang;
  exact = new Map();
  byFirst = new Map();
  loose = [];
  if (lang !== "en") {
    let dict = {};
    try {
      dict = await (await fetch(`i18n/${lang}/ui.json`)).json();
    } catch (e) {
      console.warn("i18n", e);
    }
    for (const [src, dst] of Object.entries(dict)) {
      if (!dst || src === dst) continue;
      if (/\{\d+\}/.test(src)) {
        const p = compile(src, dst);
        const first = src.match(/^([^\s{]+)/)?.[1];
        if (first) {
          if (!byFirst.has(first)) byFirst.set(first, []);
          byFirst.get(first).push(p);
        } else {
          loose.push(p);
        }
      } else {
        exact.set(src, dst);
      }
    }
    // Longer patterns first, so "Lesson {0} of {1}" wins over "Lesson {0}".
    for (const list of byFirst.values()) list.sort((a, b) => b.re.source.length - a.re.source.length);
    loose.sort((a, b) => b.re.source.length - a.re.source.length);
  }
  if (document.body) translateTree(document.body);
  startObserver();
}

function fill(p, m) {
  return p.dst.replace(/\{(\d+)\}/g, (_, n) => {
    const i = p.order.indexOf(Number(n));
    return i >= 0 ? m[i + 1] : "";
  });
}

/** Translation of one string, or null when there is none. */
export function tr(text) {
  if (lang === "en" || !text) return null;
  const hit = exact.get(text);
  if (hit !== undefined) return hit;
  const first = text.match(/^([^\s]+)/)?.[1];
  for (const list of [first && byFirst.get(first), loose]) {
    if (!list) continue;
    for (const p of list) {
      const m = text.match(p.re);
      if (m) return fill(p, m);
    }
  }
  // "Word:" style labels with a trailing colon or space are stored without it sometimes.
  return null;
}

/** t("Save") in code, for strings that never reach the DOM as-is (e.g. confirm texts built later). */
export const t = (text) => tr(text) ?? text;

function translateText(node) {
  const raw = node.data;
  if (!raw || !/[A-Za-z]/.test(raw)) return;
  const core = raw.trim();
  if (!core) return;
  let out = tr(raw);
  if (out == null && core !== raw) {
    const c = tr(core);
    if (c != null) out = raw.replace(core, c);
  }
  if (out != null && out !== raw) node.data = out;
}

function skip(el) {
  return el.closest?.("[translate='no'], .hz, script, style, textarea, .notranslate");
}

function translateAttrs(el) {
  for (const a of ATTRS) {
    const v = el.getAttribute?.(a);
    if (v && /[A-Za-z]/.test(v)) {
      const out = tr(v) ?? tr(v.trim());
      if (out != null && out !== v) el.setAttribute(a, out);
    }
  }
}

function translateTree(root) {
  if (lang === "en") return;
  if (root.nodeType === 3) {
    if (root.parentElement && !skip(root.parentElement)) translateText(root);
    return;
  }
  if (root.nodeType !== 1 || skip(root)) return;
  translateAttrs(root);
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_ELEMENT | NodeFilter.SHOW_TEXT, {
    acceptNode: (n) => (n.nodeType === 1 && (n.getAttribute("translate") === "no" || n.classList.contains("hz") || n.tagName === "SCRIPT" || n.tagName === "STYLE" || n.tagName === "TEXTAREA") ? NodeFilter.FILTER_REJECT : NodeFilter.FILTER_ACCEPT),
  });
  for (let n = walker.nextNode(); n; n = walker.nextNode()) {
    if (n.nodeType === 3) translateText(n);
    else translateAttrs(n);
  }
}

function startObserver() {
  if (observer || !document.body) return;
  observer = new MutationObserver((list) => {
    if (lang === "en") return;
    for (const m of list) {
      if (m.type === "childList") m.addedNodes.forEach(translateTree);
      else if (m.type === "characterData") {
        if (m.target.parentElement && !skip(m.target.parentElement)) translateText(m.target);
      } else if (m.type === "attributes" && !skip(m.target)) translateAttrs(m.target);
    }
  });
  observer.observe(document.body, { childList: true, subtree: true, characterData: true, attributes: true, attributeFilter: ATTRS });
}
