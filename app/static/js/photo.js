// Words from a photo: take a picture of a sign, menu or book page, the phone reads the text
// (ML Kit, on the phone) and you pick which new words go into your own list.
import { api, h, toast } from "./util.js";
import { state, course, isJa, isSl } from "./state.js";
import { speak } from "./audio.js";

const LIST = "📷 From photos";

export const canReadPhotos = () => !!window.__native?.ocr;

/** Downscales the photo (big camera images are slow to read) and returns base64 JPEG. */
async function shrink(file, max = 1800) {
  const url = URL.createObjectURL(file);
  try {
    const img = await new Promise((resolve, reject) => {
      const i = new Image();
      i.onload = () => resolve(i);
      i.onerror = () => reject(new Error("Couldn't open the photo"));
      i.src = url;
    });
    const scale = Math.min(1, max / Math.max(img.naturalWidth, img.naturalHeight));
    const c = document.createElement("canvas");
    c.width = Math.round(img.naturalWidth * scale);
    c.height = Math.round(img.naturalHeight * scale);
    c.getContext("2d").drawImage(img, 0, 0, c.width, c.height);
    return { b64: c.toDataURL("image/jpeg", 0.9).split(",")[1], preview: c.toDataURL("image/jpeg", 0.6) };
  } finally {
    URL.revokeObjectURL(url);
  }
}

/** Entry point: pick or take a photo. */
export function photoSheet(onAdded) {
  const bg = h("div", { class: "sheet-bg", onclick: (e) => e.target === bg && bg.remove() });
  const pick = (capture) => {
    const input = h("input", { type: "file", accept: "image/*", hidden: true, ...(capture ? { capture: "environment" } : {}) });
    input.onchange = () => {
      const f = input.files[0];
      input.remove();
      if (f) { bg.remove(); readPhoto(f, onAdded); }
    };
    document.body.append(input);
    input.click();
  };
  bg.append(
    h(
      "div",
      { class: "sheet" },
      h("h2", { style: { margin: "0 0 4px" } }, "Words from a photo"),
      h("p", { class: "muted small", style: { margin: "0 0 14px" } }, `Take a photo of a sign, a menu or a page from your book. Bloomko reads the ${isSl() ? "text" : isJa() ? "Japanese" : "Chinese"} on it, shows which words you already know and lets you add the new ones.`),
      h("button", { class: "mode-opt", onclick: () => pick(true) }, h("span", { class: "mo-ico" }, "📷"), h("span", {}, h("b", {}, "Take a photo"), h("small", {}, "Hold the phone steady, text not too small"))),
      h("button", { class: "mode-opt", onclick: () => pick(false) }, h("span", { class: "mo-ico" }, "🖼️"), h("span", {}, h("b", {}, "Choose from gallery"), h("small", {}, "A photo or screenshot you already have")))
    )
  );
  document.body.append(bg);
}

async function readPhoto(file, onAdded) {
  const bg = h("div", { class: "sheet-bg" });
  const sheet = h("div", { class: "sheet photo-sheet" }, h("h2", { style: { margin: "0 0 10px" } }, "Reading the text…"), h("div", { class: "spinner" }));
  bg.append(sheet);
  document.body.append(bg);
  bg.onclick = (e) => e.target === bg && bg.remove();
  try {
    const { b64, preview } = await shrink(file);
    const script = course() === "sl" ? "latin" : course();
    const r = await window.__native.ocr.recognize({ image: b64, script });
    const text = String(r.text || "").trim();
    if (!text) throw new Error("No text found — try a sharper photo, closer to the text");
    const { words } = await api("/api/photo/words", { method: "POST", body: { text } });
    showResult(sheet, bg, preview, text, words, onAdded);
  } catch (e) {
    sheet.replaceChildren(
      h("h2", { style: { margin: "0 0 6px" } }, "Couldn't read that"),
      h("p", { class: "muted" }, e.message),
      h("button", { class: "btn", onclick: () => { bg.remove(); photoSheet(onAdded); } }, "Try another photo")
    );
  }
}

function showResult(sheet, bg, preview, text, words, onAdded) {
  const known = words.filter((w) => w.kind !== "new");
  const fresh = words.filter((w) => w.kind === "new");
  const rows = fresh.map((w) => {
    const check = h("input", { type: "checkbox", class: "ph-check", checked: true });
    const reading = isSl() ? null : h("input", { class: "input ph-reading", value: w.r || "", placeholder: isJa() ? "reading (hiragana)" : "pinyin" });
    const meaning = h("input", { class: "input ph-meaning", value: w.m || "", placeholder: "meaning in English" });
    const row = h(
      "div",
      { class: "ph-row" },
      check,
      h("button", { class: "ph-word hz", onclick: () => speak(w.t), title: "Listen" }, w.t),
      h("div", { class: "ph-fields" }, reading, meaning)
    );
    return { w, row, check, reading, meaning };
  });

  const fill = state.settings?.ai_enabled && fresh.length
    ? h("button", {
        class: "btn ghost small",
        onclick: async (e) => {
          const b = e.currentTarget;
          b.disabled = true;
          let done = 0;
          for (const x of rows) {
            if (!x.check.checked || (x.meaning.value.trim() && (!x.reading || x.reading.value.trim()))) continue;
            b.textContent = `✨ Gemma… ${++done}`;
            try {
              const d = await api("/api/words/ai-fill", { method: "POST", body: { query: x.w.t } });
              if (!x.meaning.value.trim() && d.english) x.meaning.value = d.english;
              if (x.reading && !x.reading.value.trim() && d.pinyin) x.reading.value = d.pinyin;
            } catch (err) {
              toast(err.message, 3000);
              break;
            }
          }
          b.textContent = "✨ Fill in with Gemma";
          b.disabled = false;
        },
      }, "✨ Fill in with Gemma")
    : null;

  const add = h("button", {
    class: "btn",
    onclick: async () => {
      const pickRows = rows.filter((x) => x.check.checked);
      const missing = pickRows.filter((x) => !x.meaning.value.trim() || (isJa() && !x.reading.value.trim()));
      if (!pickRows.length) return toast("Tick the words you want to add");
      if (missing.length) {
        missing.forEach((x) => x.row.classList.add("ph-missing"));
        return toast(isJa() ? "Add the reading and meaning for the marked words (or untick them)" : "Add a meaning for the marked words (or untick them)", 4000);
      }
      const lines = pickRows.map((x) => [x.w.t, x.reading ? x.reading.value.trim() : "", x.meaning.value.trim()].filter((v, i) => v || i !== 1).join("\t"));
      try {
        const r = await api("/api/words/import", { method: "POST", body: { list: LIST, text: lines.join("\n") } });
        bg.remove();
        toast(`📷 Added ${r.added.length} word${r.added.length === 1 ? "" : "s"} to “${LIST}”${r.skipped.length ? ` · ${r.skipped.length} skipped` : ""}`, 4000);
        onAdded?.();
      } catch (e) {
        toast(e.message, 4000);
      }
    },
  }, fresh.length ? "Add to my words" : "Done");
  if (!fresh.length) add.onclick = () => bg.remove();

  const textBox = h("details", { class: "ph-text" }, h("summary", {}, "Text on the photo"), h("p", { class: "hz" }, text));
  sheet.replaceChildren(
    h("div", { class: "ph-head" }, h("img", { class: "ph-preview", src: preview, alt: "" }), h("div", {}, h("h2", { style: { margin: 0 } }, "Words in the photo"), h("p", { class: "muted small", style: { margin: "2px 0 0" } }, `${known.length} in your course · ${fresh.length} new`))),
    textBox,
    known.length
      ? h(
          "div",
          { class: "ph-known" },
          known.map((w) => h("button", { class: "ph-chip" + (w.kind === "learned" ? " learned" : ""), onclick: () => speak(w.t), title: `${w.r} · ${w.m}` }, h("b", { class: "hz" }, w.t), h("small", {}, w.kind === "learned" ? "✓ learned" : w.level)))
        )
      : null,
    fresh.length ? h("div", { class: "row", style: { alignItems: "center", margin: "14px 0 6px" } }, h("b", {}, "New words"), h("span", { class: "spacer" }), fill) : h("p", { class: "muted small" }, "Every word here is already in your course 🎉"),
    fresh.length ? h("p", { class: "small muted", style: { margin: "0 0 8px" } }, `They go into your own list “${LIST}”, where you learn them like any level.`) : null,
    h("div", { class: "ph-rows" }, rows.map((x) => x.row)),
    h("div", { style: { marginTop: "12px" } }, add)
  );
}
