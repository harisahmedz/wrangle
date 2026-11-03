import { describe, expect, it } from "vitest";
import { findCodeMatch, normalizeTitle, openIdeas, type IdeaRef } from "@/lib/kanban/duplicate-idea";
import { runTaskWith } from "@/lib/ai/run-task";
import { buildSameInput, pickSame, sameIdeaTask } from "@/lib/ai/tasks/same-idea";
import type { Candidate } from "@/lib/ai/types";

const ideas: IdeaRef[] = [
  { id: "a", title: "Home server for photos" },
  { id: "b", title: "Learn to bake sourdough" },
  { id: "c", title: "Podcast" },
  { id: "d", title: "Plan a trip to Japan!" },
];

describe("code matcher", () => {
  it("normalizes case, punctuation and spaces", () => {
    expect(normalizeTitle("  Home,  SERVER -- for photos!! ")).toBe("home server for photos");
  });
  it("matches exact titles regardless of case and punctuation", () => {
    expect(findCodeMatch("home server for photos.", ideas)?.id).toBe("a");
    expect(findCodeMatch("PODCAST", ideas)?.id).toBe("c");
  });
  it("matches containment only when both have 3+ words", () => {
    expect(findCodeMatch("Plan a trip to Japan in spring", ideas)?.id).toBe("d");
    expect(findCodeMatch("Home server for photos and videos", ideas)?.id).toBe("a");
    expect(findCodeMatch("Podcast about woodworking", ideas)).toBeNull();
    expect(findCodeMatch("Learn to bake", ideas)?.id).toBe("b");
  });
  it("returns null for empty or unrelated titles", () => {
    expect(findCodeMatch("!!!", ideas)).toBeNull();
    expect(findCodeMatch("Build a standing desk", ideas)).toBeNull();
  });
  it("openIdeas drops completed cards", () => {
    expect(
      openIdeas([
        { id: "1", title: "x", completedAt: null },
        { id: "2", title: "y", completedAt: "2026-01-01T00:00:00Z" },
      ]),
    ).toEqual([{ id: "1", title: "x" }]);
  });
});

describe("same-idea task", () => {
  const fake = (reply: string): Candidate => ({ provider: "openrouter", model: "fake", complete: async () => reply });
  const run = (title: string, reply: string) => {
    const { input, refs } = buildSameInput(title, ideas);
    return runTaskWith(sameIdeaTask, input, { mode: "on-device-then-openrouter", online: true, candidates: [fake(reply)] }).then(
      (r) => ({ r, refs }),
    );
  };

  it("worked examples satisfy the schema", () => {
    for (const ex of sameIdeaTask.examples ?? []) expect(sameIdeaTask.schema.safeParse(ex.output).success).toBe(true);
  });

  it("caps input to 50 titles of 80 chars and fits the budget", () => {
    const many = Array.from({ length: 80 }, (_, i) => ({ id: `${i}`, title: "x".repeat(200) }));
    const { input, refs } = buildSameInput("y".repeat(300), many);
    expect(refs).toHaveLength(50);
    expect(input.existing.every((t) => t.length === 80)).toBe(true);
    expect(input.title).toHaveLength(80);
    expect(sameIdeaTask.prompt(input).user.length).toBeLessThanOrEqual(sameIdeaTask.inputBudget);
  });

  it("numbers the titles in the user message", () => {
    const { input } = buildSameInput("New thing", ideas);
    expect(sameIdeaTask.prompt(input).user).toContain("NEW: New thing\nEXISTING:\n1. Home server for photos\n2. Learn");
  });

  it("accepts a plain answer and maps the number to the idea", async () => {
    const { r, refs } = await run("Self-host my photos", '{"same":[1]}');
    expect(r.ok && pickSame(r.data.same, refs)?.id).toBe("a");
  });
  it("accepts a fenced reply with prose around it", async () => {
    const { r, refs } = await run("x", 'Sure!\n```json\n{"same":[2,4]}\n```');
    expect(r.ok && pickSame(r.data.same, refs)?.id).toBe("b");
  });
  it("empty answer means no hint", async () => {
    const { r, refs } = await run("x", '{"same":[]}');
    expect(r.ok && pickSame(r.data.same, refs)).toBeNull();
  });
  it("ignores out-of-range numbers and takes the first valid one", async () => {
    const { r, refs } = await run("x", '{"same":[0,9,3]}');
    expect(r.ok && pickSame(r.data.same, refs)?.id).toBe("c");
    expect(pickSame([0, 9, 1.5], refs)).toBeNull();
  });
  it("more than 3 numbers or the wrong shape is invalid, so no hint", async () => {
    expect((await run("x", '{"same":[1,2,3,4]}')).r).toMatchObject({ ok: false, reason: "invalid" });
    expect((await run("x", '{"pick":1}')).r).toMatchObject({ ok: false });
  });
  it("mode off fails without calling the model", async () => {
    const { input } = buildSameInput("x", ideas);
    const r = await runTaskWith(sameIdeaTask, input, { mode: "off", online: true, candidates: [fake('{"same":[1]}')] });
    expect(r).toEqual({ ok: false, reason: "off" });
  });
});
