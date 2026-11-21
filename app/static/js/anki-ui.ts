// Import an Anki deck (.apkg) as your own word list (2.0): pick which fields are the word, the
// reading and the meaning (guessed for you), see a preview, and optionally keep your Anki progress.
import { api, h, toast, fill } from "./util.js";
import { state } from "./state.js";
import { parseApkg, guessRoles, noteToWord, cleanField, type AnkiDeck, type FieldRoles } from "../../../mobile/src/anki.js";

let sqlJob: Promise<any> | null = null;
/** sql.js (SQLite compiled to WebAssembly) is only loaded when a deck is imported. */
function loadSql() {
  // Next to Hanzi Writer: vendor/ in the app, /static/vendor/ on the Python server.
  const writer = document.querySelector<HTMLScriptElement>('script[src*="hanzi-writer"]')?.src || "";
  const base = writer ? writer.slice(0, writer.lastIndexOf("/") + 1) : "vendor/";
  sqlJob ||= new Promise<void>((resolve, reject) => {
    if (window.initSqlJs) return resolve();
    const s = h("script", { src: `${base}sql-wasm.js` });
    s.onload = () => resolve();
    s.onerror = () => reject(new Error("Couldn't load the Anki reader"));
    document.head.append(s);
  }).then(() => window.initSqlJs({ locateFile: (f) => `${base}${f}` }));
  sqlJob.catch(() => (sqlJob = null));
  return sqlJob;
}

/** Choose a .apkg file and import it. `done` is called with the new list's name. */
export function ankiImport(done: (list: string) => void, file?: File) {
  if (file) return openDeck(file, done);
  const input = h("input", { type: "file", accept: ".apkg,.colpkg", hidden: true });
  input.onchange = () => input.files[0] && openDeck(input.files[0], done);
  document.body.append(input);
  input.click();
  setTimeout(() => input.remove(), 60000);
}

async function openDeck(file: File, done: (list: string) => void) {
  const body = h("div", {}, h("div", { class: "spinner" }), h("p", { class: "muted small center" }, "Reading your deck…"));
  const bg = h("div", { class: "sheet-bg", onclick: (e) => e.target === bg && bg.remove() }, h("div", { class: "sheet anki-sheet" }, h("h2", { style: { marginBottom: "4px" } }, "🃏 Import an Anki deck"), body));
  document.body.append(bg);
  let deck: AnkiDeck;
  try {
    const SQL = await loadSql();
    deck = parseApkg(new Uint8Array(await file.arrayBuffer()), SQL);
  } catch (e) {
    fill(body, h("p", { class: "bad" }, e.message), h("button", { class: "btn ghost", onclick: () => bg.remove() }, "Close"));
    return;
  }
  try {
    if (!deck.types.length) throw new Error("This deck's note types are missing — export it again from Anki");
    setup(deck, body, bg, done);
  } catch (e) {
    fill(body, h("p", { class: "bad" }, e.message), h("button", { class: "btn ghost", onclick: () => bg.remove() }, "Close"));
  }
}

function setup(deck: AnkiDeck, body: HTMLElement, bg: HTMLElement, done: (list: string) => void) {
  const course = state.settings.course || "zh";
  // The note type with the most notes is the likely vocabulary one.
  const counts = (id: string) => deck.notes.filter((n) => n.typeId === id).length;
  let type = deck.types.slice().sort((a, b) => counts(b.id) - counts(a.id))[0];
  let roles: FieldRoles;
  const name = h("input", { class: "input", maxlength: 40, value: deck.name.slice(0, 40) });
  const keep = h("input", { type: "checkbox", class: "toggle" });
  keep.checked = true;
  const report = h("div", { class: "import-report small" });
  const table = h("div", { class: "anki-preview" });
  const go = h("button", { class: "btn", disabled: true }, "Import");
  const selects = h("div", { class: "anki-roles" });
  const notes = () => deck.notes.filter((n) => n.typeId === type.id);
  // The converted words, worked out once per note type and field choice (not on every keystroke).
  let cache = null;
  let cacheKey = "";
  const words = () => {
    const k = `${type.id}|${roles.word}|${roles.reading}|${roles.meaning}`;
    if (k !== cacheKey) {
      cacheKey = k;
      cache = notes().map((n) => ({ n, w: noteToWord(n, roles) })).filter((x) => x.w[0] && x.w[2]);
    }
    return cache;
  };
  let timer: ReturnType<typeof setTimeout>;
  let previewId = 0;
  let importing = false;

  const select = (label: string, key: keyof FieldRoles, optional: boolean) => {
    const s = h("select", {}, optional ? h("option", { value: "-1" }, "— none —") : null, type.fields.map((f, i) => h("option", { value: String(i) }, `${f}${notes()[0] ? ` — ${cleanField(notes()[0].fields[i] || "").slice(0, 24)}` : ""}`)));
    s.value = String(roles[key]);
    s.onchange = () => { roles[key] = Number(s.value); refresh(); };
    return h("div", { class: "field" }, h("label", {}, label), s);
  };
  const buildSelects = () => {
    roles = guessRoles(type, notes().slice(0, 30), course);
    fill(
      selects,
      deck.types.length > 1
        ? (() => {
            const s = h("select", {}, deck.types.map((t) => h("option", { value: t.id }, `${t.name} (${counts(t.id)})`)));
            s.value = type.id;
            s.onchange = () => { type = deck.types.find((t) => t.id === s.value); buildSelects(); refresh(); };
            return h("div", { class: "field" }, h("label", {}, "Note type"), s);
          })()
        : null,
      select(course === "sl" ? "Word (Slovenian)" : course === "ja" ? "Word (Japanese)" : "Word (Chinese)", "word", false),
      select(course === "zh" ? "Pinyin (optional — added automatically)" : course === "ja" ? "Reading (or furigana in the word)" : "Pronunciation (optional)", "reading", true),
      select("Meaning", "meaning", false)
    );
  };

  const lines = () => words().map(({ w }) => w.join("\t")).join("\n");
  const refresh = () => {
    const sample = words().slice(0, 5);
    fill(table, sample.map(({ w }) => h("div", { class: "anki-row" }, h("b", { class: "hz" }, w[0]), h("span", { class: "muted" }, w[1]), h("span", {}, w[2]))));
    clearTimeout(timer);
    timer = setTimeout(async () => {
      const id = ++previewId;
      try {
        const r = await api("/api/words/import", { method: "POST", body: { text: lines(), list: name.value, preview: true } });
        if (id !== previewId || importing) return; // a newer preview (or the import) took over
        const n = r.added.length;
        // Words already in the course aren't added twice, but their Anki progress can still be kept.
        const known = r.skipped.filter((x) => /already in your words/.test(x.reason));
        const other = r.skipped.filter((x) => !/already in your words/.test(x.reason));
        const studied = words().filter(({ n: x }) => x.type > 0 || x.ivl > 0).length;
        go.disabled = !n && !(known.length && studied);
        go.textContent = n ? `Import ${n} word${n === 1 ? "" : "s"}` : "Keep Anki progress";
        fill(
          report,
          h("p", { class: n || known.length ? "good" : "bad" }, n ? `✓ ${n} new word${n === 1 ? "" : "s"} to import` : known.length ? "✓ All of them are already in your course" : "No words found — check which field is which"),
          known.length ? h("p", { class: "muted" }, `${known.length} already in your course (${known.slice(0, 6).map((x) => x.line.split("\t")[0]).join(" ")}${known.length > 6 ? " …" : ""}) — not added twice.`) : null,
          other.length ? h("details", {}, h("summary", {}, `${other.length} skipped`), h("ul", {}, other.slice(0, 20).map((x) => h("li", {}, h("b", {}, x.line.split("\t")[0]), " — ", x.reason)))) : null,
          window.__localApi && studied
            ? h("label", { class: "switch-row", style: { marginTop: "10px" } }, h("div", {}, "Keep my Anki progress", h("div", { class: "small muted" }, `${studied} studied notes count as learned, with reviews from their Anki intervals`)), keep)
            : null
        );
      } catch (e) {
        fill(report, h("p", { class: "bad" }, e.message));
        go.disabled = true;
      }
    }, 250);
  };
  name.oninput = refresh;

  go.onclick = async () => {
    if (importing) return;
    importing = true;
    clearTimeout(timer);
    go.disabled = true;
    go.textContent = "Importing…";
    try {
      const all = words();
      const r = await api("/api/words/import", { method: "POST", body: { text: lines(), list: name.value } });
      let learned = 0;
      if (keep.checked && window.__localApi) {
        const items = all.map(({ n, w }) => ({ word: w[0], ivl: n.ivl, reps: n.reps, lapses: n.lapses, type: n.type }));
        learned = (await api("/api/words/anki-progress", { method: "POST", body: { list: r.list, items } })).learned;
      }
      bg.remove();
      toast(`🃏 Added ${r.added.length} words to “${r.list}”${learned ? ` · Anki progress kept for ${learned}` : ""}`, 4500);
      done(r.list);
    } catch (e) {
      toast(e.message, 5000);
      importing = false;
      go.disabled = false;
    }
  };

  buildSelects();
  fill(
    body,
    h("p", { class: "muted small", style: { margin: "0 0 12px" } }, `${deck.notes.length} notes. Check which field is which — the preview shows what will be imported. Pictures and sounds are left out.`),
    h("div", { class: "field" }, h("label", {}, "List name"), name),
    selects,
    h("div", { class: "field" }, h("label", {}, "Preview"), table),
    report,
    h("div", { class: "row", style: { gap: "8px", marginTop: "14px" } }, h("button", { class: "btn ghost", onclick: () => bg.remove() }, "Cancel"), go)
  );
  refresh();
}
