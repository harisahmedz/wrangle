import { describe, expect, it, vi } from "vitest";
import { z } from "zod";
import { DEFAULT_MODELS, OPENROUTER_CHAT_URL, openRouterCandidates } from "@/lib/ai/openrouter";
import { MAX_OPENROUTER_REQUESTS, parseReply, REPAIR_PROMPT, runTaskWith, toJsonSchema } from "@/lib/ai/run-task";
import { PING_ANSWER, PING_INPUT, pingTask } from "@/lib/ai/tasks/ping";
import { type Candidate, type ChatMessage, ProviderError } from "@/lib/ai/types";
import recordedOk from "./fixtures/ai/openrouter-ping-ok.json";

// docs/AI.md: the pure runner with scripted candidates. No network anywhere.

type Step = { reply: string } | { throw: Error } | { hang: true };

/** A candidate that plays `steps` in order and records every transcript it was given. */
function scripted(provider: "nano" | "openrouter", steps: Step[], model?: string) {
  const calls: ChatMessage[][] = [];
  const c: Candidate = {
    provider,
    model,
    async complete(messages, _schema, signal) {
      calls.push(messages);
      const step = steps.shift() ?? { throw: new Error("no more steps") };
      if ("hang" in step) {
        return new Promise<string>((_, reject) => {
          signal.addEventListener("abort", () => reject(new Error("aborted")), { once: true });
        });
      }
      if ("throw" in step) throw step.throw;
      return step.reply;
    },
  };
  return { c, calls };
}

const http = (status: number) => new ProviderError(`OpenRouter ${status}`, status);
const deps = (candidates: Candidate[], extra: Partial<Parameters<typeof runTaskWith>[2]> = {}) => ({
  mode: "on-device-then-openrouter" as const,
  online: true,
  candidates,
  ...extra,
});
const run = (candidates: Candidate[], extra?: Partial<Parameters<typeof runTaskWith>[2]>) =>
  runTaskWith(pingTask, PING_INPUT, deps(candidates, extra));

describe("gates", () => {
  it("mode off, offline, no candidates and over-budget input fail without calling anyone", async () => {
    const { c, calls } = scripted("nano", [{ reply: '{"pick":3}' }]);
    expect(await run([c], { mode: "off" })).toEqual({ ok: false, reason: "off" });
    expect(await run([c], { online: false })).toEqual({ ok: false, reason: "offline" });
    expect(await run([])).toEqual({ ok: false, reason: "no-provider" });
    const long = { words: Array.from({ length: 40 }, (_, i) => `word-number-${i}`) };
    const over = await runTaskWith(pingTask, long, deps([c]));
    expect(over).toMatchObject({ ok: false, reason: "budget" });
    expect(calls).toHaveLength(0);
  });

  it("a prompt builder that throws is an error, not an exception", async () => {
    const bad = { ...pingTask, prompt: () => { throw new Error("boom"); } };
    expect(await runTaskWith(bad, PING_INPUT, deps([scripted("nano", []).c]))).toMatchObject({
      ok: false,
      reason: "error",
      detail: "boom",
    });
  });
});

describe("provider order and fallback", () => {
  it("Nano answers first; OpenRouter is never called", async () => {
    const nano = scripted("nano", [{ reply: '{"pick":3}' }]);
    const or = scripted("openrouter", [{ reply: '{"pick":3}' }], "m1");
    const r = await run([nano.c, or.c]);
    expect(r).toMatchObject({ ok: true, data: { pick: PING_ANSWER }, provider: "nano" });
    expect(nano.calls).toHaveLength(1);
    expect(or.calls).toHaveLength(0);
  });

  it("sends the system card, the examples as prior turns, then the facts", async () => {
    const nano = scripted("nano", [{ reply: '{"pick":3}' }]);
    await run([nano.c]);
    const roles = nano.calls[0].map((m) => m.role);
    expect(roles).toEqual(["system", "user", "assistant", "user", "assistant", "user"]);
    expect(nano.calls[0].at(-1)?.content).toBe("1. apple\n2. car\n3. blue\n4. seven");
    expect(nano.calls[0][2].content).toBe('{"pick":2}');
  });

  it("moves to the next model on 429, 404 and 5xx", async () => {
    const a = scripted("openrouter", [{ throw: http(429) }], "a");
    const b = scripted("openrouter", [{ throw: http(404) }], "b");
    const c = scripted("openrouter", [{ throw: http(503) }], "c");
    const d = scripted("openrouter", [{ reply: '{"pick":3}' }], "d");
    expect(await run([a.c, b.c, c.c, d.c], { maxOpenRouterRequests: 4 })).toMatchObject({
      ok: true,
      provider: "openrouter",
      model: "d",
    });
    // With the default cap of 3, the 4th model is never reached.
    const a2 = scripted("openrouter", [{ throw: http(429) }], "a");
    const b2 = scripted("openrouter", [{ throw: http(429) }], "b");
    const c2 = scripted("openrouter", [{ throw: http(429) }], "c");
    const d2 = scripted("openrouter", [{ reply: '{"pick":3}' }], "d");
    expect(await run([a2.c, b2.c, c2.c, d2.c])).toMatchObject({ ok: false, reason: "error", detail: "OpenRouter 429" });
    expect(d2.calls).toHaveLength(0);
    expect(MAX_OPENROUTER_REQUESTS).toBe(3);
  });

  it("network errors and Nano exceptions also fall through", async () => {
    const nano = scripted("nano", [{ throw: new TypeError("Failed to fetch") }]);
    const or = scripted("openrouter", [{ reply: '{"pick":3}' }], "m");
    expect(await run([nano.c, or.c])).toMatchObject({ ok: true, provider: "openrouter" });
  });

  it("401/402/403 stop the chain with reason auth", async () => {
    for (const status of [401, 402, 403]) {
      const a = scripted("openrouter", [{ throw: http(status) }], "a");
      const b = scripted("openrouter", [{ reply: '{"pick":3}' }], "b");
      expect(await run([a.c, b.c])).toEqual({ ok: false, reason: "auth", detail: `OpenRouter ${status}` });
      expect(b.calls).toHaveLength(0);
    }
  });

  it("a hung candidate times out and the next one answers", async () => {
    const slow = scripted("nano", [{ hang: true }]);
    const or = scripted("openrouter", [{ reply: '{"pick":3}' }], "m");
    const r = await run([slow.c, or.c], { timeoutMs: 20 });
    expect(r).toMatchObject({ ok: true, provider: "openrouter" });
    const onlySlow = scripted("nano", [{ hang: true }]);
    expect(await run([onlySlow.c], { timeoutMs: 20 })).toEqual({ ok: false, reason: "timeout", detail: undefined });
  });

  it("a candidate that ignores the signal still times out", async () => {
    const stubborn: Candidate = { provider: "nano", complete: () => new Promise<string>(() => {}) };
    expect(await run([stubborn], { timeoutMs: 20 })).toMatchObject({ ok: false, reason: "timeout" });
  });

  it("the caller's signal aborts the run", async () => {
    const ctl = new AbortController();
    const slow = scripted("nano", [{ hang: true }]);
    const p = runTaskWith(pingTask, PING_INPUT, deps([slow.c]), { signal: ctl.signal });
    ctl.abort();
    expect(await p).toEqual({ ok: false, reason: "aborted", detail: undefined });
    ctl.abort();
    expect(await runTaskWith(pingTask, PING_INPUT, deps([slow.c]), { signal: ctl.signal })).toMatchObject({
      reason: "aborted",
    });
  });
});

describe("validation and the single repair turn", () => {
  it("parseReply tolerates fences and prose, then lets Zod decide", () => {
    const s = pingTask.schema;
    expect(parseReply('```json\n{"pick": 3}\n```', s)).toEqual({ ok: true, data: { pick: 3 } });
    expect(parseReply('Sure! Here it is: {"pick":1} hope that helps', s)).toEqual({ ok: true, data: { pick: 1 } });
    expect(parseReply("no json here", s)).toMatchObject({ ok: false, issues: "no JSON object found" });
    expect(parseReply("{pick: 3}", s)).toMatchObject({ ok: false, issues: "not valid JSON" });
    expect(parseReply('{"pick": 42}', s)).toMatchObject({ ok: false, issues: expect.stringContaining("pick") });
    expect(parseReply('{"pick": "3"}', s)).toMatchObject({ ok: false });
  });

  it("an invalid reply gets one repair turn on the same candidate, with the reply and the issues appended", async () => {
    const nano = scripted("nano", [{ reply: "The colour is blue, so 3." }, { reply: '{"pick":3}' }]);
    const r = await run([nano.c]);
    expect(r).toMatchObject({ ok: true, data: { pick: 3 }, provider: "nano" });
    expect(nano.calls).toHaveLength(2);
    const repair = nano.calls[1];
    expect(repair.length).toBe(nano.calls[0].length + 2);
    expect(repair.at(-2)).toEqual({ role: "assistant", content: "The colour is blue, so 3." });
    expect(repair.at(-1)?.role).toBe("user");
    expect(repair.at(-1)?.content.startsWith(REPAIR_PROMPT)).toBe(true);
    expect(repair.at(-1)?.content).toContain("no JSON object found");
  });

  it("a second invalid reply moves on, and no later candidate gets a repair turn", async () => {
    const nano = scripted("nano", [{ reply: '{"pick":99}' }, { reply: '{"pick":"x"}' }]);
    const a = scripted("openrouter", [{ reply: "nope" }], "a");
    const b = scripted("openrouter", [{ reply: '{"pick":3}' }], "b");
    const r = await run([nano.c, a.c, b.c]);
    expect(r).toMatchObject({ ok: true, provider: "openrouter", model: "b" });
    expect(nano.calls).toHaveLength(2);
    expect(a.calls).toHaveLength(1);
    expect(b.calls).toHaveLength(1);
  });

  it("the repair turn counts against the OpenRouter cap", async () => {
    const a = scripted("openrouter", [{ reply: "bad" }, { reply: "still bad" }], "a");
    const b = scripted("openrouter", [{ reply: "bad" }], "b");
    const c = scripted("openrouter", [{ reply: '{"pick":3}' }], "c");
    expect(await run([a.c, b.c, c.c])).toMatchObject({ ok: false, reason: "invalid" });
    expect(a.calls).toHaveLength(2);
    expect(b.calls).toHaveLength(1);
    expect(c.calls).toHaveLength(0);
  });

  it("everything invalid → reason invalid with the last issues", async () => {
    const nano = scripted("nano", [{ reply: "{}" }, { reply: "{}" }]);
    expect(await run([nano.c])).toMatchObject({ ok: false, reason: "invalid", detail: expect.stringContaining("pick") });
  });
});

describe("toJsonSchema", () => {
  it("drops $schema and keeps strict-mode shape (all required, no extra keys)", () => {
    const schema = toJsonSchema(z.object({ items: z.array(z.string().max(60)).min(3).max(7), project: z.number().int().nullable() }));
    expect(schema.$schema).toBeUndefined();
    expect(schema).toMatchObject({ type: "object", required: ["items", "project"], additionalProperties: false });
  });
});

describe("OpenRouter candidate", () => {
  const recorded = () => new Response(JSON.stringify(recordedOk), { status: 200 });

  it("parses a recorded reply, sends the key only in Authorization and names the task in json_schema", async () => {
    const fetchFn = vi.fn(async () => recorded());
    const [c] = openRouterCandidates("sk-or-test-key", { models: ["openrouter/free"], fetchFn, taskName: "ping" });
    const r = await run([c]);
    expect(r).toMatchObject({ ok: true, data: { pick: 3 }, provider: "openrouter", model: "openrouter/free" });

    expect(fetchFn).toHaveBeenCalledTimes(1);
    const [url, init] = fetchFn.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe(OPENROUTER_CHAT_URL);
    expect((init.headers as Record<string, string>).Authorization).toBe("Bearer sk-or-test-key");
    const body = JSON.parse(String(init.body));
    expect(body).toMatchObject({ model: "openrouter/free", temperature: 0, reasoning: { effort: "low" } });
    expect(body.response_format).toEqual({
      type: "json_schema",
      json_schema: { name: "ping", strict: true, schema: toJsonSchema(pingTask.schema) },
    });
    expect(body.messages).toHaveLength(6);
    expect(String(init.body)).not.toContain("sk-or-test-key");
  });

  it("uses the default model list in order and ends with openrouter/free", async () => {
    const fetchFn = vi.fn(async () => new Response("rate limited", { status: 429 }));
    const cands = openRouterCandidates("k", { fetchFn });
    expect(cands.map((c) => c.model)).toEqual(DEFAULT_MODELS);
    expect(DEFAULT_MODELS.at(-1)).toBe("openrouter/free");
    const r = await run(cands);
    expect(r).toEqual({ ok: false, reason: "error", detail: "OpenRouter 429" });
    expect(fetchFn).toHaveBeenCalledTimes(3);
    const models = fetchFn.mock.calls.map((call) => JSON.parse(String((call as unknown as [string, RequestInit])[1].body)).model);
    expect(models).toEqual(DEFAULT_MODELS);
  });

  it("an empty or malformed body is a provider error, not a crash", async () => {
    const fetchFn = vi.fn(async () => new Response(JSON.stringify({ choices: [{ message: { content: "" } }] }), { status: 200 }));
    const [c] = openRouterCandidates("k", { models: ["x"], fetchFn });
    await expect(c.complete([], {}, new AbortController().signal)).rejects.toBeInstanceOf(ProviderError);
    const garbage = vi.fn(async () => new Response("<html>", { status: 200 }));
    const [g] = openRouterCandidates("k", { models: ["x"], fetchFn: garbage });
    await expect(g.complete([], {}, new AbortController().signal)).rejects.toBeInstanceOf(ProviderError);
  });
});
