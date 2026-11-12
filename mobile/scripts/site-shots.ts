// Screenshots of the app for bloomko.eu, in every interface language.
// Build the app first (npm run build, or EDITION=heritage npm run build), then:
//   npx tsx scripts/site-shots.ts      → ../site/img/<lang>/<edition>-<shot>.png
// (then convert them to .webp, about 560 px wide, e.g. with Pillow)
import { createServer } from "node:http";
import { readFile, mkdir } from "node:fs/promises";
import { existsSync, readFileSync } from "node:fs";
import { extname, join, resolve } from "node:path";
import { chromium, type Page } from "playwright";

const WWW = resolve(process.env.WWW || new URL("../www", import.meta.url).pathname);
const OUT = resolve(new URL("../../site/img", import.meta.url).pathname);
const edition = /data-edition="heritage"/.test(readFileSync(join(WWW, "index.html"), "utf8")) ? "heritage" : "east";
const LANGS = (process.env.LANGS || "en,fr,es,ja").split(",");
const NAMES = { en: "Mia", fr: "Léa", es: "Lucía", ja: "Yui" };
const TYPES = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css", ".json": "application/json", ".wasm": "application/wasm", ".svg": "image/svg+xml", ".png": "image/png", ".woff2": "font/woff2" };

const server = createServer(async (req, res) => {
  const path = decodeURIComponent(new URL(req.url, "http://x").pathname);
  const file = join(WWW, path.endsWith("/") ? path + "index.html" : path);
  try {
    const body = await readFile(file);
    res.writeHead(200, { "Content-Type": TYPES[extname(file)] || "application/octet-stream" });
    res.end(body);
  } catch {
    res.writeHead(404);
    res.end();
  }
});
await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
const base = `http://127.0.0.1:${(server.address() as any).port}`;
const browser = await chromium.launch(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {});

const day = (n: number) => {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};

async function shoot(lang: string) {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, locale: lang });
  await ctx.addInitScript(() => {
    if (window.speechSynthesis) window.speechSynthesis.speak = () => {};
    (window as any).__syncUrl = (window as any).__backupUrl = (window as any).__friendsUrl = (window as any).__accountUrl = "http://127.0.0.1:9/none";
  });
  const page = await ctx.newPage();
  page.on("pageerror", (e) => console.error(lang, e.message));
  await page.goto(base);
  await page.waitForSelector(".welcome", { timeout: 20000 });
  await page.evaluate(() => document.getElementById("splash")?.remove());
  const api = (p: string, o?: any) => page.evaluate(([p, o]) => window.__localApi(p, o), [p, o] as const);
  await page.fill(".welcome input", NAMES[lang]);
  await page.click(".welcome-go");
  await page.waitForSelector(".account-step, .tutorial");
  if (await page.locator(".account-step").count()) await page.click(".account-step .acc-skip");
  await page.waitForSelector(".tutorial");
  await page.click(".tut-top .link-btn");

  // A learner a month in: a few hundred words, a 23-day streak, a couple of plants that need water.
  const words = await api("/api/words");
  await api("/api/learn/complete", { method: "POST", body: { word_ids: words.slice(0, edition === "east" ? 240 : 150).map((w: any) => w.id), xp: 0 } });
  const db = await api("/api/backup");
  db.activity = {};
  for (let i = 0; i < 23; i++) db.activity[day(i)] = { xp: 40 + ((i * 37) % 60), new_words: 6 + (i % 5), reviews: 20 + ((i * 13) % 30), sentences: 2, seconds: 900 };
  // Words known for a while (plants of every size); a few are thirsty or wilting.
  const at = (days: number) => {
    const d = new Date(Date.now() + days * 86400000);
    const p = (n: number) => String(n).padStart(2, "0");
    return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}:00`;
  };
  db.cards.forEach((c: any) => {
    const k = c.word_id;
    c.interval = [2, 5, 9, 14, 22, 35, 48][k % 7];
    c.reps = 3 + (k % 5);
    c.lapses = 0;
    c.stability = c.interval;
    c.last_review = at(-c.interval / 2);
    c.due = k % 23 === 5 ? at(-0.3) : k % 37 === 9 ? at(-c.interval * 1.4) : at(c.interval / 2);
  });
  db.settings.ui_lang = lang;
  await api("/api/backup/restore", { method: "POST", body: db });
  await page.goto(base + "/#/");
  await page.waitForSelector(".garden-hero, .home", { timeout: 20000 });
  await page.evaluate(() => document.getElementById("splash")?.remove());
  await page.waitForTimeout(1500);
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.waitForTimeout(300);

  const dir = join(OUT, lang);
  await mkdir(dir, { recursive: true });
  const snap = (name: string) => page.screenshot({ path: join(dir, `${edition}-${name}.png`) });

  await snap("home");
  await page.evaluate(() => (location.hash = "#/forest"));
  await page.waitForSelector(".bed-svg g.gplant", { timeout: 15000 });
  await page.waitForTimeout(2500);
  const plant = page.locator(".bed-svg g.gplant").nth(4);
  await plant.scrollIntoViewIfNeeded();
  await page.evaluate(() => window.scrollBy(0, 120));
  await plant.click();
  await page.waitForSelector(".plant-tag", { timeout: 3000 });
  await page.waitForTimeout(500);
  await snap("garden");
  await page.evaluate(() => (location.hash = "#/words"));
  await page.waitForTimeout(1800);
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.waitForTimeout(400);
  await snap("words");

  // East: a new word in a lesson, with its stroke order. Heritage: an ending drill in a grammar lesson.
  await page.evaluate(() => (location.hash = "#/"));
  await page.waitForSelector(".home-head");
  if (edition === "east") {
    await page.click(".primary-go");
    await page.locator(".sheet .mode").first().click(); // the full lesson, with writing
    await page.waitForSelector(".lesson", { timeout: 15000 });
    await page.waitForTimeout(4500); // the stroke-order animation draws the character
    await snap("learn");
  } else {
    await page.locator(".tile").nth(1).click(); // Grammar (second tile: Practice, Grammar, …)
    await page.waitForSelector(".lesson", { timeout: 15000 });
    // Through the grammar intros to the first ending drill (the gap with its basic form).
    for (let i = 0; i < 40 && !(await page.locator(".lesson .g-base").count()); i++) {
      const c = page.locator(".lesson .choice").first();
      if (await c.isVisible().catch(() => false)) await c.click();
      const b = page.locator(".lesson .lesson-foot .btn").last();
      if (await b.isVisible().catch(() => false)) await b.click().catch(() => {});
      await page.waitForTimeout(250);
    }
    await page.waitForTimeout(600);
    await snap("drill");
  }
  await ctx.close();
  console.log(edition, lang, "ok");
}

for (const l of LANGS) await shoot(l);
await browser.close();
server.close();
