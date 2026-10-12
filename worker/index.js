// Bloomko website Worker: serves the static site (site/) and stores "Notify me" sign-ups.
// Sign-ups live in the NOTIFY KV namespace (key = email). View them in the Cloudflare
// dashboard: Storage & Databases → KV → the namespace bound as NOTIFY.
const EMAIL = /^[^\s@]{1,64}@[^\s@]{1,190}\.[^\s@]{2,24}$/;

const json = (status, body) =>
  new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json", "Cache-Control": "no-store" } });

async function notify(request, env) {
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
    await env.NOTIFY.put(
      email,
      JSON.stringify({ at: new Date().toISOString(), country: request.cf?.country || null, lang: request.headers.get("Accept-Language")?.slice(0, 20) || null })
    );
  }
  return json(200, { ok: true });
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (url.pathname === "/api/notify") {
      if (request.method !== "POST") return json(405, { error: "use POST" });
      return notify(request, env);
    }
    // www.bloomko.eu → bloomko.eu
    if (url.hostname === "www.bloomko.eu") {
      url.hostname = "bloomko.eu";
      return Response.redirect(url.toString(), 301);
    }
    return env.ASSETS.fetch(request);
  },
};
