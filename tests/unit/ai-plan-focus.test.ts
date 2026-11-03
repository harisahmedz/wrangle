import { describe, expect, it, vi } from "vitest";
import { openRouterCandidates } from "@/lib/ai/openrouter";
import { runTaskWith, toJsonSchema } from "@/lib/ai/run-task";
import {
  cleanPicks,
  PLAN_FOCUS_MAX,
  PLAN_PICKS_MAX,
  PLAN_TITLE_MAX,
  PLAN_TITLES_MAX,
  planFocusTask,
  type PlanFocusInput,
} from "@/lib/ai/tasks/plan-focus";
import type { Candidate, ChatMessage } from "@/lib/ai/types";
import recordedOk from "./fixtures/ai/openrouter-plan-focus-ok.json";

// Golden tests for Plan my week's AI step (docs/AI.md rule 6): scripted
// candidates, never a network call. The model only picks numbers from the
// list it was given; `cleanPicks` is the meaning check that follows Zod.

function scripted(replies: string[], provider: "nano" | "openrouter" = "nano") {
  const calls: ChatMessage[][] = [];
  const c: Candidate = {
    provider,
    model: provider === "openrouter" ? "m" : undefined,
    async complete(messages) {
      calls.push(messages);
      const r = replies.shift();
      if (r === undefined) throw new Error("no more replies");
      return r;
    },
  };
  return { c, calls };
}

const TITLES = [
  "Renew car insurance",
  "Sort out the garage",
  "Write landing page copy",
  "Fix the kitchen tap",
  "Book dentist appointment",
  "Set up analytics",
];
const input = (focus: string, titles = TITLES): PlanFocusInput => ({ focus, titles });
const run = (inp: PlanFocusInput, candidates: Candidate[]) =>
  runTaskWith(planFocusTask, inp, { mode: "on-device-then-openrouter", online: true, candidates });

describe("the task card", () => {
  it("both worked examples satisfy the schema", () => {
    for (const ex of planFocusTask.examples ?? []) {
      expect(planFocusTask.schema.safeParse(ex.output).success).toBe(true);
    }
  });

  it("the user turn is the FOCUS line plus numbered titles; the system card is the fixed task card", () => {
    const built = planFocusTask.prompt(input("get the flat in order"));
    expect(built.user.split("\n")).toEqual([
      "FOCUS: get the flat in order",
      "1. Renew car insurance",
      "2. Sort out the garage",
      "3. Write landing page copy",
      "4. Fix the kitchen tap",
      "5. Book dentist appointment",
      "6. Set up analytics",
    ]);
    expect(built.system).toContain('{"pick": [<task numbers>]}');
    expect(built.system).toMatch(/Never pick more than 15/);
    expect(built.system).not.toMatch(/\d{4}-\d{2}-\d{2}/); // no dates anywhere near the model
  });

  it("caps the focus at 200 chars, titles at 80 chars and 40 lines, and stays inside the budget", () => {
    const long = input("x".repeat(500), Array.from({ length: 60 }, (_, i) => `${i}-${"y".repeat(200)}`));
    const built = planFocusTask.prompt(long);
    const lines = built.user.split("\n");
    expect(lines).toHaveLength(1 + PLAN_TITLES_MAX);
    expect(lines[0]).toBe(`FOCUS: ${"x".repeat(PLAN_FOCUS_MAX)}`);
    expect(lines[1].length).toBeLessThanOrEqual(`${PLAN_TITLES_MAX}. `.length + PLAN_TITLE_MAX);
    expect(lines.at(-1)?.startsWith("40. ")).toBe(true);
    expect(built.user.length).toBeLessThanOrEqual(planFocusTask.inputBudget);
  });
});

describe("cleanPicks", () => {
  it("keeps in-range numbers in the model's order, drops out-of-range, duplicates and non-integers", () => {
    expect(cleanPicks([2, 4], 6)).toEqual([2, 4]);
    expect(cleanPicks([4, 2, 2, 9, 0, -1, 2.5, 6], 6)).toEqual([4, 2, 6]);
    expect(cleanPicks([], 6)).toEqual([]);
    expect(cleanPicks([1, 2, 3], 0)).toEqual([]);
  });

  it("stops at 15", () => {
    const all = Array.from({ length: 40 }, (_, i) => i + 1);
    expect(cleanPicks(all, 40)).toHaveLength(PLAN_PICKS_MAX);
    expect(cleanPicks(all, 40)).toEqual(all.slice(0, 15));
  });
});

describe("golden runs", () => {
  it("1. a clean pick", async () => {
    const { c, calls } = scripted(['{"pick":[2,4]}']);
    const r = await run(input("get the flat in order"), [c]);
    expect(r).toMatchObject({ ok: true, data: { pick: [2, 4] }, provider: "nano" });
    expect(calls).toHaveLength(1);
    expect(calls[0].map((m) => m.role)).toEqual(["system", "user", "assistant", "user", "assistant", "user"]);
  });

  it("2. an empty pick is a valid answer", async () => {
    const r = await run(input("learn the cello"), [scripted(['{"pick":[]}']).c]);
    expect(r).toMatchObject({ ok: true, data: { pick: [] } });
  });

  it("3. prose and code fences around the JSON are tolerated", async () => {
    const r = await run(input("ship the side project"), [scripted(['Sure! ```json\n{"pick": [3, 6]}\n``` done']).c]);
    expect(r).toMatchObject({ ok: true, data: { pick: [3, 6] } });
  });

  it("4. an invalid first reply gets one repair turn", async () => {
    const { c, calls } = scripted(["Tasks 2 and 4 look right.", '{"pick":[2,4]}']);
    const r = await run(input("get the flat in order"), [c]);
    expect(r).toMatchObject({ ok: true, data: { pick: [2, 4] } });
    expect(calls).toHaveLength(2);
    expect(calls[1].at(-1)?.content).toMatch(/not valid/);
  });

  it("5. numbers past the list but within the schema's 40 pass Zod and are dropped by cleanPicks", async () => {
    const r = await run(input("anything"), [scripted(['{"pick":[2,39,40]}']).c]);
    expect(r.ok).toBe(true);
    if (r.ok) expect(cleanPicks(r.data.pick, TITLES.length)).toEqual([2]);
  });

  it("6. a number outside 1..40 fails the schema; the repair fixes it", async () => {
    const { c, calls } = scripted(['{"pick":[0,41]}', '{"pick":[1]}']);
    const r = await run(input("anything"), [c]);
    expect(r).toMatchObject({ ok: true, data: { pick: [1] } });
    expect(calls).toHaveLength(2);
  });

  it("7. more than 15 picks fails the schema; two bad replies → the next candidate answers", async () => {
    const sixteen = JSON.stringify({ pick: Array.from({ length: 16 }, (_, i) => i + 1) });
    const nano = scripted([sixteen, sixteen]);
    const or = scripted(['{"pick":[1,2]}'], "openrouter");
    const r = await run(input("everything"), [nano.c, or.c]);
    expect(r).toMatchObject({ ok: true, provider: "openrouter", data: { pick: [1, 2] } });
    expect(nano.calls).toHaveLength(2);
    expect(or.calls).toHaveLength(1);
  });

  it("8. the wrong shape (strings, an object) never validates", async () => {
    const r = await run(input("x"), [scripted(['{"pick":["2","4"]}', '{"pick":{"a":1}}']).c]);
    expect(r).toMatchObject({ ok: false, reason: "invalid" });
  });

  it("9. duplicates from the model are fine for the schema and folded by cleanPicks", async () => {
    const r = await run(input("x"), [scripted(['{"pick":[4,4,2]}']).c]);
    expect(r.ok).toBe(true);
    if (r.ok) expect(cleanPicks(r.data.pick, TITLES.length)).toEqual([4, 2]);
  });

  it("10. mode off / offline / no provider never call a model (the sheet plans without picks)", async () => {
    const { c, calls } = scripted(['{"pick":[1]}']);
    const inp = input("x");
    expect(await runTaskWith(planFocusTask, inp, { mode: "off", online: true, candidates: [c] })).toEqual({ ok: false, reason: "off" });
    expect(await runTaskWith(planFocusTask, inp, { mode: "on-device", online: false, candidates: [c] })).toEqual({
      ok: false,
      reason: "offline",
    });
    expect(await runTaskWith(planFocusTask, inp, { mode: "on-device", online: true, candidates: [] })).toEqual({
      ok: false,
      reason: "no-provider",
    });
    expect(calls).toHaveLength(0);
  });

  it("11. the recorded OpenRouter reply (dots-3-note-preview, 2026-11-03) parses through the real candidate", async () => {
    // Recorded once with the project key for the demo-seed titles below plus two
    // apartment chores; the model picked exactly the three home-sorting cards.
    const titles = [
      "Renew car insurance", "Book dentist appointment", "Call Amy about the weekend", "Buy bread and coffee",
      "Plan next week", "Sort out the garage", "Do 30 minutes of yoga", "Read two chapters of Deep Work",
      "Write landing page copy", "Set up analytics", "Design onboarding flow", "Fix login redirect bug",
      "Waiting on domain transfer", "Fix the kitchen tap", "Declutter the bedroom wardrobe",
    ];
    const fetchFn = vi.fn(async () => new Response(JSON.stringify(recordedOk), { status: 200 }));
    const [c] = openRouterCandidates("sk-or-test-key", { models: [recordedOk.model], fetchFn, taskName: planFocusTask.name });
    const r = await run(input("this week I want to get the apartment sorted", titles), [c]);
    expect(r).toMatchObject({ ok: true, data: { pick: [6, 14, 15] }, provider: "openrouter", model: recordedOk.model });
    if (r.ok) expect(cleanPicks(r.data.pick, titles.length).map((n) => titles[n - 1])).toEqual([
      "Sort out the garage", "Fix the kitchen tap", "Declutter the bedroom wardrobe",
    ]);
    const [, init] = fetchFn.mock.calls[0] as unknown as [string, RequestInit];
    const body = JSON.parse(String(init.body));
    expect(body.response_format.json_schema).toEqual({ name: "plan_focus", strict: true, schema: toJsonSchema(planFocusTask.schema) });
    expect(String(init.body)).not.toContain("sk-or-test-key");
  });
});
