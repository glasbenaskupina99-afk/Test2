// Bloomko website Worker: serves the static site (site/), the word pages (seo.js) and stores "Notify me" sign-ups.
// Sign-ups live in the NOTIFY KV namespace (key = email). View them in the Cloudflare
// dashboard: Storage & Databases → KV → the namespace bound as NOTIFY.
// With the MAIL send_email binding (Cloudflare Email Routing), every new sign-up is also
// emailed to the owner.
import { EmailMessage } from "cloudflare:email";
import { seo } from "./seo.js";
import { handleSync } from "./sync.js";

// Durable Object class for app sync (bound as SYNC in wrangler.jsonc).
export { SyncStore } from "./sync.js";

const FROM = "notify@bloomko.eu";
const TO = "thebloomko@gmail.com";
const EMAIL = /^[^\s@]{1,64}@[^\s@]{1,190}\.[^\s@]{2,24}$/;

const json = (status, body) =>
  new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json", "Cache-Control": "no-store" } });

/** "SI" → "Slovenia (SI)" */
function countryName(code) {
  try {
    return `${new Intl.DisplayNames(["en"], { type: "region" }).of(code)} (${code})`;
  } catch {
    return code;
  }
}

/** "sl,en-GB;q=0.9,en;q=0.8" → "Slovenian, English (UK), English" */
function languages(header) {
  const codes = String(header || "")
    .split(",")
    .map((p) => p.split(";")[0].trim())
    .filter((c) => c && c !== "*")
    .slice(0, 5);
  if (!codes.length) return null;
  let names;
  try {
    names = new Intl.DisplayNames(["en"], { type: "language" });
  } catch {
    return codes.join(", ");
  }
  return codes.map((c) => { try { return names.of(c); } catch { return c; } }).join(", ");
}

/** A plain-text email to the owner about a new sign-up (best effort, never blocks the visitor). */
async function mailOwner(env, email, info, total) {
  if (!env.MAIL) return;
  const lines = [
    `New "Notify me" sign-up on bloomko.eu:`,
    ``,
    `  ${email}`,
    ``,
    `Time:      ${new Date(info.at).toUTCString()}`,
    `Country:   ${info.country ? countryName(info.country) : "unknown"}`,
    `Languages: ${info.languages || "unknown"}`,
    `App:       ${info.edition === "heritage" ? "Bloomko Heritage" : "Bloomko East"}`,
    total ? `Total sign-ups so far: ${total}` : ``,
  ];
  const raw = [
    `From: Bloomko <${FROM}>`,
    `To: ${TO}`,
    `Subject: =?UTF-8?B?${btoa(String.fromCharCode(...new TextEncoder().encode(`${info.edition === "heritage" ? "🌿 New Bloomko Heritage" : "🌱 New Bloomko East"} sign-up: ${email}`)))}?=`,
    `Date: ${new Date().toUTCString()}`,
    `Message-ID: <${crypto.randomUUID()}@bloomko.eu>`,
    `Reply-To: ${email}`,
    `MIME-Version: 1.0`,
    `Content-Type: text/plain; charset=utf-8`,
    `Content-Transfer-Encoding: 8bit`,
    ``,
    lines.join("\r\n"),
  ].join("\r\n");
  await env.MAIL.send(new EmailMessage(FROM, TO, raw));
}

async function notify(request, env, ctx) {
  let data;
  try {
    data = await request.json();
  } catch {
    return json(400, { error: "invalid request" });
  }
  // Bots fill the hidden "website" field; pretend it worked.
  if (data.website) return json(200, { ok: true });
  const email = String(data.email || "").trim().toLowerCase();
  if (!EMAIL.test(email) || email.length > 254) return json(400, { error: "invalid email" });
  if (!env.NOTIFY) return json(503, { error: "sign-ups not available" });
  if (!(await env.NOTIFY.get(email))) {
    const info = {
      at: new Date().toISOString(),
      country: request.cf?.country || null,
      languages: languages(request.headers.get("Accept-Language")),
      // Which app the sign-up came from: Bloomko East (Chinese, Japanese) or Bloomko Heritage.
      edition: data.edition === "heritage" ? "heritage" : "east",
    };
    await env.NOTIFY.put(email, JSON.stringify(info));
    ctx.waitUntil(
      (async () => {
        const total = (await env.NOTIFY.list({ limit: 1000 })).keys.length;
        await mailOwner(env, email, info, total);
      })().catch((e) => console.error("sign-up email failed", e))
    );
  }
  return json(200, { ok: true });
}

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    if (url.pathname.startsWith("/api/sync/")) return handleSync(request, env, url.pathname.slice(10));
    if (url.pathname === "/api/notify") {
      if (request.method !== "POST") return json(405, { error: "use POST" });
      return notify(request, env, ctx);
    }
    // www.bloomko.eu → bloomko.eu
    if (url.hostname === "www.bloomko.eu") {
      url.hostname = "bloomko.eu";
      return Response.redirect(url.toString(), 301);
    }
    // Word pages (/chinese/…, /japanese/…) and the sitemap.
    const page = seo(url);
    if (page) return page;
    return env.ASSETS.fetch(request);
  },
};
