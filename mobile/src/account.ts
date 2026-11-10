// Accounts (2.0): sign in with email and password on any device and in either app (East,
// Heritage, the web version), and your progress follows you. The account doesn't hold your data
// itself — it holds your sync code in an encrypted "vault", and sync (sync.ts) does the rest.
//
// The password never leaves the device. Two keys are made from it:
//   - a login key, sent to bloomko.eu to prove it's you (the server stores only a hash of it);
//   - a vault key, which encrypts the vault on the device (the server can't open it).
// So a forgotten password can't be reset by us; a saved backup key still restores your data.
import { enc, hex, open, seal } from "./sync.js";

export const ACCOUNT_URL = () => window.__accountUrl || "https://bloomko.eu/api/account";

export const cleanEmail = (email: string) => String(email || "").trim().toLowerCase();
export const validEmail = (email: string) => /^[^\s@]{1,64}@[^\s@]{1,190}\.[^\s@]{2,24}$/.test(cleanEmail(email));
export const MIN_PASSWORD = 8;

const vaultSalt = (email: string) => `bloomko-vault:${cleanEmail(email)}`;

/** The login key: PBKDF2 of the password, salted with the email. */
export async function loginKey(email: string, password: string): Promise<string> {
  const base = await crypto.subtle.importKey("raw", enc.encode(password), "PBKDF2", false, ["deriveBits"]);
  return hex(await crypto.subtle.deriveBits({ name: "PBKDF2", salt: enc.encode(`bloomko-auth:${cleanEmail(email)}`), iterations: 150000, hash: "SHA-256" }, base, 256));
}

/** What the vault holds: the sync code that all your devices share. */
export interface Vault {
  sync: string;
}

async function call(action: string, body: Record<string, unknown>) {
  let r: Response;
  try {
    r = await fetch(`${ACCOUNT_URL()}/${action}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  } catch {
    throw new Error("Can't reach bloomko.eu — check your internet connection");
  }
  const data = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(data.error || `Account server error ${r.status}`);
  return data;
}

export async function register(email: string, password: string, vault: Vault): Promise<void> {
  if (!validEmail(email)) throw new Error("That doesn't look like an email address");
  if (password.length < MIN_PASSWORD) throw new Error(`Use a password of at least ${MIN_PASSWORD} characters`);
  await call("register", { email: cleanEmail(email), auth: await loginKey(email, password), vault: await seal(password, vault, vaultSalt(email)) });
}

/** Sign in: returns the vault (the shared sync code). */
export async function login(email: string, password: string): Promise<Vault> {
  if (!validEmail(email)) throw new Error("That doesn't look like an email address");
  const r = await call("login", { email: cleanEmail(email), auth: await loginKey(email, password) });
  try {
    return await open(password, r.vault, vaultSalt(email));
  } catch {
    throw new Error("Couldn't open your account — wrong password?");
  }
}

export async function changePassword(email: string, oldPassword: string, newPassword: string): Promise<void> {
  if (newPassword.length < MIN_PASSWORD) throw new Error(`Use a password of at least ${MIN_PASSWORD} characters`);
  const vault = await login(email, oldPassword);
  await call("update", {
    email: cleanEmail(email),
    auth: await loginKey(email, oldPassword),
    new_auth: await loginKey(email, newPassword),
    vault: await seal(newPassword, vault, vaultSalt(email)),
  });
}

export async function remove(email: string, password: string): Promise<void> {
  await call("delete", { email: cleanEmail(email), auth: await loginKey(email, password) });
}
