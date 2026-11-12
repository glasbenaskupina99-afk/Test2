// A short demo video of Bloomko in use (English), for bloomko.eu: the app is driven in Chromium and
// recorded — a new word, writing it stroke by stroke, the garden, a story — with captions on top.
// Build the app first (npm run build, or EDITION=heritage npm run build), then:
//   npx tsx scripts/demo-video.ts     → ../site/video/<edition>-demo.mp4 (+ a poster .jpg)
import { createServer } from "node:http";
import { readFile, mkdir, rm, readdir } from "node:fs/promises";
import { readFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { extname, join, resolve } from "node:path";
import { chromium, type Page } from "playwright";

const WWW = resolve(new URL("../www", import.meta.url).pathname);
const OUT = resolve(new URL("../../site/video", import.meta.url).pathname);
const edition = /data-edition="heritage"/.test(readFileSync(join(WWW, "index.html"), "utf8")) ? "heritage" : "east";
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
const W = 390, H = 844;
const tmp = join(OUT, ".rec");
await rm(tmp, { recursive: true, force: true });
await mkdir(tmp, { recursive: true });
const t0 = Date.now();
const ctx = await browser.newContext({ viewport: { width: W, height: H }, deviceScaleFactor: 2, recordVideo: { dir: tmp, size: { width: W, height: H } } });
await ctx.addInitScript(() => {
  if (window.speechSynthesis) window.speechSynthesis.speak = () => {};
  (window as any).__syncUrl = (window as any).__backupUrl = (window as any).__friendsUrl = (window as any).__accountUrl = "http://127.0.0.1:9/none";
});
const page = await ctx.newPage();
const api = (p: string, o?: any) => page.evaluate(([p, o]) => window.__localApi(p, o), [p, o] as const);
const wait = (ms: number) => page.waitForTimeout(ms);

// ---------------------------------------------------------------- a learner a month in (not filmed)
await page.goto(base);
await page.waitForSelector(".welcome", { timeout: 30000 });
await page.evaluate(() => document.getElementById("splash")?.remove());
await page.fill(".welcome input", edition === "east" ? "Mia" : "Mia");
await page.click(".welcome-go");
await page.waitForSelector(".account-step, .tutorial");
if (await page.locator(".account-step").count()) await page.click(".account-step .acc-skip");
await page.waitForSelector(".tutorial");
await page.click(".tut-top .link-btn");
const words = await api("/api/words");
await api("/api/learn/complete", { method: "POST", body: { word_ids: words.slice(0, edition === "east" ? 240 : 150).map((w: any) => w.id), xp: 0 } });
const db = await api("/api/backup");
const day = (n: number) => new Date(Date.now() - n * 86400000).toISOString().slice(0, 10);
db.activity = {};
for (let i = 1; i < 23; i++) db.activity[day(i)] = { xp: 40, new_words: 6, reviews: 25, sentences: 2, seconds: 900 };
const at = (d: number) => new Date(Date.now() + d * 86400000).toISOString().replace("T", " ").slice(0, 19);
db.cards.forEach((c: any) => {
  const k = c.word_id;
  c.interval = [2, 5, 9, 14, 22, 35][k % 6];
  c.reps = 4; c.lapses = 0; c.stability = c.interval;
  c.last_review = at(-c.interval / 2);
  c.due = k % 9 === 2 ? at(-0.2) : at(c.interval / 2);
});
db.settings.ai_enabled = false; // no AI set up in the browser: keep the screens free of AI notes
await api("/api/backup/restore", { method: "POST", body: db });
await api("/api/settings", { method: "PUT", body: { ai_enabled: false } });
await page.goto(base + "/?fresh=1#/");
await page.waitForSelector(".home-head");
await page.evaluate(() => document.getElementById("splash")?.remove());
console.log("ai_enabled:", (await api("/api/settings")).ai_enabled);

// ---------------------------------------------------------------- captions
await page.addStyleTag({ content: `
  #demo-cap{position:fixed;left:14px;right:14px;top:12px;z-index:99999;padding:12px 16px;border-radius:16px;text-align:center;
    background:rgba(18,30,22,.9);color:#f4efe2;font:800 17px/1.3 Nunito,system-ui,sans-serif;box-shadow:0 10px 30px rgba(0,0,0,.35);
    transition:opacity .35s, transform .35s;opacity:0;transform:translateY(-10px);pointer-events:none}
  #demo-cap.on{opacity:1;transform:none} #demo-cap b{color:#9fd27f}
  #demo-card{position:fixed;inset:0;z-index:100000;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:18px;
    background:linear-gradient(160deg,#1c3026,#16271e);color:#f4efe2;font:900 30px/1.2 Nunito,system-ui,sans-serif;text-align:center;padding:30px;transition:opacity .5s}
  #demo-card img{width:120px;height:120px;border-radius:30px} #demo-card small{font:800 18px Nunito,system-ui;color:#a9b5a6}
  #demo-card .url{color:#d2ae52;font-size:34px}`});
const caption = (html: string) => page.evaluate((html) => {
  let el = document.getElementById("demo-cap");
  if (!el) { el = document.createElement("div"); el.id = "demo-cap"; document.body.append(el); }
  el.classList.remove("on");
  setTimeout(() => { el.innerHTML = html; el.classList.add("on"); }, html ? 250 : 0);
  if (!html) el.innerHTML = "";
}, html);
const card = (html: string, show: boolean) => page.evaluate(([html, show]) => {
  let el = document.getElementById("demo-card");
  if (!el) { el = document.createElement("div"); el.id = "demo-card"; document.body.append(el); }
  if (show) { el.innerHTML = html as string; el.style.opacity = "1"; el.style.pointerEvents = "auto"; } else { el.style.opacity = "0"; el.style.pointerEvents = "none"; }
}, [html, show] as const);
const logo = edition === "east" ? "icons/icon-192.png" : "icons/heritage-icon-192.png";
const course = edition === "east" ? "Chinese &amp; Japanese" : "Slovenian";

// ---------------------------------------------------------------- write a character like a person would
async function writeWord(p: Page, hanzi: string) {
  for (const ch of [...hanzi]) {
    let data;
    try { data = JSON.parse(readFileSync(join(WWW, "chars", `${ch}.json`), "utf8")); } catch { continue; }
    await p.waitForFunction(() => [...document.querySelectorAll(".lesson .writer svg g")].some((x) => /scale/.test(x.getAttribute("transform") || "")), null, { timeout: 5000 }).catch(() => {});
    await p.waitForTimeout(500);
    for (const med of data.medians) {
      const pts = await p.evaluate((med) => {
        const g = [...document.querySelectorAll(".lesson .writer svg g")].find((x) => /scale/.test(x.getAttribute("transform") || "")) as SVGGraphicsElement;
        const m = g.getScreenCTM();
        return med.map(([x, y]) => { const q = new DOMPoint(x, y).matrixTransform(m); return [q.x, q.y]; });
      }, med);
      await p.mouse.move(pts[0][0], pts[0][1]);
      await p.mouse.down();
      for (const [x, y] of pts.slice(1)) await p.mouse.move(x, y, { steps: 5 });
      await p.mouse.up();
      await p.waitForTimeout(280);
    }
    await p.waitForTimeout(700);
  }
}

/** Answer what's on screen correctly (a choice), or write the character; then Continue. */
async function step(p: Page, ws: any[]) {
  const text = await p.locator(".lesson").innerText().catch(() => "");
  const quoted = (text.match(/“([^”]+)”/) || [])[1];
  const word = ws.find((w) => w.english === quoted) || ws.find((w) => text.includes(w.hanzi) && w.hanzi.length > 1) || ws.find((w) => text.includes(w.hanzi));
  const choices = p.locator(".lesson .choice");
  const input = p.locator(".lesson-body input.input, .lesson-body textarea");
  if (await p.locator(".lesson .writer svg").count()) {
    await wait(700);
    if (word) await writeWord(p, word.hanzi);
    await wait(900);
  } else if (await input.count()) {
    await wait(700);
    await input.first().click();
    await p.keyboard.type(word ? word.hanzi : "x", { delay: 90 });
    await wait(500);
    await p.locator(".lesson-foot .btn").last().click().catch(() => {});
    await wait(1300);
  } else if (await choices.count()) {
    const n = await choices.count();
    let hit = 0;
    for (let i = 0; i < n; i++) {
      const t = (await choices.nth(i).innerText()).trim();
      if (word && [word.english, word.hanzi, word.pinyin].includes(t)) hit = i;
    }
    await wait(900);
    await choices.nth(hit).click();
    await wait(500);
    const check = p.locator(".lesson-foot .btn", { hasText: "Check" });
    if (await check.count()) await check.click();
    await wait(1200);
  }
  const cont = p.locator(".lesson-foot .btn").last();
  if (await cont.isEnabled().catch(() => false)) await cont.click().catch(() => {});
  await wait(500);
}

// ---------------------------------------------------------------- the film
const tStart = (Date.now() - t0) / 1000;
await card(`<img src="${logo}"><div>Bloomko${edition === "heritage" ? " Heritage" : ""}</div><small>Learn ${course} — a quick look</small>`, true);
await wait(2600);
await card("", false);
await caption("Your day at a glance: <b>new words</b>, reviews and your streak plant 🌱");
await wait(3600);
await page.evaluate(() => window.scrollTo({ top: 420, behavior: "smooth" }));
await wait(2000);
await page.evaluate(() => window.scrollTo({ top: 0, behavior: "smooth" }));
await wait(1200);

// A lesson: a new word, then practising it.
await caption(edition === "east" ? "Learn a new word: <b>see it, hear it</b>, with a memory hook" : "Learn a new word: <b>hear it</b>, with its stressed syllable");
await page.click(".primary-go");
await page.locator(".sheet .mode").first().click();
await page.waitForSelector(".lesson");
await wait(5200);
await page.locator(".lesson-foot .btn").last().click();
await wait(600);
await caption(edition === "east" ? "Then <b>write it yourself</b> — every stroke is checked ✍️" : "Then <b>practise it</b> — choose, type and say it");
const all = await api("/api/words");
// On to the first writing (or, in Heritage, typing) exercise — show it once, then leave the lesson.
for (let i = 0; i < 6; i++) {
  if (!(await page.locator(".lesson").count())) break;
  const writing = await page.locator(".lesson .writer svg, .lesson-body input.input").count();
  const isNew = /NEW WORD/i.test(await page.locator(".lesson .ex-kicker").first().innerText().catch(() => ""));
  if (isNew) { await page.locator(".lesson-foot .btn").last().click().catch(() => {}); await wait(500); continue; }
  await step(page, all);
  if (writing) { await wait(800); break; }
}
await caption("");
await page.locator(".lesson .lesson-top .icon-btn, .lesson .close, .lesson [aria-label='Close']").first().click().catch(() => {});
await wait(500);
const quit = page.locator(".dialog .btn", { hasText: /Quit/ });
if (await quit.count()) await quit.click();
await page.waitForSelector(".home-head");
await wait(600);

// The garden.
await caption("Every word you learn grows into <b>a real plant</b> 🌷");
await page.evaluate(() => (location.hash = "#/forest"));
await page.waitForSelector(".bed-svg g.gplant", { timeout: 15000 });
await wait(2200);
const plant = page.locator(".bed-svg g.gplant").nth(3);
await plant.scrollIntoViewIfNeeded();
await page.evaluate(() => window.scrollBy({ top: 140, behavior: "smooth" }));
await wait(1200);
await plant.click();
await wait(2200);
await page.locator(".bed-svg g.gplant").nth(9).click();
await wait(2400);
await caption("Skip your reviews and plants wilt — <b>practise and they grow back</b>");
await wait(3200);

// A story.
await caption("Read little stories — <b>tap any word</b> for its meaning 📖");
await page.evaluate(() => (location.hash = "#/"));
await page.waitForSelector(".home-head");
await page.locator(".tile", { hasText: "Listen" }).first().click();
await page.locator(".mode-opt", { hasText: "Stories" }).click();
await page.waitForSelector(".story-item");
await wait(1400);
await page.locator(".story-item").first().click();
await page.waitForSelector(".story-reader .tok");
await wait(1500);
const toks = page.locator(".story-reader .tok");
// Words worth tapping: for Slovenian, ones in another form (kavarni ← kavarna).
const pick = edition === "heritage" ? ["kavarni", "vpraša", "Kavo"] : null;
for (const [k, i] of [1, 4, 7].entries()) {
  const tok = pick ? toks.filter({ hasText: new RegExp(`^${pick[k]}$`) }).first() : toks.nth(i);
  if (!(await tok.count())) continue;
  await tok.click();
  await wait(1900);
}
await caption("…then a short quiz to check you understood ✅");
await wait(2400);
await caption("");
await card(`<img src="${logo}"><div>Watch your languages bloom 🌱</div><div class="url">bloomko.eu</div><small>Coming soon to Android · free</small>`, true);
await wait(3200);
const tEnd = (Date.now() - t0) / 1000;

await ctx.close();
await browser.close();
server.close();

// ---------------------------------------------------------------- webm → mp4 (only the film part)
const webm = join(tmp, (await readdir(tmp)).find((f) => f.endsWith(".webm")));
const mp4 = join(OUT, `${edition}-demo.mp4`);
execFileSync("ffmpeg", ["-y", "-loglevel", "error", "-ss", tStart.toFixed(2), "-to", tEnd.toFixed(2), "-i", webm, "-vf", "scale=720:-2:flags=lanczos,fps=30", "-c:v", "libx264", "-pix_fmt", "yuv420p", "-crf", "24", "-preset", "slow", "-movflags", "+faststart", "-an", mp4]);
execFileSync("ffmpeg", ["-y", "-loglevel", "error", "-ss", "6", "-i", mp4, "-frames:v", "1", "-q:v", "4", join(OUT, `${edition}-demo.jpg`)]);
await rm(tmp, { recursive: true, force: true });
console.log(edition, "demo", (tEnd - tStart).toFixed(1) + "s →", mp4);
