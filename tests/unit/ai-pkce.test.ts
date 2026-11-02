import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  base64url,
  beginConnect,
  buildAuthUrl,
  CALLBACK_PATH,
  challengeFor,
  exchangeCode,
  finishConnect,
  OPENROUTER_KEYS_URL,
  PENDING_KEY,
} from "@/lib/ai/pkce";

// docs/AI.md: OpenRouter's PKCE flow, shape per
// https://openrouter.ai/docs/guides/overview/auth/oauth. No network: fetch is injected.

function memoryStorage() {
  const m = new Map<string, string>();
  return {
    getItem: (k: string) => m.get(k) ?? null,
    setItem: (k: string, v: string) => void m.set(k, v),
    removeItem: (k: string) => void m.delete(k),
  };
}

beforeEach(() => vi.stubGlobal("localStorage", memoryStorage()));
afterEach(() => vi.unstubAllGlobals());

describe("S256", () => {
  it("matches the RFC 7636 appendix B vector", async () => {
    expect(await challengeFor("dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk")).toBe(
      "E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM",
    );
  });

  it("base64url has no padding or +/", () => {
    expect(base64url(new Uint8Array([251, 255, 254, 0]))).toBe("-__-AA");
  });
});

describe("beginConnect", () => {
  it("stashes verifier + state and builds the auth URL with S256", async () => {
    const url = new URL(await beginConnect("https://wrangle.example"));
    const pending = JSON.parse(localStorage.getItem(PENDING_KEY)!) as { verifier: string; state: string; at: number };
    expect(url.origin + url.pathname).toBe("https://openrouter.ai/auth");
    expect(url.searchParams.get("callback_url")).toBe("https://wrangle.example" + CALLBACK_PATH);
    expect(url.searchParams.get("code_challenge_method")).toBe("S256");
    expect(url.searchParams.get("code_challenge")).toBe(await challengeFor(pending.verifier));
    expect(url.searchParams.get("state")).toBe(pending.state);
    expect(url.searchParams.get("key_label")).toBe("Wrangle");
    expect(pending.verifier.length).toBeGreaterThanOrEqual(43);
    expect(url.toString()).not.toContain(pending.verifier);
  });

  it("buildAuthUrl encodes the callback", () => {
    const u = buildAuthUrl({ callbackUrl: "http://localhost:3011/settings/ai/callback", challenge: "c", state: "s" });
    expect(u).toContain("callback_url=http%3A%2F%2Flocalhost%3A3011%2Fsettings%2Fai%2Fcallback");
  });
});

describe("exchangeCode", () => {
  it("POSTs code + verifier + method and returns the key", async () => {
    const fetchFn = vi.fn(async () => new Response(JSON.stringify({ key: "sk-or-v1-new" }), { status: 200 }));
    expect(await exchangeCode({ code: "abc", verifier: "ver" }, fetchFn)).toBe("sk-or-v1-new");
    const [url, init] = fetchFn.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe(OPENROUTER_KEYS_URL);
    expect(init.method).toBe("POST");
    expect(JSON.parse(String(init.body))).toEqual({ code: "abc", code_verifier: "ver", code_challenge_method: "S256" });
  });

  it("surfaces the status on failure and never the key", async () => {
    const fetchFn = vi.fn(async () => new Response("Invalid code or code_verifier", { status: 403 }));
    await expect(exchangeCode({ code: "abc", verifier: "ver" }, fetchFn)).rejects.toThrow("403");
    const noKey = vi.fn(async () => new Response(JSON.stringify({}), { status: 200 }));
    await expect(exchangeCode({ code: "abc", verifier: "ver" }, noKey)).rejects.toThrow("no key");
  });
});

describe("finishConnect", () => {
  it("happy path: checks state, exchanges, saves as pkce, clears the stash", async () => {
    const url = new URL(await beginConnect("https://wrangle.example"));
    const state = url.searchParams.get("state");
    const pending = JSON.parse(localStorage.getItem(PENDING_KEY)!) as { verifier: string };
    const fetchFn = vi.fn(async () => new Response(JSON.stringify({ key: "sk-or-v1-new" }), { status: 200 }));
    const save = vi.fn(async () => {});
    expect(await finishConnect({ code: "the-code", state }, { fetchFn, save })).toEqual({ ok: true });
    expect(JSON.parse(String((fetchFn.mock.calls[0] as unknown as [string, RequestInit])[1].body))).toEqual({
      code: "the-code",
      code_verifier: pending.verifier,
      code_challenge_method: "S256",
    });
    expect(save).toHaveBeenCalledWith(expect.objectContaining({ key: "sk-or-v1-new", source: "pkce" }));
    expect(localStorage.getItem(PENDING_KEY)).toBeNull();
  });

  it("no code, no stash, state mismatch and an expired stash all fail without exchanging", async () => {
    const fetchFn = vi.fn();
    const save = vi.fn();
    expect(await finishConnect({ code: null, state: "x" }, { fetchFn, save })).toMatchObject({ ok: false });
    expect(await finishConnect({ code: "c", state: "x" }, { fetchFn, save })).toMatchObject({
      ok: false,
      error: expect.stringContaining("Start again"),
    });
    await beginConnect("https://wrangle.example");
    expect(await finishConnect({ code: "c", state: "wrong" }, { fetchFn, save })).toMatchObject({
      ok: false,
      error: expect.stringContaining("State mismatch"),
    });
    expect(localStorage.getItem(PENDING_KEY)).toBeNull(); // single use, even on failure
    const url = new URL(await beginConnect("https://wrangle.example"));
    const late = () => Date.now() + 11 * 60 * 1000;
    expect(
      await finishConnect({ code: "c", state: url.searchParams.get("state") }, { fetchFn, save, now: late }),
    ).toMatchObject({ ok: false, error: expect.stringContaining("expired") });
    expect(fetchFn).not.toHaveBeenCalled();
    expect(save).not.toHaveBeenCalled();
  });

  it("an OpenRouter 403 is reported in plain words and nothing is saved", async () => {
    const url = new URL(await beginConnect("https://wrangle.example"));
    const fetchFn = vi.fn(async () => new Response("nope", { status: 403 }));
    const save = vi.fn();
    expect(await finishConnect({ code: "c", state: url.searchParams.get("state") }, { fetchFn, save })).toEqual({
      ok: false,
      error: "OpenRouter rejected the code (403)",
    });
    expect(save).not.toHaveBeenCalled();
  });
});
