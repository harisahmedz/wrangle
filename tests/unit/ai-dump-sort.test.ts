import { describe, expect, it } from "vitest";
import { buildMessages, runTaskWith } from "@/lib/ai/run-task";
import {
  buildDumpSortUser,
  DUMP_SORT_LINE_CHARS,
  DUMP_SORT_MAX_LINES,
  dumpSortSchema,
  dumpSortTask,
  resolveDumpItems,
  type DumpSortInput,
} from "@/lib/ai/tasks/dump-sort";
import type { Candidate } from "@/lib/ai/types";
import { isUnplaced, parseDump } from "@/lib/dump/parser";
import recordedOk from "./fixtures/ai/openrouter-dump-sort-ok.json";

// ROADMAP-V3 A1 golden tests: scripted candidate replies, no network.

function scripted(...replies: string[]) {
  const calls: number[] = [];
  const c: Candidate = {
    provider: "openrouter",
    model: "fake",
    async complete() {
      calls.push(1);
      const r = replies.shift();
      if (r === undefined) throw new Error("no more replies");
      return r;
    },
  };
  return { c, calls };
}
const run = (input: DumpSortInput, c: Candidate) =>
  runTaskWith(dumpSortTask, input, { mode: "on-device-then-openrouter", online: true, candidates: [c] });
const reply = (items: unknown[]) => JSON.stringify({ items });

const INPUT: DumpSortInput = {
  lines: ["dark mode for the blog", "pizza with Sam", "reading about rust lifetimes", "renew passport"],
  projects: ["Blog", "Home"],
};

describe("dump-sort task card", () => {
  it("examples satisfy the schema", () => {
    for (const ex of dumpSortTask.examples ?? []) expect(dumpSortSchema.safeParse(ex.output).success).toBe(true);
  });

  it("sends numbered lines and numbered projects, and the system card forbids dates and amounts", () => {
    const { system, user } = dumpSortTask.prompt(INPUT);
    expect(user).toBe(
      "LINES\n1. dark mode for the blog\n2. pizza with Sam\n3. reading about rust lifetimes\n4. renew passport\nPROJECTS\n1. Blog\n2. Home",
    );
    expect(system).toMatch(/Never write dates, times or money amounts/);
    expect(buildDumpSortUser({ lines: ["x"] })).toContain("PROJECTS\n(none)");
  });

  it("caps lines at 20 x 200 chars and stays under the input budget", () => {
    const lines = Array.from({ length: 35 }, () => "word ".repeat(80));
    const projects = Array.from({ length: 30 }, () => "p".repeat(90));
    const { user } = dumpSortTask.prompt({ lines, projects });
    expect(user.length).toBeLessThanOrEqual(dumpSortTask.inputBudget);
    expect(user).toContain(`${DUMP_SORT_MAX_LINES}. `);
    expect(user).not.toContain(`${DUMP_SORT_MAX_LINES + 1}. `);
    const longest = Math.max(...user.split("\n").map((l) => l.length));
    expect(longest).toBeLessThanOrEqual(DUMP_SORT_LINE_CHARS + 4);
  });

  it("sends the 2 examples as prior turns", () => {
    expect(buildMessages(dumpSortTask, dumpSortTask.prompt(INPUT))).toHaveLength(6);
  });
});

describe("golden runs", () => {
  it("valid reply", async () => {
    const items = [
      { line: 1, kind: "idea", title: "Dark mode for the blog", project: 1 },
      { line: 2, kind: "expense", title: "Pizza with Sam", project: null },
      { line: 3, kind: "learning", title: "Rust lifetimes", project: null },
      { line: 4, kind: "task", title: "Renew passport", project: null },
    ];
    const { c } = scripted(reply(items));
    const r = await run(INPUT, c);
    expect(r.ok && r.data.items).toEqual(items);
  });

  it("a recorded OpenRouter reply (dots-3-note, 2026-11-03) validates and resolves", async () => {
    const { c } = scripted(recordedOk.choices[0].message.content);
    const r = await run({ lines: ["dark mode for the blog", "pizza with Sam", "reading about rust lifetimes", "renew passport", "what if the app had themes", "borrowed 20 from dad"], projects: ["Blog", "Home"] }, c);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    const m = resolveDumpItems(r.data.items, 6, 2);
    expect(m.get(0)).toEqual({ kind: "idea", title: "Dark mode for the blog", project: 1 });
    expect(m.get(5)?.kind).toBe("expense");
    expect(m.size).toBe(6);
  });

  it("reply wrapped in a code fence is accepted", async () => {
    const { c } = scripted("```json\n" + reply([{ line: 1, kind: "idea", title: "Dark mode", project: null }]) + "\n```");
    expect((await run(INPUT, c)).ok).toBe(true);
  });

  it("invalid first reply is repaired once", async () => {
    const { c, calls } = scripted("sure! here you go", reply([{ line: 2, kind: "expense", title: "Pizza", project: null }]));
    const r = await run(INPUT, c);
    expect(r.ok).toBe(true);
    expect(calls).toHaveLength(2);
  });

  it("unknown kind, long title and extra keys-free garbage fall back to invalid", async () => {
    const bad = reply([{ line: 1, kind: "reminder", title: "x", project: null }]);
    const long = reply([{ line: 1, kind: "task", title: "y".repeat(81), project: null }]);
    const { c } = scripted(bad, bad);
    expect(await run(INPUT, c)).toMatchObject({ ok: false, reason: "invalid" });
    const second = scripted(long, long);
    expect(await run(INPUT, second.c)).toMatchObject({ ok: false, reason: "invalid" });
  });

  it("amounts or dates the model adds are not part of the output shape", () => {
    const parsed = dumpSortSchema.parse({
      items: [{ line: 1, kind: "expense", title: "Pizza", project: null, amount: 12, due: "tomorrow" }],
    });
    expect(parsed.items[0]).not.toHaveProperty("amount");
    expect(parsed.items[0]).not.toHaveProperty("due");
  });

  it("over-budget input never reaches the model", async () => {
    const { c, calls } = scripted(reply([]));
    const huge = { lines: ["a"], projects: [] };
    const task = { ...dumpSortTask, inputBudget: 5 };
    const r = await runTaskWith(task, huge, { mode: "on-device-then-openrouter", online: true, candidates: [c] });
    expect(r).toMatchObject({ ok: false, reason: "budget" });
    expect(calls).toHaveLength(0);
  });

  it("no provider, offline and off all fail so the heuristic rows stay", async () => {
    const base = { candidates: [] as Candidate[] };
    expect(await runTaskWith(dumpSortTask, INPUT, { ...base, mode: "off", online: true })).toMatchObject({ ok: false, reason: "off" });
    expect(await runTaskWith(dumpSortTask, INPUT, { ...base, mode: "on-device", online: false })).toMatchObject({ ok: false, reason: "offline" });
    expect(await runTaskWith(dumpSortTask, INPUT, { ...base, mode: "on-device", online: true })).toMatchObject({ ok: false, reason: "no-provider" });
  });
});

describe("resolveDumpItems (code re-checks the meaning)", () => {
  it("ignores invented and duplicate line numbers, keeps the first answer", () => {
    const m = resolveDumpItems(
      [
        { line: 2, kind: "idea", title: "First", project: null },
        { line: 2, kind: "task", title: "Second", project: null },
        { line: 9, kind: "task", title: "Invented", project: null },
        { line: 1, kind: "task", title: "   ", project: null },
      ],
      3,
    );
    expect([...m.keys()]).toEqual([1]);
    expect(m.get(1)).toEqual({ kind: "idea", title: "First", project: null });
  });

  it("nulls a project number outside the list that was sent", () => {
    const m = resolveDumpItems([{ line: 1, kind: "task", title: "A", project: 3 }, { line: 2, kind: "task", title: "B", project: 2 }], 2, 2);
    expect(m.get(0)?.project).toBeNull();
    expect(m.get(1)?.project).toBe(2);
  });
});

describe("isUnplaced (what goes to the AI)", () => {
  const opts = { now: new Date(Date.UTC(2026, 7, 25, 12)), tz: "UTC" };
  const flags = (raw: string) => parseDump(raw, opts).map(isUnplaced);

  it("plain lines are unplaced; cued, amounted, dated and prefixed lines are not", () => {
    expect(flags("dark mode for the blog… spent 8.50 on fuel… idea: themes… call Ali tomorrow at 5… did 40 minutes of rust")).toEqual([
      true,
      false,
      false,
      false,
      false,
    ]);
  });
});
