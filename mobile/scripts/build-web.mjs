// Builds mobile/www from the shared web app in app/static.
import { build } from "esbuild";
import { cpSync, existsSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync, copyFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const mobile = join(here, "..");
const staticDir = join(mobile, "..", "app", "static");
const www = join(mobile, "www");
// Which app to build: "east" (Chinese, Japanese) or "heritage" (lesser-known languages).
const EDITION = process.env.EDITION === "heritage" ? "heritage" : "east";
const EAST = EDITION === "east";

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
// Heading fonts: Shippori Mincho (East, ink-brush feel) and Lora (Heritage, crafted serif).
for (const [pkg, family, files] of [
  ["shippori-mincho", "Shippori Mincho", [["latin", 700]]],
  ["lora", "Lora", [["latin", 700], ["latin-ext", 700]]],
]) {
  for (const [subset, weight] of files) {
    const file = `${pkg}-${subset}-${weight}-normal.woff2`;
    const src = join(mobile, "node_modules", "@fontsource", pkg, "files", file);
    if (!existsSync(src)) continue;
    copyFileSync(src, join(www, "fonts", file));
    const range = subset === "latin-ext" ? ";unicode-range:U+0100-024F,U+1E00-1EFF" : "";
    fontCss += `@font-face{font-family:"${family}";font-weight:${weight};font-style:normal;font-display:swap;src:url(fonts/${file}) format("woff2")${range}}\n`;
  }
}
writeFileSync(join(www, "fonts.css"), fontCss);

/** The opening animation; Heritage gets linen colours, a cream leaf and letters of small languages. */
function splash() {
  const src = readFileSync(join(mobile, "web", "splash.html"), "utf8");
  if (EAST) return src.replace('<div class="name">Bloomko</div>', '<div class="name">Bloomko <span style="font-family:\'Shippori Mincho\',serif;font-weight:700">East</span></div>');
  const letters = [["Č", "-175,-112"], ["Þ", "115,-108"], ["Ħ", "-175,112"], ["Ŵ", "130,110"]];
  let k = 0;
  return src
    .split("\n")
    .map((line) => {
      if (!line.includes('class="layer ch"')) return line;
      const [ch, at] = letters[k++] || letters[0];
      const style = line.match(/style="([^"]*)"/)[1];
      return `      <div class="layer ch" style="${style}"><svg viewBox="40 40 944 944"><g transform="translate(530,500) rotate(-40)"><text x="0" y="0" transform="translate(${at}) rotate(40)" font-family="Lora, Georgia, serif" font-weight="700" font-size="170" fill="#2c4a6e" text-anchor="middle" dominant-baseline="central">${ch}</text></g></svg></div>`;
    })
    .join("\n")
    .replace("html, body { background: #1c3026; }", "html, body { background: #f6efe3; }")
    .replace("radial-gradient(circle at 30% 20%, #2b4a38, #16271e 75%)", "radial-gradient(circle at 30% 20%, #fbf5ea, #efe2cc 75%)")
    .replace(/rgba\(185,207,172,/g, "rgba(211,155,50,")
    .replace('color: #f3ead8;', 'color: #33241b;')
    .replace('font: 900 30px/1 "Nunito", system-ui, sans-serif;', 'font: 700 30px/1 "Lora", Georgia, serif;')
    .replace('stop-color="#b9cfac"', 'stop-color="#fbf3e2"')
    .replace('stop-color="#8fae86"', 'stop-color="#e6d3ad"')
    .replace('stroke="#6f8f6c"', 'stroke="#cbb488"')
    .replace('<div class="name">Bloomko</div>', '<div class="name">Bloomko Heritage</div>');
}

let html = readFileSync(join(staticDir, "index.html"), "utf8");
html = html
  .replace(/<link rel="preconnect"[^>]*>\n?/, "")
  .replace(/<link rel="stylesheet" href="https:\/\/fonts[^>]*>/, '<link rel="stylesheet" href="fonts.css">')
  .replace(/\/static\//g, "")
  .replace('href="/manifest.webmanifest"', 'href="manifest.webmanifest"')
  .replace('<script type="module" src="js/app.js"></script>', '<script type="module" src="app.js"></script>')
  .replace("<title>Bloomko</title>", `<title>${EAST ? "Bloomko East" : "Bloomko Heritage"}</title>`)
  .replace('<html lang="en">', `<html lang="en" data-edition="${EDITION}">`)
  .replace('<meta name="theme-color" content="#1c3026">', `<meta name="theme-color" content="${EAST ? "#1c3026" : "#f6efe3"}">`)
  // Opening animation (app only): dark from the first frame, so there is no white flash.
  .replace("<body>", () => "<body>\n" + splash());
writeFileSync(join(www, "index.html"), html);

// Name, colours and icons of this app in the web manifest.
const manifest = JSON.parse(readFileSync(join(staticDir, "manifest.webmanifest"), "utf8"));
Object.assign(manifest, EAST
  ? { name: "Bloomko East", short_name: "Bloomko East", background_color: "#1c3026", theme_color: "#1c3026" }
  : { name: "Bloomko Heritage", short_name: "Bloomko Heritage", background_color: "#f6efe3", theme_color: "#f6efe3",
      icons: (manifest.icons || []).filter((i) => i.src.endsWith(".png")).map((i) => ({ ...i, src: i.src.replace(/icon-(\d+)\.png/, "heritage-icon-$1.png") })) });
writeFileSync(join(www, "manifest.webmanifest"), JSON.stringify(manifest, null, 2));

// Ready-made memory hooks, one file per language, loaded by the app when needed.
cpSync(join(mobile, "..", "app", "data", "extras"), join(www, "extras"), { recursive: true });
cpSync(join(mobile, "..", "app", "data", "grammar"), join(www, "grammar"), { recursive: true });
cpSync(join(mobile, "..", "app", "data", "stories"), join(www, "stories"), { recursive: true });
// Which parts every character is made of, for the character map.
if (EAST) copyFileSync(join(mobile, "..", "app", "data", "charmap.json"), join(www, "charmap.json"));
// Interface and content translations (French, Spanish, Japanese).
cpSync(join(mobile, "..", "app", "data", "i18n"), join(www, "i18n"), { recursive: true, filter: (src) => !src.endsWith("ui-strings.json") });

// Stroke data for every character, bundled for offline use.
const charSrc = join(mobile, "node_modules", "hanzi-writer-data");
mkdirSync(join(www, "chars"), { recursive: true });
let n = 0;
for (const f of EAST ? readdirSync(charSrc) : []) {
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
for (const f of EAST ? readdirSync(jaSrc) : []) {
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
    __APP_VERSION__: JSON.stringify(process.env.APP_VERSION ? `1.10.${process.env.APP_VERSION}` : "1.10-dev"),
    __EDITION__: JSON.stringify(EDITION),
  },
});

console.log(`www built (Bloomko ${EAST ? "East" : "Heritage"}): ${n} Chinese + ${nja} Japanese characters of stroke data`);
