import { describe, expect, it } from "vitest";
import { runTaskWith, toJsonSchema } from "@/lib/ai/run-task";
import { checklistTask, cleanChecklistItems, CHECKLIST_INPUT_MAX } from "@/lib/ai/tasks/checklist";
import type { Candidate, ChatMessage } from "@/lib/ai/types";

// Golden tests for the checklist task (docs/AI.md rule 6). Scripted replies, no network.

function scripted(replies: string[]) {
  const calls: ChatMessage[][] = [];
  const c: Candidate = {
    provider: "openrouter",
    model: "fake",
    async complete(messages) {
      calls.push(messages);
      const r = replies.shift();
      if (r === undefined) throw new Error("no more replies");
      return r;
    },
  };
  return { c, calls };
}
const IN = { title: "Plan team offsite", description: "Two days in March, 12 people." };
const run = (replies: string[], input = IN, task = checklistTask) => {
  const s = scripted(replies);
  return runTaskWith(task, input, { mode: "on-device-then-openrouter", online: true, candidates: [s.c] }).then((r) => ({ r, s }));
};
const json = (items: unknown) => JSON.stringify({ items });

describe("checklist task: valid replies", () => {
  it("accepts 3 items", async () => {
    const { r } = await run([json(["Pick dates", "Book venue", "Send agenda"])]);
    expect(r).toMatchObject({ ok: true, data: { items: ["Pick dates", "Book venue", "Send agenda"] } });
  });
  it("accepts 7 items", async () => {
    const items = ["a", "b", "c", "d", "e", "f", "g"];
    expect(await run([json(items)]).then((x) => x.r)).toMatchObject({ ok: true, data: { items } });
  });
  it("trims whitespace in items", async () => {
    const { r } = await run([json(["  Pick dates ", "Book venue", "Send agenda"])]);
    expect(r).toMatchObject({ ok: true, data: { items: ["Pick dates", "Book venue", "Send agenda"] } });
  });
  it("strips a code fence around the JSON", async () => {
    const { r } = await run(["```json\n" + json(["One", "Two", "Three"]) + "\n```"]);
    expect(r).toMatchObject({ ok: true });
  });
});

describe("checklist task: invalid replies", () => {
  it("two items is invalid; one repair turn recovers", async () => {
    const { r, s } = await run([json(["One", "Two"]), json(["One", "Two", "Three"])]);
    expect(r).toMatchObject({ ok: true, data: { items: ["One", "Two", "Three"] } });
    expect(s.calls).toHaveLength(2);
  });
  it("eight items twice fails with invalid", async () => {
    const eight = json(["a", "b", "c", "d", "e", "f", "g", "h"]);
    expect((await run([eight, eight])).r).toMatchObject({ ok: false, reason: "invalid" });
  });
  it("an item over 60 characters is invalid", async () => {
    const long = "x".repeat(61);
    expect((await run([json([long, "b", "c"]), json([long, "b", "c"])])).r).toMatchObject({ ok: false, reason: "invalid" });
  });
  it("prose instead of JSON fails", async () => {
    expect((await run(["Sure! Here are some steps.", "Still no JSON"])).r).toMatchObject({ ok: false, reason: "invalid" });
  });
});

describe("checklist task: budget, prompt and examples", () => {
  it("never sends more than the input budget, even for a huge description", async () => {
    const { r, s } = await run([json(["a", "b", "c"])], { title: "T", description: "word ".repeat(2000) });
    expect(r.ok).toBe(true);
    expect(s.calls[0].at(-1)!.content.length).toBeLessThanOrEqual(CHECKLIST_INPUT_MAX);
  });
  it("a tighter budget returns reason budget without calling a model", async () => {
    const { r, s } = await run([json(["a", "b", "c"])], IN, { ...checklistTask, inputBudget: 20 });
    expect(r).toMatchObject({ ok: false, reason: "budget" });
    expect(s.calls).toHaveLength(0);
  });
  it("examples satisfy the schema and the JSON schema converts", () => {
    for (const ex of checklistTask.examples ?? []) expect(checklistTask.schema.safeParse(ex.output).success).toBe(true);
    expect(JSON.stringify(toJsonSchema(checklistTask.schema))).toContain("items");
  });
});

describe("cleanChecklistItems (fallback and meaning checks)", () => {
  it("drops duplicates of existing items and the title, case-insensitively", () => {
    expect(
      cleanChecklistItems(["Pick dates", "book VENUE", "Plan team offsite", "Send agenda"], ["Book venue"], "Plan team offsite"),
    ).toEqual(["Pick dates", "Send agenda"]);
  });
  it("drops repeats inside the reply and returns [] when nothing is left", () => {
    expect(cleanChecklistItems(["A", "a", " A "], [], "t")).toEqual(["A"]);
    expect(cleanChecklistItems(["Pick dates"], ["pick dates"], "t")).toEqual([]);
  });
});
