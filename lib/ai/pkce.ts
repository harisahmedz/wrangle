// OpenRouter OAuth PKCE (ROADMAP-V3 §4.1), shape verified against
// https://openrouter.ai/docs/guides/overview/auth/oauth on 2026-11-02:
//   1. GET  https://openrouter.ai/auth?callback_url=…&code_challenge=…&code_challenge_method=S256&state=…
//   2. back on `callback_url` with `?code=…&state=…` (state returned unchanged)
//   3. POST https://openrouter.ai/api/v1/auth/keys  { code, code_verifier, code_challenge_method }  →  { key }
// The challenge is base64url(SHA-256(verifier)). Codes expire after 10 min;
// a bad code/verifier is a 403. Everything here runs in the browser; the key
// goes straight into the device-only store (lib/ai/key-store.ts).
import { saveKey } from "@/lib/ai/key-store";

export const OPENROUTER_AUTH_URL = "https://openrouter.ai/auth";
export const OPENROUTER_KEYS_URL = "https://openrouter.ai/api/v1/auth/keys";
/** Where "Revoke" sends the user for the remote half. */
export const OPENROUTER_MANAGE_KEYS_URL = "https://openrouter.ai/settings/keys";
export const CALLBACK_PATH = "/settings/ai/callback";

/**
 * localStorage slot for the in-flight verifier + state. Per-origin rather
 * than per-tab (sessionStorage) because an installed PWA may complete the
 * round trip in a different browsing context (Android Custom Tab).
 */
export const PENDING_KEY = "wrangle-ai-pkce";
/** OpenRouter's code lifetime. */
const PENDING_TTL_MS = 10 * 60 * 1000;

export function base64url(bytes: ArrayBuffer | Uint8Array): string {
  const view = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  let bin = "";
  for (const b of view) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

export function randomToken(bytes = 32): string {
  const buf = new Uint8Array(bytes);
  crypto.getRandomValues(buf);
  return base64url(buf);
}

/** RFC 7636 S256: base64url(SHA-256(ascii(verifier))). */
export async function challengeFor(verifier: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(verifier));
  return base64url(digest);
}

export function buildAuthUrl(p: { callbackUrl: string; challenge: string; state: string }): string {
  const url = new URL(OPENROUTER_AUTH_URL);
  url.searchParams.set("callback_url", p.callbackUrl);
  url.searchParams.set("code_challenge", p.challenge);
  url.searchParams.set("code_challenge_method", "S256");
  url.searchParams.set("state", p.state);
  url.searchParams.set("key_label", "Wrangle");
  return url.toString();
}

/** Step 3. Resolves to the key; throws with OpenRouter's status otherwise (never the key). */
export async function exchangeCode(
  p: { code: string; verifier: string },
  fetchFn: typeof fetch = fetch,
): Promise<string> {
  const res = await fetchFn(OPENROUTER_KEYS_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ code: p.code, code_verifier: p.verifier, code_challenge_method: "S256" }),
  });
  if (!res.ok) throw new Error(`OpenRouter rejected the code (${res.status})`);
  const body = (await res.json().catch(() => null)) as { key?: unknown } | null;
  if (!body || typeof body.key !== "string" || !body.key) throw new Error("OpenRouter returned no key");
  return body.key;
}

type Pending = { verifier: string; state: string; at: number };

/** Browser step 1: stash verifier + state, return the URL to navigate to. */
export async function beginConnect(origin: string): Promise<string> {
  const pending: Pending = { verifier: randomToken(), state: randomToken(16), at: Date.now() };
  localStorage.setItem(PENDING_KEY, JSON.stringify(pending));
  return buildAuthUrl({
    callbackUrl: origin + CALLBACK_PATH,
    challenge: await challengeFor(pending.verifier),
    state: pending.state,
  });
}

/**
 * Browser step 2+3, called by the callback page. Checks `state` against the
 * stash, exchanges, stores. The stash is cleared either way so a code can't
 * be replayed from history. Failure reasons are plain English for the page.
 */
export async function finishConnect(
  params: { code: string | null; state: string | null },
  deps: { fetchFn?: typeof fetch; save?: typeof saveKey; now?: () => number } = {},
): Promise<{ ok: true } | { ok: false; error: string }> {
  const raw = localStorage.getItem(PENDING_KEY);
  localStorage.removeItem(PENDING_KEY);
  if (!params.code) return { ok: false, error: "OpenRouter did not return a code (did you cancel?)." };
  let pending: Pending | null = null;
  try {
    pending = raw ? (JSON.parse(raw) as Pending) : null;
  } catch {
    pending = null;
  }
  if (!pending || (deps.now ?? Date.now)() - pending.at > PENDING_TTL_MS) {
    return {
      ok: false,
      error: "This connection attempt has expired or wasn't started on this device. Start again from Settings.",
    };
  }
  if (params.state !== pending.state) return { ok: false, error: "State mismatch. Start again from Settings." };
  try {
    const key = await exchangeCode({ code: params.code, verifier: pending.verifier }, deps.fetchFn);
    await (deps.save ?? saveKey)({ key, source: "pkce", connectedAt: Date.now() });
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Could not finish connecting." };
  }
}
