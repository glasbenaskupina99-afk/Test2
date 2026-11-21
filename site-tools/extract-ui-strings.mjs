// Collects the user-facing English strings in the app's code (app/static/js) for translation.
// String and template literals that look like text (not CSS classes, paths or code) are kept;
// ${…} parts of template literals become {0}, {1} … placeholders.
import { readFileSync, readdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const dir = new URL("../app/static/js/", import.meta.url).pathname;
const files = readdirSync(dir).filter((f) => f.endsWith(".js"));
const out = new Set();

function looksLikeText(s) {
  const t = s.trim();
  if (t.length < 2 || !/[A-Za-z]{2}/.test(t)) return false;
  if (/^[a-z0-9_.:\-/#?=&%]+$/.test(t)) return false; // ids, classes, paths, keys
  if (/^(GET|POST|PUT|DELETE) \//.test(t) || t.startsWith("/api/") || t.startsWith("http")) return false;
  if (/^[a-z-]+( [a-z0-9-]+)+$/.test(t) && !/[A-Z.!?…—’']/.test(t) && t.split(" ").every((w) => /^[a-z0-9-]+$/.test(w)) && /(btn|card|row|ghost|small|mode|sheet|muted|hz|py|ico|tok|g-|st-|ph-|talk|sync|lesson|wrap|chip|center|good|bad|ok|active|hidden|open)/.test(t)) return false;
  if (/[{};]\s*$/.test(t) && /[:;]/.test(t) && !/ [a-z]+ /.test(t)) return false; // css
  if (/^<svg|^<path|viewBox|stroke-width/.test(t)) return false;
  if (/^[\w-]+\([^)]*\)$/.test(t)) return false;
  if (/^(px|em|rem|vh|vw|ms|s)$/.test(t)) return false;
  return true;
}

for (const f of files) {
  const src = readFileSync(join(dir, f), "utf8");
  // "…" and '…'
  for (const m of src.matchAll(/(["'])((?:\\.|(?!\1)[^\\\n])*)\1/g)) {
    const s = m[2].replace(/\\(["'\\])/g, "$1").replace(/\\n/g, "\n");
    if (looksLikeText(s)) out.add(s);
  }
  // `…${x}…`
  for (const m of src.matchAll(/`((?:\\.|[^`\\])*)`/g)) {
    let i = 0;
    let s = "";
    const body = m[1];
    for (let p = 0; p < body.length; ) {
      if (body.startsWith("${", p)) {
        let depth = 1;
        let q = p + 2;
        while (q < body.length && depth) {
          if (body[q] === "{") depth++;
          else if (body[q] === "}") depth--;
          q++;
        }
        s += `{${i++}}`;
        p = q;
      } else {
        s += body[p++];
      }
    }
    if (looksLikeText(s.replace(/\{\d+\}/g, ""))) out.add(s);
  }
}
// Messages and labels from the app's local backend (errors, Talk topics …).
const mobile = new URL("../mobile/src/", import.meta.url).pathname;
for (const f of ["backend.js", "sync.js"]) {
  const src = readFileSync(join(mobile, f), "utf8");
  for (const m of src.matchAll(/(["'`])((?:\\.|(?!\1)[^\\\n])*)\1/g)) {
    const s = m[2].replace(/\$\{[^}]*\}/g, "{0}");
    if (/^[A-Z\u{1F300}-\u{1FAFF}\u2600-\u27BF]/u.test(s) && / [a-z]/.test(s) && looksLikeText(s) && !/[\u3040-\u9fff]/.test(s)) out.add(s);
  }
}
for (const m of readFileSync(join(mobile, "ai.js"), "utf8").matchAll(/AIError\((["'`])((?:\\.|(?!\1)[^\\\n])*)\1/g)) out.add(m[2].replace(/\$\{[^}]*\}/g, "{0}"));

const list = [...out].sort();
writeFileSync(new URL("../app/data/i18n/ui-strings.json", import.meta.url), JSON.stringify(list, null, 1));
console.log(list.length, "strings");
