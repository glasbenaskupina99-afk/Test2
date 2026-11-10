// End-to-end: the built app (mobile/www, or $WWW) in Chromium, as a learner would use it.
// Run after `npm run build` (East) or `EDITION=heritage npm run build`: npm run test:e2e
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { createServer, type Server } from "node:http";
import { readFile } from "node:fs/promises";
import { existsSync, readFileSync } from "node:fs";
import { extname, join, resolve } from "node:path";
import { chromium, type Browser, type Page } from "playwright";

const WWW = resolve(process.env.WWW || new URL("../../www", import.meta.url).pathname);
const FIXTURES = new URL("../fixtures/", import.meta.url).pathname;
const TYPES: Record<string, string> = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css", ".json": "application/json", ".wasm": "application/wasm", ".svg": "image/svg+xml", ".png": "image/png", ".woff2": "font/woff2", ".webmanifest": "application/manifest+json" };

let server: Server;
let browser: Browser;
let base = "";
// Which app was built: some tests are only for Bloomko East (mock exams, Chinese Anki deck).
const edition = existsSync(join(WWW, "index.html")) && /data-edition="heritage"/.test(readFileSync(join(WWW, "index.html"), "utf8")) ? "heritage" : "east";

before(async () => {
  assert.ok(existsSync(join(WWW, "index.html")), `no build in ${WWW} — run npm run build first`);
  server = createServer(async (req, res) => {
    const path = decodeURIComponent(new URL(req.url, "http://x").pathname);
    const file = join(WWW, path.endsWith("/") ? path + "index.html" : path);
    try {
      const body = await readFile(file);
      res.writeHead(200, { "Content-Type": TYPES[extname(file)] || "application/octet-stream" });
      res.end(body);
    } catch {
      res.writeHead(404, { "Content-Type": "text/plain" });
      res.end("not found");
    }
  });
  await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
  base = `http://127.0.0.1:${(server.address() as any).port}`;
  browser = await chromium.launch(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {});
});

after(async () => {
  await browser?.close();
  server?.close();
});

/** A fresh device: no data, the app open on the welcome screen. Page errors fail the test. */
async function fresh(): Promise<{ page: Page; errors: string[]; api: (path: string, opts?: any) => Promise<any> }> {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } });
  // No sound in tests, and no requests to bloomko.eu.
  await ctx.addInitScript(() => {
    if (window.speechSynthesis) window.speechSynthesis.speak = () => {};
    (window as any).__syncUrl = (window as any).__backupUrl = "http://127.0.0.1:9/none";
  });
  const page = await ctx.newPage();
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto(base);
  await page.waitForSelector(".welcome", { timeout: 20000 });
  await page.evaluate(() => document.getElementById("splash")?.remove());
  const api = (path: string, opts?: any) => page.evaluate(([p, o]) => window.__localApi(p, o), [path, opts] as const);
  return { page, errors, api };
}

async function start(page: Page, name = "Ana") {
  await page.fill(".welcome input", name);
  await page.click(".welcome-go");
  await page.waitForSelector(".tutorial");
}

const go = async (page: Page, hash: string, selector: string) => {
  await page.evaluate((h) => (location.hash = h), hash);
  await page.waitForSelector(selector, { timeout: 15000 });
};

/** Answer whatever exercise is showing, correctly, then press Continue. */
async function answer(page: Page, words: any[]) {
  const text = await page.locator(".lesson").innerText();
  const kicker = (await page.locator(".lesson .ex-kicker").first().innerText().catch(() => "")).trim();
  const quoted = (text.match(/“([^”]+)”/) || [])[1];
  const word = words.find((w) => w.english === quoted) || words.find((w) => text.includes(w.hanzi) && w.hanzi.length > 1) || words.find((w) => text.includes(w.hanzi));
  const choices = page.locator(".lesson .choice");
  const input = page.locator(".lesson-body input.input");
  if (/NEW WORD/i.test(kicker)) {
    // just look at it
  } else if (await choices.count()) {
    const n = await choices.count();
    let hit = 0;
    for (let i = 0; i < n; i++) {
      const t = (await choices.nth(i).innerText()).trim();
      if (word && [word.english, word.hanzi, word.pinyin].includes(t)) hit = i;
    }
    await choices.nth(hit).click();
    const check = page.locator(".lesson-foot .btn", { hasText: "Check" });
    if (await check.count()) await check.click();
  } else if (await input.count()) {
    await input.first().fill(word ? (/reading|pinyin/i.test(kicker) ? word.pinyin : word.hanzi) : "x");
    await page.locator(".lesson-foot .btn").last().click();
  } else {
    const skip = page.locator(".lesson button", { hasText: /can.t (speak|listen)|skip/i });
    if (await skip.count()) await skip.first().click();
  }
  const cont = page.locator(".lesson-foot .btn").last();
  await cont.waitFor({ timeout: 5000 }).catch(() => {});
  if (await cont.isEnabled().catch(() => false)) await cont.click();
  await page.waitForTimeout(150);
}

async function finishLesson(page: Page, words: any[], end: RegExp) {
  for (let i = 0; i < 80; i++) {
    if (await page.locator(".lesson", { hasText: end }).count()) return;
    if (!(await page.locator(".lesson").count())) break;
    await answer(page, words);
  }
  assert.ok(await page.locator(".lesson", { hasText: end }).count(), `lesson ended with ${end}`);
}

test("first start: welcome, the 5-step tutorial, complete beginner", async () => {
  const { page, errors, api } = await fresh();
  await start(page);
  for (let i = 0; i < 5; i++) await page.click(".tut-foot .btn:not(.ghost)");
  await page.click(".tut-choice .btn.ghost");
  await page.waitForSelector(".home-head");
  assert.equal(await page.locator(".place-card").count(), 0, "the placement card isn't offered again");
  assert.equal((await api("/api/settings")).display_name, "Ana");
  assert.deepEqual(errors, []);
});

test("placement test from the tutorial marks known words as learned", async () => {
  const { page, errors, api } = await fresh();
  await start(page);
  for (let i = 0; i < 5; i++) await page.click(".tut-foot .btn:not(.ghost)");
  await page.click(".tut-choice .btn:not(.ghost)");
  await page.click(".place .lesson-foot .btn");
  const words = await api("/api/words");
  for (let i = 0; i < 40 && (await page.locator(".place .place-word").count()); i++) {
    const shown = (await page.locator(".place .place-word > div").first().innerText()).trim();
    const meaning = words.find((w: any) => w.hanzi === shown)?.english;
    if (i < 9) await page.locator(".place .choice", { hasText: meaning }).first().click();
    else await page.click(".place .lesson-foot .btn.ghost");
  }
  await page.locator(".place .lesson-foot .btn").last().click();
  await page.waitForSelector(".home-head");
  assert.ok((await api("/api/home")).learned >= 30, "the first blocks count as learned");
  assert.deepEqual(errors, []);
});

test("learn new words (choice only) from start to finish", async () => {
  const { page, errors, api } = await fresh();
  await start(page);
  await page.click(".tut-top .link-btn");
  await page.waitForSelector(".primary-go");
  const words = await api("/api/words");
  await page.click(".primary-go");
  await page.locator(".sheet .mode", { hasText: "Choice only" }).click();
  await page.waitForSelector(".lesson");
  await finishLesson(page, words, /New words learned!/);
  await page.locator(".lesson-foot .btn").last().click();
  await page.waitForSelector(".home-head");
  assert.ok((await api("/api/home")).learned >= 3);
  assert.deepEqual(errors, []);
});

test("practice: due words come back and can be reviewed", async () => {
  const { page, errors, api } = await fresh();
  await start(page);
  await page.click(".tut-top .link-btn");
  const words = await api("/api/words");
  await api("/api/learn/complete", { method: "POST", body: { word_ids: words.slice(0, 20).map((w: any) => w.id), xp: 0 } });
  // Make them due now (edited away from the app, which saves its own copy when it closes).
  await page.waitForTimeout(800);
  await page.goto(`${base}/nothing-here.txt`);
  await page.evaluate(() => {
    const db = JSON.parse(localStorage.getItem("hanzi-db"));
    db.cards.forEach((c: any) => (c.due = "2000-01-01 00:00:00"));
    localStorage.setItem("hanzi-db", JSON.stringify(db));
  });
  await page.goto(base);
  await page.waitForSelector(".home-head");
  await page.evaluate(() => document.getElementById("splash")?.remove());
  assert.ok((await api("/api/home")).due > 0);
  await page.locator(".tile", { hasText: "Practice" }).first().click().catch(() => page.click(".primary-go"));
  await page.locator(".sheet .mode", { hasText: "Choice only" }).click();
  await page.waitForSelector(".lesson");
  await finishLesson(page, words, /practice (done|complete)/i);
  assert.deepEqual(errors, []);
});

test("every main screen opens without errors", async () => {
  const { page, errors, api } = await fresh();
  await start(page);
  await page.click(".tut-top .link-btn");
  const words = await api("/api/words");
  await api("/api/learn/complete", { method: "POST", body: { word_ids: words.slice(0, 60).map((w: any) => w.id), xp: 0 } });
  const screens: [string, string][] = [["#/words", ".topbar"], ["#/stats", ".screen"], ["#/settings", ".sync-card"], ["#/forest", ".season-banner"], ["#/weak", ".screen h2"], ["#/", ".home-head"]];
  if (edition === "east") screens.push(["#/map", ".cm"], ["#/exams", ".exam-card"]);
  for (const [hash, sel] of screens) await go(page, hash, sel);
  // Grammar opens once enough words are known.
  await go(page, "#/", ".home-head");
  await page.locator(".tile", { hasText: "Grammar" }).first().click();
  await page.waitForSelector(".lesson");
  assert.deepEqual(errors, []);
});

test("mock exam: a short exam can be taken to the result", { skip: edition !== "east" }, async () => {
  const { page, errors } = await fresh();
  await start(page);
  await page.click(".tut-top .link-btn");
  await go(page, "#/exams", ".exam-card");
  await page.locator(".exam-card .btn.ghost").first().click();
  for (let i = 0; i < 200 && !(await page.locator(".exam .exam-result").count()); i++) {
    if (await page.locator(".exam .exam-intro").count()) await page.click(".exam .lesson-foot .btn");
    else {
      await page.locator(".exam .exam-opt").first().click();
      await page.locator(".exam .lesson-foot .btn").last().click();
      if (await page.locator(".dialog").count()) await page.click(".dialog .btn.ghost");
    }
  }
  await page.waitForSelector(".exam .exam-result", { timeout: 10000 });
  assert.match(await page.locator(".exam .er-total").innerText(), /\d+\s*\/\s*200/);
  assert.deepEqual(errors, []);
});

test("Anki deck import (.apkg) with progress", { skip: edition !== "east" }, async () => {
  const { page, errors, api } = await fresh();
  await start(page);
  await page.click(".tut-top .link-btn");
  await go(page, "#/words", ".topbar");
  await page.click('button:has-text("Import")');
  const [chooser] = await Promise.all([page.waitForEvent("filechooser"), page.click(".anki-link")]);
  await chooser.setFiles(join(FIXTURES, "chinese-legacy.apkg"));
  await page.waitForSelector(".import-report .good", { timeout: 20000 });
  await page.click(".anki-sheet .btn:not(.ghost)");
  await page.waitForTimeout(1000);
  const words = await api("/api/words");
  assert.ok(words.some((w: any) => w.hanzi === "长颈鹿" && w.section === "HSK Extra"));
  const panda = words.find((w: any) => w.hanzi === "熊猫");
  assert.ok(panda.learned || (await api("/api/home")).learned >= 3, "Anki progress kept");
  assert.deepEqual(errors, []);
});
