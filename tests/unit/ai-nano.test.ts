import "fake-indexeddb/auto";
import { afterEach, describe, expect, it, vi } from "vitest";
import { candidatesFor, runTask } from "@/lib/ai/browser";
import { keyStore } from "@/lib/ai/key-store";
import { type NanoCreateOptions, type NanoModel, type NanoSession, nanoAvailability, nanoCandidate } from "@/lib/ai/nano";
import { DEFAULT_MODELS } from "@/lib/ai/openrouter";
import { PING_INPUT, pingTask } from "@/lib/ai/tasks/ping";

// docs/AI.md: the Nano path against a mocked `LanguageModel` global, and the
// browser composition (`candidatesFor`) that orders Nano before OpenRouter.

function mockModel(availability: Awaited<ReturnType<NanoModel["availability"]>>, replies: string[]) {
  const created: NanoCreateOptions[] = [];
  const prompts: Array<{ input: string; opts: Parameters<NanoSession["prompt"]>[1] }> = [];
  let destroyed = 0;
  const model: NanoModel = {
    availability: async () => availability,
    async create(opts) {
      created.push(opts ?? {});
      return {
        async prompt(input, o) {
          prompts.push({ input, opts: o });
          return replies.shift() ?? "";
        },
        destroy() {
          destroyed++;
        },
      };
    },
  };
  return { model, created, prompts, destroyed: () => destroyed };
}

describe("nanoCandidate", () => {
  it("seeds the session with everything but the last message, prompts with the facts + responseConstraint, destroys", async () => {
    const m = mockModel("available", ['{"pick":3}']);
    const c = nanoCandidate(m.model);
    const messages = [
      { role: "system" as const, content: "card" },
      { role: "user" as const, content: "1. a" },
      { role: "assistant" as const, content: '{"pick":1}' },
      { role: "user" as const, content: "1. apple\n2. blue" },
    ];
    const schema = { type: "object" };
    const signal = new AbortController().signal;
    expect(await c.complete(messages, schema, signal)).toBe('{"pick":3}');
    expect(m.created[0].initialPrompts).toEqual(messages.slice(0, 3));
    expect(m.created[0].signal).toBe(signal);
    expect(m.created[0].expectedOutputs?.[0].type).toBe("text");
    expect(m.prompts[0]).toEqual({ input: "1. apple\n2. blue", opts: { responseConstraint: schema, signal } });
    expect(m.destroyed()).toBe(1);
  });

  it("destroys the session even when prompt throws", async () => {
    const m = mockModel("available", []);
    m.model.create = async () => ({
      prompt: async () => {
        throw new Error("nano failed");
      },
      destroy: () => m.created.push({}),
    });
    await expect(nanoCandidate(m.model).complete([{ role: "user", content: "x" }], {}, new AbortController().signal)).rejects.toThrow(
      "nano failed",
    );
    expect(m.created).toHaveLength(1);
  });

  it("availability is unavailable when the API is missing or throws", async () => {
    expect(await nanoAvailability(null)).toBe("unavailable");
    expect(
      await nanoAvailability({
        availability: async () => {
          throw new Error("no gpu");
        },
        create: async () => ({ prompt: async () => "", destroy() {} }),
      }),
    ).toBe("unavailable");
  });
});

describe("browser runTask with a mocked LanguageModel", () => {
  afterEach(async () => {
    vi.unstubAllGlobals();
    await keyStore().clear();
  });

  it("on-device: Nano is the only candidate and answers the ping", async () => {
    const m = mockModel("available", ['{"pick":3}']);
    vi.stubGlobal("LanguageModel", m.model);
    expect((await candidatesFor("on-device")).map((c) => c.provider)).toEqual(["nano"]);
    const r = await runTask(pingTask, PING_INPUT, { mode: "on-device" });
    expect(r).toMatchObject({ ok: true, provider: "nano", data: { pick: 3 } });
    expect(m.prompts[0].opts?.responseConstraint).toMatchObject({ type: "object", required: ["pick"] });
    expect(m.destroyed()).toBe(1);
  });

  it("a downloadable (not downloaded) Nano is skipped: no provider in on-device mode", async () => {
    const m = mockModel("downloadable", ['{"pick":3}']);
    vi.stubGlobal("LanguageModel", m.model);
    expect(await candidatesFor("on-device")).toEqual([]);
    expect(await runTask(pingTask, PING_INPUT, { mode: "on-device" })).toEqual({ ok: false, reason: "no-provider" });
    expect(m.created).toHaveLength(0);
  });

  it("on-device-then-openrouter: Nano first, then the default models with the stored key", async () => {
    vi.stubGlobal("LanguageModel", mockModel("available", []).model);
    await keyStore().set({ key: "sk-or-stored", source: "paste", connectedAt: 1 });
    const cands = await candidatesFor("on-device-then-openrouter", "ping");
    expect(cands.map((c) => c.provider)).toEqual(["nano", "openrouter", "openrouter", "openrouter"]);
    expect(cands.slice(1).map((c) => c.model)).toEqual(DEFAULT_MODELS);
  });

  it("on-device mode never adds OpenRouter even with a stored key; no Nano + no key → nothing", async () => {
    await keyStore().set({ key: "sk-or-stored", source: "paste", connectedAt: 1 });
    expect(await candidatesFor("on-device")).toEqual([]);
    await keyStore().clear();
    expect(await candidatesFor("on-device-then-openrouter")).toEqual([]);
  });

  it("mode off returns off without probing Nano", async () => {
    const m = mockModel("available", []);
    vi.stubGlobal("LanguageModel", m.model);
    expect(await runTask(pingTask, PING_INPUT, { mode: "off" })).toEqual({ ok: false, reason: "off" });
    expect(m.created).toHaveLength(0);
  });
});
