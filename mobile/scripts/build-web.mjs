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

for (const item of ["css", "vendor", "icon.svg", "manifest.webmanifest"]) {
  cpSync(join(staticDir, item), join(www, item), { recursive: true });
}

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

await build({
  entryPoints: [join(mobile, "src", "main.js")],
  bundle: true,
  format: "esm",
  target: "es2022",
  minify: true,
  outfile: join(www, "app.js"),
  loader: { ".json": "json" },
  logLevel: "warning",
});

console.log(`www built: ${n} characters of stroke data`);
