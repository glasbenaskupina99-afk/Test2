// Builds mobile/www from the shared web app in app/static.
import { build } from "esbuild";
import { cpSync, existsSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync, copyFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const mobile = join(here, "..");
const staticDir = join(mobile, "..", "app", "static");
const www = join(mobile, "www");

rmSync(www, { recursive: true, force: true });
mkdirSync(www, { recursive: true });

for (const item of ["css", "vendor", "icons", "icon.svg", "manifest.webmanifest"]) {
  cpSync(join(staticDir, item), join(www, item), { recursive: true });
}
copyFileSync(join(mobile, "web", "sw.js"), join(www, "sw.js"));

// Fonts bundled so the app looks right offline.
const fontDir = join(mobile, "node_modules", "@fontsource", "nunito", "files");
mkdirSync(join(www, "fonts"), { recursive: true });
let fontCss = "";
for (const weight of [600, 700, 800, 900]) {
  const file = `nunito-latin-${weight}-normal.woff2`;
  if (existsSync(join(fontDir, file))) {
    copyFileSync(join(fontDir, file), join(www, "fonts", file));
    fontCss += `@font-face{font-family:"Nunito";font-weight:${weight};font-style:normal;font-display:swap;src:url(fonts/${file}) format("woff2")}\n`;
  }
}
writeFileSync(join(www, "fonts.css"), fontCss);

let html = readFileSync(join(staticDir, "index.html"), "utf8");
html = html
  .replace(/<link rel="preconnect"[^>]*>\n?/, "")
  .replace(/<link rel="stylesheet" href="https:\/\/fonts[^>]*>/, '<link rel="stylesheet" href="fonts.css">')
  .replace(/\/static\//g, "")
  .replace('href="/manifest.webmanifest"', 'href="manifest.webmanifest"')
  .replace('<script type="module" src="js/app.js"></script>', '<script type="module" src="app.js"></script>');
writeFileSync(join(www, "index.html"), html);

// Ready-made memory hooks, one file per language, loaded by the app when needed.
cpSync(join(mobile, "..", "app", "data", "extras"), join(www, "extras"), { recursive: true });

// Stroke data for every character, bundled for offline use.
const charSrc = join(mobile, "node_modules", "hanzi-writer-data");
mkdirSync(join(www, "chars"), { recursive: true });
let n = 0;
for (const f of readdirSync(charSrc)) {
  if (f.endsWith(".json") && [...f.replace(/\.json$/, "")].length === 1) {
    copyFileSync(join(charSrc, f), join(www, "chars", f));
    n++;
  }
}

// Japanese stroke data (kanji + kana, Japanese stroke order) for the Japanese course.
// animCJK splits the loop of some hiragana into two paths for animation; the second piece
// ends where the first does and is drawn backwards. Merge them so the stroke count matches
// how the kana is really written (あ = 3 strokes, not 4).
const KANA_STROKES = { あ: 3, お: 3, す: 2, な: 4, ぬ: 2, ね: 2, の: 1, は: 3, ほ: 4, ま: 3, み: 2, む: 3, め: 2, よ: 2, る: 1 };
const inBounds = ([x, y]) => x >= 0 && x <= 1024 && y >= -124 && y <= 900;
// Bounding box of an outline path, used to trim the off-shape tail of a split piece.
function pathBox(d) {
  const nums = (d.match(/-?\d+(\.\d+)?/g) || []).map(Number);
  const xs = nums.filter((_, i) => i % 2 === 0);
  const ys = nums.filter((_, i) => i % 2 === 1);
  return { x0: Math.min(...xs) - 15, x1: Math.max(...xs) + 15, y0: Math.min(...ys) - 15, y1: Math.max(...ys) + 15 };
}
const inBox = (b) => ([x, y]) => x >= b.x0 && x <= b.x1 && y >= b.y0 && y <= b.y1;
export function mergeSplitStrokes(data, target) {
  const strokes = [];
  const medians = [];
  const ends = data.medians.map((m) => m.at(-1));
  for (let i = 0; i < data.strokes.length; i++) {
    const prev = medians.length - 1;
    const anchor = prev >= 0 ? ends[medians[prev].firstIndex] : null;
    const extraNeeded = data.strokes.length - i > target - strokes.length;
    if (anchor && extraNeeded && Math.hypot(anchor[0] - ends[i][0], anchor[1] - ends[i][1]) < 60) {
      // Same end point as the stroke it belongs to: continue that stroke (reversed piece).
      const box = inBox(pathBox(data.strokes[i]));
      medians[prev].points.push(...data.medians[i].slice(0, -1).reverse().filter((p) => inBounds(p) && box(p)));
      strokes[prev] += ` ${data.strokes[i]}`;
    } else {
      medians.push({ firstIndex: i, points: data.medians[i].slice() });
      strokes.push(data.strokes[i]);
    }
  }
  return { ...data, strokes, medians: medians.map((m) => m.points) };
}

const jaSrc = join(mobile, "node_modules", "@k1low", "hanzi-writer-data-jp");
mkdirSync(join(www, "chars-ja"), { recursive: true });
let nja = 0;
for (const f of readdirSync(jaSrc)) {
  const ch = f.replace(/\.json$/, "");
  if (!f.endsWith(".json") || f === "package.json" || [...ch].length !== 1) continue;
  if (KANA_STROKES[ch]) {
    const data = mergeSplitStrokes(JSON.parse(readFileSync(join(jaSrc, f), "utf8")), KANA_STROKES[ch]);
    if (data.strokes.length !== KANA_STROKES[ch]) console.warn(`could not fix strokes for ${ch}`);
    writeFileSync(join(www, "chars-ja", f), JSON.stringify(data));
  } else {
    copyFileSync(join(jaSrc, f), join(www, "chars-ja", f));
  }
  nja++;
}

await build({
  entryPoints: [join(mobile, "src", "main.js")],
  bundle: true,
  format: "esm",
  target: "es2022",
  minify: true,
  outfile: join(www, "app.js"),
  loader: { ".json": "json" },
  logLevel: "warning",
  define: {
    __APP_VERSION__: JSON.stringify(process.env.APP_VERSION ? `1.3.${process.env.APP_VERSION}` : "1.3-dev"),
  },
});

console.log(`www built: ${n} Chinese + ${nja} Japanese characters of stroke data`);
