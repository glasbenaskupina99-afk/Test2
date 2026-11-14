// Renders the Bloomko Heritage logo (heritage-logo.svg) to the PNG sizes the app needs.
// Usage: node site-tools/brand/render-icons.js   (needs Playwright + Chromium)
const path = require("path");
const fs = require("fs");
const { chromium } = require(process.env.PLAYWRIGHT || "playwright");
const here = __dirname;
const root = path.join(here, "..", "..");
const out = [
  ["app/static/icons/heritage-logo.png", 384, false],
  ["app/static/icons/heritage-icon-192.png", 192, false],
  ["app/static/icons/heritage-icon-512.png", 512, false],
  ...[["mdpi", 48], ["hdpi", 72], ["xhdpi", 96], ["xxhdpi", 144], ["xxxhdpi", 192]].flatMap(([d, s]) => [
    [`mobile/android/app/src/heritage/res/mipmap-${d}/ic_launcher.png`, s, false],
    [`mobile/android/app/src/heritage/res/mipmap-${d}/ic_launcher_round.png`, s, true],
    // Adaptive icon (Android 8+): the leaf alone, inside the 66 % safe zone, on a rust background colour.
    [`mobile/android/app/src/heritage/res/mipmap-${d}/ic_launcher_foreground.png`, Math.round(s * 2.25), "fg"],
  ]),
];
(async () => {
  const b = await chromium.launch({ executablePath: process.env.CHROME || undefined });
  const p = await b.newPage();
  for (const [file, size, round] of out) {
    await p.setViewportSize({ width: size, height: size });
    // Inline the SVG in a page so its @font-face (Lora, next to the SVG) loads.
    let svg = fs.readFileSync(path.join(here, "heritage-logo.svg"), "utf8").replace(/url\((lora-[^)]+)\)/g, (_, f) => `url(file://${path.join(here, f)})`);
    if (round === "fg") svg = svg.replace(/<rect[^>]*\/>/g, "").replace('viewBox="40 40 944 944"', 'viewBox="-210 -210 1444 1444"');
    await p.setContent(`<html><body style="margin:0;background:transparent"><style>svg{width:${size}px;height:${size}px;display:block${round === true ? ";clip-path:circle(50%)" : ""}}</style>${svg}</body></html>`);
    await p.evaluate(() => document.fonts.ready);
    await p.waitForTimeout(150);
    const dest = path.join(root, file);
    fs.mkdirSync(path.dirname(dest), { recursive: true });
    await p.screenshot({ path: dest, omitBackground: true, clip: { x: 0, y: 0, width: size, height: size } });
  }
  await b.close();
  console.log(`${out.length} icons`);
})();
