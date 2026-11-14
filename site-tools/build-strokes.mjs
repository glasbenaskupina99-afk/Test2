// Copies stroke-order data for every character in the built-in word lists into site/strokes/,
// so the word pages on bloomko.eu can animate them without a CDN. Also writes
// worker/stroke-counts.json (character → number of strokes) for the page text.
// Run after `cd mobile && npm run build` (it reads the prepared data from mobile/www):
//   node site-tools/build-strokes.mjs
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const LISTS = { zh: ["hsk1", "hsk2", "hsk3"], ja: ["japanese_kana", "japanese_n5", "japanese_n4", "japanese_n3"] };
const SRC = { zh: join(root, "mobile/www/chars"), ja: join(root, "mobile/www/chars-ja") };

const counts = { zh: {}, ja: {} };
for (const [lang, files] of Object.entries(LISTS)) {
  const out = join(root, "site/strokes", lang);
  rmSync(out, { recursive: true, force: true });
  mkdirSync(out, { recursive: true });
  const chars = new Set();
  for (const f of files) {
    const data = JSON.parse(readFileSync(join(root, "app/data", `${f}.json`), "utf8"));
    for (const u of data.units) for (const [word] of u.words) for (const c of word) chars.add(c);
  }
  let missing = 0;
  for (const c of chars) {
    const src = join(SRC[lang], `${c}.json`);
    if (!existsSync(src)) { missing++; continue; }
    const d = JSON.parse(readFileSync(src, "utf8"));
    writeFileSync(join(out, `${c.codePointAt(0).toString(16)}.json`), JSON.stringify(d));
    counts[lang][c] = d.strokes.length;
  }
  console.log(`${lang}: ${Object.keys(counts[lang]).length} characters (${missing} without stroke data)`);
}
writeFileSync(join(root, "worker/stroke-counts.json"), JSON.stringify(counts));
