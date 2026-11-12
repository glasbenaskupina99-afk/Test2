// The pages for search engines (worker/seo.js): every URL in the sitemap renders, and the
// Slovenian, grammar and story pages carry their content.
import { test } from "node:test";
import assert from "node:assert/strict";
import { build } from "esbuild";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";

const dir = mkdtempSync(join(tmpdir(), "bloomko-seo-"));
await build({ entryPoints: [new URL("../../worker/seo.js", import.meta.url).pathname], bundle: true, format: "esm", platform: "neutral", outfile: join(dir, "seo.mjs"), logLevel: "silent" });
const { seo } = await import(pathToFileURL(join(dir, "seo.mjs")).href);
const get = async (path: string) => {
  const r = seo(new URL("https://bloomko.eu" + path));
  return r ? { status: r.status, body: await r.text() } : { status: 404, body: "" };
};

test("every page in the sitemap renders, with a title and no leftovers", async () => {
  const urls = [...(await get("/sitemap.xml")).body.matchAll(/<loc>https:\/\/bloomko\.eu([^<]+)<\/loc>/g)].map((m) => m[1]).filter((u) => /^\/(chinese|japanese|slovenian)\//.test(u));
  assert.ok(urls.length > 6500, `${urls.length} pages`);
  for (const kind of ["/slovenian/grammar/", "/chinese/grammar/", "/japanese/stories/", "/slovenian/stories/"]) assert.ok(urls.some((u) => u.startsWith(kind) && u !== kind), kind);
  for (const u of urls) {
    const { status, body } = await get(u);
    assert.equal(status, 200, u);
    assert.match(body, /<title>[^<]+<\/title>/, u);
    assert.doesNotMatch(body.replace(/<script[\s\S]*?<\/script>/g, ""), /undefined|NaN|\[object Object\]/, u);
  }
});

test("Slovenian word, grammar and story pages", async () => {
  const word = await get("/slovenian/dober-dan/");
  assert.match(word.body, /DO-ber DAN/);
  assert.match(word.body, /Memory trick/);
  const g = await get("/slovenian/grammar/sl-negation/");
  assert.match(g.body, /<mark>nisem<\/mark>/, "the grammar part is highlighted");
  const st = await get("/slovenian/stories/sl-s1/");
  assert.match(st.body, /class="tok"[^>]*data-t="[^"]*café/, "tap a word for its meaning");
  assert.match(st.body, /class="q" data-answer="1"/, "the quiz is there");
  assert.equal((await get("/slovenian/grammar/nope/")).status, 404);
  assert.equal((await get("/chinese/stories/x/y/")).status, 404);
});
