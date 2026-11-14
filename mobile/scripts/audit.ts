// A restless user for the built app (www): opens every screen and plays every kind of exercise,
// in every interface language, answering right and wrong at random — and writes down what goes
// wrong: page errors, exercises you can't get out of, screens wider than the phone, texts left
// in English, "undefined" on screen.
//   npm run build (or EDITION=heritage npm run build), then:
//   npx tsx scripts/audit.ts [out-dir] [ui languages, e.g. en,fr] [courses, e.g. zh,ja]
import { createServer } from "node:http";
import { readFile, mkdir, writeFile } from "node:fs/promises";
import { readFileSync } from "node:fs";
import { extname, join, resolve } from "node:path";
import { chromium, type Page, type BrowserContext } from "playwright";

const WWW = resolve(new URL("../www", import.meta.url).pathname);
const OUT = resolve(process.argv[2] || "audit-out");
const edition = /data-edition="heritage"/.test(readFileSync(join(WWW, "index.html"), "utf8")) ? "heritage" : "east";
const UI = (process.argv[3] || "en,fr,es,ja").split(",");
const COURSES = (process.argv[4] || (edition === "east" ? "zh,ja" : "sl")).split(",");
const SEED = Number(process.env.SEED || 1);
const AI = process.env.AI || "off";
const [vw, vh] = (process.env.VIEW || "360x740").split("x").map(Number); // VIEW=320x568: a small phone
const VIEW = { width: vw, height: vh };
await mkdir(OUT, { recursive: true });

const TYPES: Record<string, string> = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css", ".json": "application/json", ".wasm": "application/wasm", ".svg": "image/svg+xml", ".png": "image/png", ".woff2": "font/woff2", ".webmanifest": "application/manifest+json" };
const server = createServer(async (req, res) => {
  const path = decodeURIComponent(new URL(req.url!, "http://x").pathname);
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

// ------------------------------------------------------------------ findings
type Finding = { kind: string; where: string; what: string; shot?: string };
const findings: Finding[] = [];
const seen = new Set<string>();
let shots = 0;
async function report(page: Page | null, kind: string, where: string, what: string) {
  const key = `${kind}|${what}`.slice(0, 300);
  if (seen.has(key)) return;
  seen.add(key);
  const f: Finding = { kind, where, what: what.slice(0, 500) };
  if (page && shots < 80 && !["english", "console"].includes(kind)) {
    f.shot = `${String(++shots).padStart(2, "0")}-${kind}.png`;
    await page.screenshot({ path: join(OUT, f.shot) }).catch(() => {});
  }
  findings.push(f);
  console.log(`  ! [${kind}] ${where}: ${what.slice(0, 200)}`);
}

let rnd = SEED;
const random = () => ((rnd = (rnd * 1103515245 + 12345) & 0x7fffffff), rnd / 0x7fffffff);

// ------------------------------------------------------------------ a device
type Dev = { ctx: BrowserContext; page: Page; api: (p: string, o?: any) => Promise<any>; where: string; strokes: any; ui: string };

async function device(ui: string, course: string, level?: string): Promise<Dev> {
  const ctx = await browser.newContext({ viewport: VIEW, deviceScaleFactor: 1, hasTouch: false, locale: "en-GB" });
  await ctx.addInitScript("window.__name = (f) => f;");
  await ctx.addInitScript(() => {
    if (window.speechSynthesis) { window.speechSynthesis.speak = (u: any) => setTimeout(() => u.onend?.(), 30); window.speechSynthesis.cancel = () => {}; }
    (window as any).__syncUrl = (window as any).__backupUrl = (window as any).__friendsUrl = (window as any).__accountUrl = "http://127.0.0.1:9/none";
    window.alert = (m) => ((window as any).__alerts ||= []).push(String(m));
  });
  const page = await ctx.newPage();
  page.setDefaultTimeout(2500);
  const dev: Dev = { ctx, page, api: (p, o) => page.evaluate(([p, o]) => (window as any).__localApi(p, o), [p, o] as const), where: "start", strokes: null, ui };
  page.on("pageerror", (e) => report(page, "error", dev.where, e.message + "\n" + String(e.stack || "").split("\n").slice(0, 3).join(" | ")));
  page.on("console", (m) => {
    if (m.type() !== "error") return;
    const t = m.text();
    if (/127\.0\.0\.1:9|ERR_CONNECTION_REFUSED|Failed to load resource|favicon|ai\.test/.test(t)) return;
    report(page, "console", dev.where, t);
  });
  page.on("response", async (r) => {
    const u = r.url();
    if (r.status() === 404 && u.startsWith(base) && !/favicon|\/chars(-ja)?\//.test(u)) report(null, "404", dev.where, u.replace(base, ""));
    // The stroke data of the character on the writing pad, so the monkey can really write it.
    if (/\/chars(-ja)?\//.test(u) && r.ok()) dev.strokes = await r.json().catch(() => null);
  });
  // AI=down: the AI is switched on but its server is unreachable; AI=junk: it answers nonsense.
  // Either way no exercise may break.
  if (AI === "junk") await page.route("http://ai.test/**", (route) => route.fulfill({ status: 200, contentType: "application/json", headers: { "Access-Control-Allow-Origin": "*" }, body: JSON.stringify(route.request().url().endsWith("/models") ? { data: [{ id: "gemma" }] } : { choices: [{ message: { content: ["{}", "sorry, I can't", '{"ok": "maybe", "items": 3}', "[]", '{"sentences":[{"en":"x"}]}'][Math.floor(Math.random() * 5)] } }] }) }));
  if (AI === "down") await page.route("http://ai.test/**", (route) => route.abort("connectionrefused"));
  await page.goto(base);
  if (process.env.TRACE) console.log("   opened");
  await page.waitForSelector(".welcome", { timeout: 30000 });
  await page.evaluate(() => document.getElementById("splash")?.remove());
  const langs = ["en", "fr", "es", "ja"];
  await page.locator(".welcome-lang").nth(langs.indexOf(ui)).click();
  await page.waitForTimeout(400);
  await check(dev, "welcome");
  if (edition === "east") await page.locator(".welcome-course").nth(course === "ja" ? 1 : 0).click();
  if (level) {
    const lv = page.locator(".welcome-levels button, .welcome-levels .level-card", { hasText: level });
    if (await lv.count()) await lv.first().click();
  }
  await page.fill(".welcome input", "Mia");
  await page.click(".welcome-go");
  await page.waitForSelector(".account-step, .tutorial");
  if (await page.locator(".account-step").count()) { await check(dev, "account step"); await page.click(".account-step .acc-skip"); }
  await page.waitForSelector(".tutorial");
  // Walk through the tour once.
  for (let i = 0; i < 8 && (await page.locator(".tutorial").count()); i++) {
    await page.waitForTimeout(700); // the slide-in
    await check(dev, `tutorial ${i + 1}`);
    const nextBtn = page.locator(".tutorial .btn").last();
    if (i < 4 && (await nextBtn.count())) await nextBtn.click().catch(() => {});
    else await page.locator(".tut-top .link-btn").click().catch(() => {});
    await page.waitForTimeout(350);
  }
  if (await page.locator(".tutorial").count()) await page.locator(".tut-top .link-btn").click().catch(() => {});
  await closeOverlays(dev);
  await page.waitForSelector(".home-head", { timeout: 15000 }).catch(() => report(page, "stuck", "after the tour", "home did not appear"));
  return dev;
}

// ------------------------------------------------------------------ what's wrong on this screen?
const ENGLISH = /\b(the|you|your|and|with|for|this|that|words?|learn|lesson|practice|review|tap|from|have|will|not|are|was|more|every|each|today|next|back|continue|check|skip|settings?|of the|to the)\b/i;

async function check(dev: Dev, where: string) {
  dev.where = where;
  if (process.env.TRACE) console.log("   · " + where);
  const { page, ui } = dev;
  const r = await page.evaluate(() => {
    const W = document.documentElement.clientWidth;
    const out = { wide: [] as string[], odd: [] as string[], texts: [] as string[], sw: document.documentElement.scrollWidth, W };
    const vis = (el: Element) => { const s = getComputedStyle(el); const b = el.getBoundingClientRect(); return s.visibility !== "hidden" && s.display !== "none" && b.width > 0 && b.height > 0 && Number(s.opacity) > 0.05; };
    // A scrolling strip (level tabs, a wide table) may be wider than the screen; anything else may not.
    const scrolls = (el: Element | null): boolean => { for (; el && el !== document.body; el = el.parentElement) { const s = getComputedStyle(el); if (/(auto|scroll|hidden|clip)/.test(s.overflowX) && el.clientWidth < el.scrollWidth + 1 && el.getBoundingClientRect().right <= W + 1) return true; } return false; };
    for (const el of document.querySelectorAll("body *:not(svg *)")) {
      const b = el.getBoundingClientRect();
      if (b.right <= W + 2 && b.left >= -2) continue;
      if (!vis(el)) continue;
      if ((b.right > W + 2 || b.left < -2) && b.top < innerHeight && b.bottom > 0 && !scrolls(el.parentElement) && !el.closest("svg, .falls, .confetti, .toast")) out.wide.push(`${el.tagName.toLowerCase()}.${String((el as HTMLElement).className?.baseVal ?? (el as HTMLElement).className).slice(0, 40)} right=${Math.round(b.right)} "${(el.textContent || "").trim().slice(0, 40)}"`);
    }
    const SKIP = ".hz, .en:not(.ui), .py, .txt:not(.ui), .notranslate, .fs-meaning, .cm-m, [translate=no], script, style, input, textarea, .heard, .bubble, .g-en, .g-en-reveal";
    const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
    for (let n = walker.nextNode(); n; n = walker.nextNode()) {
      const t = (n.nodeValue || "").trim();
      const p = n.parentElement;
      if (!t || !p || !vis(p)) continue;
      if (/\bundefined\b|\bNaN\b|\[object |\{\d\}|\bnull\b/.test(t)) out.odd.push(t.slice(0, 120));
      if (!p.closest(SKIP)) out.texts.push(t.slice(0, 140));
    }
    return out;
  }).catch(() => null);
  if (!r) return;
  if (r.sw > r.W + 1) await report(page, "wide", where, `page scrolls sideways: ${r.sw} > ${r.W}; ${r.wide.slice(0, 3).join(" · ")}`);
  else if (r.wide.length) await report(page, "clipped", where, r.wide.slice(0, 3).join(" · "));
  for (const t of r.odd) await report(page, "odd-text", where, t);
  if (ui !== "en") for (const t of r.texts) if (ENGLISH.test(t) && !/^[\d\s·:.,/%+-]*$/.test(t)) await report(page, "english", `${ui} · ${where}`, t);
  const alerts = await page.evaluate(() => { const a = (window as any).__alerts || []; (window as any).__alerts = []; return a; }).catch(() => []);
  for (const a of alerts) await report(page, "alert", where, a);
}

async function closeOverlays(dev: Dev) {
  const { page } = dev;
  for (let i = 0; i < 4; i++) {
    const n = await page.locator(".sheet-bg, .dialog-bg, .modal-bg").count();
    if (!n) return;
    await page.keyboard.press("Escape");
    await page.waitForTimeout(150);
    const bg = page.locator(".sheet-bg, .dialog-bg, .modal-bg").last();
    if (await bg.count()) await bg.click({ position: { x: 5, y: 5 }, timeout: 1000 }).catch(() => {});
    await page.waitForTimeout(150);
  }
}

// ------------------------------------------------------------------ playing a lesson
async function draw(dev: Dev) {
  const { page } = dev;
  const data = dev.strokes;
  if (!data?.medians) return false;
  await page.waitForFunction(() => [...document.querySelectorAll(".lesson .writer svg g")].some((x) => /scale/.test(x.getAttribute("transform") || "")), null, { timeout: 4000 }).catch(() => {});
  await page.waitForTimeout(250);
  for (const med of data.medians) {
    const pts = await page.evaluate((med) => {
      const g = [...document.querySelectorAll(".lesson .writer svg g")].find((x) => /scale/.test(x.getAttribute("transform") || "")) as SVGGraphicsElement | undefined;
      if (!g) return null;
      const m = g.getScreenCTM()!;
      return med.map(([x, y]: number[]) => { const q = new DOMPoint(x, y).matrixTransform(m); return [q.x, q.y]; });
    }, med).catch(() => null);
    if (!pts) return false;
    await page.mouse.move(pts[0][0], pts[0][1]);
    await page.mouse.down();
    for (const [x, y] of pts.slice(1)) await page.mouse.move(x, y, { steps: 3 });
    await page.mouse.up();
    await page.waitForTimeout(140);
  }
  await page.waitForTimeout(500);
  return true;
}

/** Plays whatever lesson is open to its end. Returns how it went. */
async function play(dev: Dev, name: string, { maxSteps = 150 } = {}) {
  const { page } = dev;
  let last = "", same = 0, steps = 0;
  const kinds = new Set<string>();
  await page.waitForSelector(".lesson", { timeout: 6000 }).catch(() => {});
  if (!(await page.locator(".lesson").count())) return { opened: false, steps, kinds };
  for (; steps < maxSteps; steps++) {
    if (!(await page.locator(".lesson").count())) break;
    const kicker = ((await page.locator(".lesson .ex-kicker").first().textContent({ timeout: 300 }).catch(() => "")) || "").trim();
    if (kicker) kinds.add(kicker);
    await check(dev, `${name} › ${kicker || "…"}`);
    // A confirm dialog in the way?
    const dlg = page.locator(".dialog .btn, .dialog-bg .btn").last();
    if (await dlg.count()) { await dlg.click().catch(() => {}); continue; }
    if (await page.locator(".lesson .end").count()) {
      await page.locator(".lesson-foot .btn").last().click().catch(() => {});
      await page.waitForTimeout(250);
      continue;
    }
    const sig = await page.locator(".lesson").innerText().catch(() => "");
    same = sig === last ? same + 1 : 0;
    last = sig;
    if (same >= 7) {
      await report(page, "stuck", `${name} › ${kicker}`, `can't get past this step: ${sig.replace(/\s+/g, " ").slice(0, 220)}`);
      break;
    }
    const foot = page.locator(".lesson-foot .btn:not(.ghost)").last();
    const footOn = (await foot.count()) && (await foot.isEnabled().catch(() => false));
    if (footOn) { await foot.click().catch(() => {}); await page.waitForTimeout(340); continue; }
    // Make the exercise answerable.
    if (await page.locator(".lesson .writer").count()) {
      // Mostly write it for real; now and then give up with "Show me" or scribble.
      const r = random();
      if (r < 0.7 && (await draw(dev))) { await page.waitForTimeout(300); continue; }
      if (r < 0.85) {
        const b = page.locator(".lesson .pad"); const box = await b.boundingBox();
        if (box) { await page.mouse.move(box.x + 30, box.y + 30); await page.mouse.down(); await page.mouse.move(box.x + box.width - 30, box.y + box.height - 30, { steps: 4 }); await page.mouse.up(); }
      }
      const show = page.locator(".lesson .pad-tools .btn").last();
      if (await show.isVisible().catch(() => false)) await show.click().catch(() => {});
      await page.waitForTimeout(900);
      continue;
    }
    const choices = page.locator(".lesson-body .choice:not([disabled]), .lesson-body .tone-nums button:not([disabled]), .lesson-body .lookalike-card:not([disabled])");
    const n = await choices.count();
    if (n) {
      // Prefer the right answer about half of the time when the app marks it; otherwise any.
      await choices.nth(Math.floor(random() * n)).click().catch(() => {});
      await page.waitForTimeout(120);
      const again = page.locator(".lesson-foot .btn:not(.ghost)").last();
      if ((await again.count()) && (await again.isEnabled().catch(() => false))) await again.click().catch(() => {});
      await page.waitForTimeout(300);
      continue;
    }
    const input = page.locator(".lesson-body input.input:not([disabled]), .lesson-body textarea:not([disabled])");
    if (await input.count()) {
      await input.first().fill(random() < 0.5 ? "x" : (sig.match(/[぀-ヿ一-鿿]+|[A-Za-zčšžČŠŽ]{3,}/g) || ["a"]).slice(-1)[0]);
      await page.waitForTimeout(100);
      const again = page.locator(".lesson-foot .btn:not(.ghost)").last();
      if ((await again.count()) && (await again.isEnabled().catch(() => false))) await again.click().catch(() => {});
      else await input.first().press("Enter").catch(() => {});
      await page.waitForTimeout(300);
      continue;
    }
    // Speaking and the like: use the way out the exercise offers.
    const ghost = page.locator(".lesson-foot .btn.ghost, .lesson-body .btn.ghost");
    if (await ghost.count()) { await ghost.last().click().catch(() => {}); await page.waitForTimeout(300); continue; }
    const any = page.locator(".lesson-body button:not([disabled])");
    if (await any.count()) { await any.nth(Math.floor(random() * (await any.count()))).click().catch(() => {}); await page.waitForTimeout(300); continue; }
    await page.waitForTimeout(400);
  }
  // Still open: leave it.
  if (await page.locator(".lesson").count()) {
    // (A lesson repeats what was answered wrong until it is right, so a monkey can take for ever.)
    await page.locator(".lesson-top .icon-btn").click().catch(() => {});
    await page.waitForTimeout(250);
    const quit = page.locator(".dialog .btn.red, .dialog .btn").last();
    if (await quit.count()) await quit.click().catch(() => {});
    await page.waitForTimeout(250);
    if (await page.locator(".lesson").count()) { await report(page, "stuck", name, "the lesson can't be closed"); await page.evaluate(() => document.querySelector(".lesson")?.remove()); }
  }
  await page.waitForTimeout(250);
  await closeOverlays(dev);
  return { opened: true, steps, kinds };
}

const goto = async (dev: Dev, hash: string, wait = 700) => {
  await dev.page.evaluate((h) => { if (location.hash === h) dispatchEvent(new HashChangeEvent("hashchange")); else location.hash = h; }, hash);
  await dev.page.waitForTimeout(wait);
  await dev.page.evaluate(() => document.getElementById("splash")?.remove());
};

/** Home → tap a tile by its position among the home tiles. */
async function homeTiles(dev: Dev) {
  await goto(dev, "#/");
  await dev.page.waitForSelector(".home-head", { timeout: 8000 }).catch(() => {});
  return dev.page.locator(".tiles .tile");
}

// ------------------------------------------------------------------ the round
async function round(ui: string, course: string) {
  const tag = `${edition}/${course}/${ui}`;
  console.log(`\n== ${tag}`);
  const dev = await device(ui, course, course === "ja" ? "N5" : undefined);
  if (AI !== "off") await dev.api("/api/settings", { method: "PUT", body: { ai_enabled: true, llm_base_url: "http://ai.test/v1", llm_model: "gemma" } });
  console.log("   device ready");
  const { page, api } = dev;
  const log = (s: string) => console.log(`   ${s}`);

  // 1) A brand-new learner: every screen, empty.
  for (const [hash, name] of [["#/", "home (new)"], ["#/words", "words (new)"], ["#/map", "map (new)"], ["#/stats", "stats (new)"], ["#/settings", "settings (new)"], ["#/forest", "garden (new)"], ["#/exams", "exams (new)"], ["#/weak", "weak spots (new)"]] as const) {
    await goto(dev, hash);
    await check(dev, name);
    await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
    await page.waitForTimeout(150);
    await check(dev, name + " ↓");
  }

  // 2) The first lesson, both ways.
  for (const mode of [0, 1]) {
    await goto(dev, "#/");
    await page.locator(".primary-go").click().catch(() => {});
    await page.waitForTimeout(350);
    await check(dev, "learn: how do you want to study");
    const m = page.locator(".sheet .mode, .sheet .mode-opt");
    if (await m.count()) await m.nth(Math.min(mode, (await m.count()) - 1)).click();
    const r = await play(dev, `learn new (${mode ? "choice" : "writing"})`);
    log(`learn ${mode}: ${r.steps} steps · ${[...r.kinds].join(", ")}`);
  }

  // 3) A learner some weeks in: many words, some due, grammar unlocked.
  const words = await api("/api/words");
  const take = Math.min(words.length, course === "sl" ? 220 : 320);
  await api("/api/learn/complete", { method: "POST", body: { word_ids: words.slice(0, take).map((w: any) => w.id), xp: 0 } });
  const db = await api("/api/backup");
  const at = (d: number) => new Date(Date.now() + d * 86400000).toISOString().replace("T", " ").slice(0, 19);
  const day = (n: number) => new Date(Date.now() - n * 86400000).toISOString().slice(0, 10);
  for (let i = 1; i < 12; i++) db.activity[day(i)] = { xp: 30 + i, new_words: 5, reviews: 20, sentences: 2, seconds: 600 };
  db.cards.forEach((c: any, i: number) => { c.interval = [1, 3, 8, 20][i % 4]; c.reps = 3; c.stability = c.interval; c.difficulty = 5; c.last_review = at(-c.interval); c.due = i % 5 === 0 ? at(-0.5) : i % 37 === 0 ? at(-40) : at(c.interval); });
  await api("/api/backup/restore", { method: "POST", body: db });
  await page.goto(base + "/?again=1#/");
  await page.waitForSelector(".home-head", { timeout: 15000 }).catch(() => {});
  await page.evaluate(() => document.getElementById("splash")?.remove());
  await check(dev, "home (weeks in)");

  // Every home tile, and everything behind it.
  const count = await (await homeTiles(dev)).count();
  const openTile = async (i: number) => { const t = await homeTiles(dev); await t.nth(i).click().catch(() => {}); await page.waitForTimeout(600); };
  for (let i = 0; i < count; i++) {
    const title = ((await (await homeTiles(dev)).nth(i).textContent().catch(() => "")) || "").replace(/\s+/g, " ").trim().slice(0, 26);
    await openTile(i);
    await check(dev, `tile: ${title}`);
    const lessonOpen = async () => (await page.locator(".lesson:not(.story-reader):not(.talk-screen)").count()) > 0;
    if (await lessonOpen()) {
      const r = await play(dev, title, { maxSteps: 140 });
      log(`${title}: ${r.steps} steps · ${[...r.kinds].join(", ")}`);
    } else if (await page.locator(".sheet .mode-pick").count()) {
      // Sentences: each way of answering.
      for (let j = 0; j < 4; j++) {
        if (j) await openTile(i);
        await page.locator(".sheet .mode-pick button").nth(j).click().catch(() => {});
        await check(dev, `${title} › mode ${j}`);
        await page.locator(".sheet .btn.purple").click().catch(() => {});
        const r = await play(dev, `${title} › mode ${j}`, { maxSteps: 60 });
        log(`${title} › mode ${j}: ${r.opened ? r.steps + " steps · " + [...r.kinds].join(", ") : "did not open"}`);
        await closeOverlays(dev);
      }
    } else if (await page.locator(".sheet .mode").count()) {
      // With writing / choice only.
      for (let j = 0; j < 2; j++) {
        if (j) await openTile(i);
        await page.locator(".sheet .mode").nth(j).click().catch(() => {});
        const r = await play(dev, `${title} › ${j ? "choice" : "writing"}`, { maxSteps: 90 });
        log(`${title} › ${j ? "choice" : "writing"}: ${r.opened ? r.steps + " steps · " + [...r.kinds].join(", ") : "did not open"}`);
        await closeOverlays(dev);
      }
    } else if (await page.locator(".sheet .mode-opt").count()) {
      // Listen, read & talk — or the list of courses.
      const k = await page.locator(".sheet .mode-opt").count();
      for (let j = 0; j < k; j++) {
        if (j) await openTile(i);
        const o = page.locator(".sheet .mode-opt").nth(j);
        const oname = ((await o.textContent().catch(() => "")) || "").replace(/\s+/g, " ").trim().slice(0, 22);
        await o.click().catch(() => {});
        await page.waitForTimeout(700);
        await check(dev, `${title} › ${oname}`);
        if (await page.locator(".sheet .story-item").count()) {
          const n = Math.min(3, await page.locator(".sheet .story-item").count());
          for (let sidx = 0; sidx < n; sidx++) {
            if (sidx) { await openTile(i); await page.locator(".sheet .mode-opt").nth(j).click().catch(() => {}); await page.waitForTimeout(600); }
            await page.locator(".sheet .story-item").nth(sidx).click().catch(() => {});
            await page.waitForSelector(".story-reader .tok", { timeout: 4000 }).catch(() => report(page, "stuck", `${title} › story ${sidx}`, "the story did not open"));
            const toks = page.locator(".story-reader .tok");
            const nt = await toks.count();
            for (const t of [0, 3, 7, nt - 1]) if (t >= 0 && t < nt) {
              await toks.nth(t).click().catch(() => {});
              await page.waitForTimeout(120);
              const mean = ((await page.locator(".word-pop .wp-mean").textContent().catch(() => "")) || "").trim();
              if (!mean || mean === "—") await report(page, "content", `${title} › story ${sidx}`, `no meaning for “${await toks.nth(t).textContent()}”`);
              await check(dev, `${title} › story ${sidx} › word`);
            }
            for (const b of await page.locator(".story-reader .g-en-reveal").all()) await b.click().catch(() => {});
            await check(dev, `${title} › story ${sidx} › translations`);
            await page.locator(".story-reader .lesson-foot .btn").last().click().catch(() => {});
            await page.waitForTimeout(400);
            const r = await play(dev, `${title} › story ${sidx} › quiz`, { maxSteps: 30 });
            log(`story ${sidx}: quiz ${r.steps} steps`);
            if (await page.locator(".story-reader").count()) await page.locator(".story-reader .icon-btn").first().click().catch(() => {});
            await closeOverlays(dev);
          }
        } else if (await page.locator(".sheet .talk-topic").count()) {
          await page.locator(".sheet .talk-topic:not([disabled])").first().click().catch(() => {});
          await page.waitForTimeout(900);
          await check(dev, `${title} › talk`);
          if (await page.locator(".talk-screen").count()) {
            for (let t = 0; t < 3; t++) {
              await page.locator(".talk-input").fill(["你好", "x", "Dober dan"][t]).catch(() => {});
              await page.locator(".talk-send").click().catch(() => {});
              await page.waitForTimeout(900);
              await check(dev, `${title} › talk turn ${t}`);
            }
            await page.locator(".talk-screen .icon-btn").first().click().catch(() => {});
            await page.waitForTimeout(300);
            const dlg = page.locator(".dialog .btn").last();
            if (await dlg.count()) await dlg.click().catch(() => {});
            await page.waitForTimeout(600);
            await check(dev, `${title} › talk end`);
            const done = page.locator(".talk-screen .btn, .lesson .btn").last();
            if (await done.count()) await done.click().catch(() => {});
            if (await page.locator(".talk-screen").count()) { await report(page, "stuck", `${title} › talk`, "the chat can't be closed"); await page.evaluate(() => document.querySelector(".talk-screen")?.remove()); }
          }
        } else if (await lessonOpen()) {
          const r = await play(dev, `${title} › ${oname}`, { maxSteps: 90 });
          log(`${title} › ${oname}: ${r.steps} steps · ${[...r.kinds].join(", ")}`);
        } else {
          await page.waitForTimeout(300);
          await check(dev, `${title} › ${oname} (screen)`);
          // Changing the course from the list: go back to the one under test.
          if ((await api("/api/settings")).course !== course) { await api("/api/settings", { method: "PUT", body: { course } }); await page.goto(base + "/?c=1#/"); await page.waitForSelector(".home-head").catch(() => {}); await page.evaluate(() => document.getElementById("splash")?.remove()); }
        }
        await closeOverlays(dev);
      }
    } else {
      // Another screen (map, exams, weak spots) or a sheet to read (the grammar book).
      await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
      await page.waitForTimeout(200);
      await check(dev, `tile: ${title} ↓`);
    }
    await closeOverlays(dev);
  }
  // Grammar: three lessons in a row, then the grammar book.
  for (let n = 0; n < 3; n++) {
    await goto(dev, "#/");
    const g = await api("/api/grammar/status").catch(() => null);
    if (!g?.unlocked) break;
    await openTile(1); // after the first tile (Practice / New words) comes Grammar
    const r = await play(dev, `grammar lesson ${n + 1}`, { maxSteps: 120 });
    log(`grammar ${n + 1}: ${r.opened ? r.steps + " steps · " + [...r.kinds].join(", ") : "did not open"}`);
  }

  // 4) Every screen again, now full; open what can be opened.
  for (const [hash, name] of [["#/words", "words"], ["#/map", "map"], ["#/stats", "stats"], ["#/settings", "settings"], ["#/forest", "garden"], ["#/exams", "exams"], ["#/weak", "weak spots"]] as const) {
    await goto(dev, hash, 900);
    await check(dev, name);
    for (const y of [0.33, 0.66, 1]) { await page.evaluate((y) => window.scrollTo(0, document.body.scrollHeight * y), y); await page.waitForTimeout(150); await check(dev, `${name} ↓${y}`); }
  }
  // Words: open a word, the add form, import.
  await goto(dev, "#/words");
  const row = page.locator(".list .list-item").nth(3);
  if (await row.count()) { await row.click().catch(() => {}); await page.waitForTimeout(500); await check(dev, "word details"); await closeOverlays(dev); }
  for (const b of await page.locator(".topbar .btn").all()) { await b.click().catch(() => {}); await page.waitForTimeout(400); await check(dev, "words › " + ((await b.textContent().catch(() => "")) || "").trim()); await closeOverlays(dev); }
  // Garden: tap plants, water.
  await goto(dev, "#/forest", 900);
  const plants = page.locator(".gplant");
  for (const i of [0, 7, 40]) if ((await plants.count()) > i) { await plants.nth(i).click({ force: true }).catch(() => {}); await page.waitForTimeout(350); await check(dev, "garden › plant tag"); }
  const water = page.locator(".water-go").first();
  if (await water.count()) { await water.click().catch(() => {}); const r = await play(dev, "garden › water", { maxSteps: 60 }); if (r.opened) log(`water: ${r.steps} steps`); }
  // Weak spots: practise the first group.
  await goto(dev, "#/weak", 900);
  for (const sel of [".wk-worst-row", ".wk-tile"]) {
    await goto(dev, "#/weak", 900);
    const weak = page.locator(sel).first();
    if (!(await weak.count())) continue;
    await weak.click().catch(() => {});
    await page.waitForTimeout(400);
    await check(dev, `weak spots › ${sel}`);
    const only = page.locator(".wk-sheet .btn:not(.ghost)");
    if (await only.count()) await only.click().catch(() => {});
    const r = await play(dev, `weak spots › ${sel}`, { maxSteps: 60 });
    log(`weak ${sel}: ${r.opened ? r.steps + " steps · " + [...r.kinds].join(", ") : "did not open"}`);
  }
  // Mock exam: the short one, to its result.
  await goto(dev, "#/exams", 900);
  if (await page.locator(".exam-card .btn.ghost").count()) {
    await page.locator(".exam-card .btn.ghost").first().click().catch(() => {});
    let i = 0;
    for (; i < 500 && !(await page.locator(".exam .exam-result").count()); i++) {
      if (await page.locator(".dialog").count()) await page.locator(".dialog .btn.ghost").click().catch(() => {});
      else if (await page.locator(".exam .exam-intro").count()) { await check(dev, "exam › part intro"); await page.locator(".exam .lesson-foot .btn").click().catch(() => {}); }
      else if (await page.locator(".exam .exam-opt").count()) {
        if (i % 9 === 0) await check(dev, "exam › question");
        const o = page.locator(".exam .exam-opt");
        await o.nth(Math.floor(random() * (await o.count()))).click().catch(() => {});
        await page.locator(".exam .lesson-foot .btn").last().click().catch(() => {});
      } else if (!(await page.locator(".exam").count())) break;
      await page.waitForTimeout(40);
    }
    if (await page.locator(".exam .exam-result").count()) { await check(dev, "exam › result"); await page.evaluate(() => document.querySelector(".exam .lesson-body")?.scrollTo(0, 9999)); await check(dev, "exam › result ↓"); log(`exam: ${i} steps`); }
    else await report(page, "stuck", "exam", "the short exam did not reach its result");
    await page.locator(".exam .icon-btn, .exam .lesson-foot .btn").last().click().catch(() => {});
    await page.waitForTimeout(300);
    if (await page.locator(".exam").count()) await page.evaluate(() => document.querySelector(".exam")?.remove());
  }
  // Settings: every select and toggle once (and back).
  await goto(dev, "#/settings", 900);
  const sel = page.locator("#app select");
  for (let i = 0; i < (await sel.count()); i++) {
    const s = sel.nth(i);
    const name = `select ${i}`;
    const vals = await s.locator("option").evaluateAll((o) => o.map((x) => (x as HTMLOptionElement).value));
    const cur = await s.inputValue().catch(() => "");
    if (vals.some((v) => ["en", "fr", "es", "ja", "zh", "sl"].includes(v))) continue; // not the interface language or the course
    for (const v of vals.slice(0, 3)) { await s.selectOption(v).catch(() => {}); await page.waitForTimeout(120); }
    await s.selectOption(cur).catch(() => {});
    await check(dev, `settings › ${name}`);
  }
  await dev.ctx.close();
}

for (const course of COURSES) for (const ui of UI) await round(ui, course).catch((e) => report(null, "audit", `${course}/${ui}`, String(e?.stack || e).slice(0, 400)));

await browser.close();
server.close();
const byKind: Record<string, number> = {};
for (const f of findings) byKind[f.kind] = (byKind[f.kind] || 0) + 1;
await writeFile(join(OUT, `findings-${edition}.json`), JSON.stringify(findings, null, 1));
console.log(`\n${edition}: ${findings.length} findings`, byKind, "→", join(OUT, `findings-${edition}.json`));
