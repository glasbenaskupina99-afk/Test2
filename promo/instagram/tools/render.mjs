// Renders a reel: <name>.html → <name>.mp4 (1080×1920, 30 fps) with the sound from quiz_sfx.py.
// node tools/render.mjs <name> <seconds> '<events json>'
import { chromium } from "playwright";
import { spawn, execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
// Run from mobile/ (where Playwright is installed) with REEL_DIR=promo/instagram, or from here.
const DIR = process.env.REEL_DIR || join(dirname(fileURLToPath(import.meta.url)), "..");
const [name, dur, events] = process.argv.slice(2);
const D = Number(dur), FPS = 30, frames = Math.round(D * FPS);
const wav = `/tmp/${name}.wav`, silent = `/tmp/${name}.silent.mp4`;
execFileSync("python3", [join(DIR, "tools/quiz_sfx.py"), name, String(D), events, wav]);
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH });
const page = await browser.newPage({ viewport: { width: 1080, height: 1920 } });
await page.goto("file://" + join(DIR, `${name}.html`));
await page.evaluate(() => document.fonts.ready);
await page.waitForTimeout(400);
const ff = spawn("ffmpeg", ["-y", "-loglevel", "error", "-f", "image2pipe", "-framerate", String(FPS), "-i", "-", "-c:v", "libx264", "-pix_fmt", "yuv420p", "-crf", "20", "-preset", "medium", silent], { stdio: ["pipe", "inherit", "inherit"] });
for (let i = 0; i < frames; i++) {
  await page.evaluate((ms) => window.seek(ms), (i * 1000) / FPS);
  const buf = await page.screenshot({ type: "jpeg", quality: 92 });
  if (!ff.stdin.write(buf)) await new Promise((r) => ff.stdin.once("drain", r));
}
ff.stdin.end();
await new Promise((r) => ff.on("close", r));
await browser.close();
execFileSync("ffmpeg", ["-y", "-loglevel", "error", "-i", silent, "-i", wav, "-c:v", "copy", "-c:a", "aac", "-b:a", "160k", "-shortest", join(DIR, `${name}.mp4`)]);
console.log(name, D + "s ok");
