// Friends (2.1): visit a friend's garden and water it — a gentle nudge for their streak.
// Each of you publishes a garden card to bloomko.eu under a friend code: your name, your streak,
// whether you practised today, and how your garden looks (which plant grows where). No words, no
// progress details. Watering lands in the friend's inbox and shows on their home screen.
import { ALPHABET } from "./sync.js";
import { SPECIES, plantFor } from "../../app/static/js/plants.js";

export const FRIENDS_URL = () => window.__friendsUrl || "https://bloomko.eu/api/friends";

export function newFriendCode(): string {
  const b = crypto.getRandomValues(new Uint8Array(8));
  const s = [...b].map((x) => ALPHABET[x % 32]).join("");
  return `${s.slice(0, 4)}-${s.slice(4)}`;
}

export function cleanFriendCode(input: string): string {
  const s = String(input || "").toUpperCase().replace(/[^0-9A-Z]/g, "").replace(/O/g, "0").replace(/I/g, "1");
  if (s.length !== 8 || [...s].some((c) => !ALPHABET.includes(c))) return "";
  return `${s.slice(0, 4)}-${s.slice(4)}`;
}

export const newSecret = () => [...crypto.getRandomValues(new Uint8Array(16))].map((b) => b.toString(16).padStart(2, "0")).join("");

// ------------------------------------------------------------------ the garden, compact
// Two characters per spot: the plant ("." bare soil, "_" gone) and its state: health × size.
const HEALTH = ["healthy", "thirsty", "wilting"];
const STATE = "abcdefghijkl";

export interface Spot {
  health: string;
  size?: number;
  plant?: string;
}

export function encodeBed(spots: { health: string; size?: number; t?: string }[], lang: string): string {
  return spots
    .map((p) => {
      if (p.health === "empty") return "..";
      if (p.health === "gone") return "__";
      const sp = SPECIES.indexOf(plantFor(lang, p.t));
      return sp.toString(36) + STATE[Math.max(0, HEALTH.indexOf(p.health)) * 4 + Math.min(3, p.size || 0)];
    })
    .join("");
}

export function decodeBed(s: string): Spot[] {
  const out: Spot[] = [];
  for (let i = 0; i + 1 < s.length; i += 2) {
    const a = s[i];
    const b = s[i + 1];
    if (a === ".") out.push({ health: "empty" });
    else if (a === "_") out.push({ health: "gone" });
    else {
      const k = STATE.indexOf(b);
      out.push({ plant: SPECIES[parseInt(a, 36)]?.key || SPECIES[0].key, health: HEALTH[Math.floor(k / 4)] || "healthy", size: k % 4 });
    }
  }
  return out;
}

// ------------------------------------------------------------------ talking to bloomko.eu

async function call(method: string, path: string, body?: unknown) {
  let r: Response;
  try {
    r = await fetch(`${FRIENDS_URL()}/${path}`, { method, headers: body ? { "Content-Type": "application/json" } : {}, body: body ? JSON.stringify(body) : undefined });
  } catch {
    throw new Error("Can't reach bloomko.eu — check your internet connection");
  }
  const data = await r.json().catch(() => ({}));
  if (!r.ok) throw Object.assign(new Error(data.error || `Friends server error ${r.status}`), { status: r.status });
  return data;
}

/** Publish your garden card; returns who watered your garden since the last time. */
export const publish = (code: string, secret: string, profile: unknown): Promise<{ inbox: { name: string; at: string }[] }> => call("PUT", code, { secret, profile });

export const fetchGarden = (code: string): Promise<{ profile: any; updated: string }> => call("GET", code);

export const water = (code: string, from: string, name: string) => call("POST", `${code}/water`, { from, name });
