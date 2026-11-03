import { describe, expect, it } from "vitest";
import { categoryTask, pickCategoryId } from "@/lib/ai/tasks/category";
import { runTaskWith } from "@/lib/ai/run-task";
import { categoryFromHistory } from "@/lib/expenses/suggest-category";
import type { Candidate } from "@/lib/ai/types";

const names = ["Food", "Transport", "Bills", "Fun"];
const ids = ["c1", "c2", "c3", "c4"];

const reply = (text: string): Candidate => ({
  provider: "openrouter",
  async complete() {
    return text;
  },
});
const run = (note: string, text: string) =>
  runTaskWith(categoryTask, { note, names }, { mode: "on-device-then-openrouter", online: true, candidates: [reply(text)] });

const golden: Array<[string, string, string | null]> = [
  ["lunch at subway", '{"category":1}', "c1"],
  ["uber to airport", '{"category":2}', "c2"],
  ["electricity bill", '{"category":3}', "c3"],
  ["cinema tickets", '{"category":4}', "c4"],
  ["asdf", '{"category":null}', null],
  ["coffee", '```json\n{"category": 1}\n```', "c1"],
  ["bus pass", 'Sure! {"category":2}', "c2"],
  ["gift", '{"category":9}', null], // out of range: code rejects
  ["rent", '{"category":0}', null], // schema rejects, repair also fails
  ["groceries", '{"category":"Food"}', null],
];

describe("category task (golden)", () => {
  it.each(golden)("%s -> %s", async (note, text, want) => {
    const r = await run(note, text);
    const id = r.ok ? pickCategoryId(r.data, ids) : null;
    expect(id).toBe(want);
  });

  it("sends only the note and names, never amounts or dates", () => {
    const { user } = categoryTask.prompt({ note: "x".repeat(300), names });
    expect(user).toContain("1. Food");
    expect(user.length).toBeLessThanOrEqual(categoryTask.inputBudget);
    expect(user).not.toMatch(/\d{4}-\d{2}/);
  });

  it("examples satisfy the schema", () => {
    for (const e of categoryTask.examples ?? []) expect(categoryTask.schema.safeParse(e.output).success).toBe(true);
  });
});

describe("categoryFromHistory (code first)", () => {
  const valid = new Set(ids);
  const hints = [
    { note: "Coffee ", categoryId: "c1" },
    { note: "coffee", categoryId: "c4" },
    { note: "bus", categoryId: "gone" },
  ];
  it("matches case-insensitively and trimmed, newest first", () => {
    expect(categoryFromHistory("  COFFEE", hints, valid)).toBe("c1");
  });
  it("returns null for no match, empty note or archived category", () => {
    expect(categoryFromHistory("tea", hints, valid)).toBeNull();
    expect(categoryFromHistory("   ", hints, valid)).toBeNull();
    expect(categoryFromHistory("bus", hints, valid)).toBeNull();
  });
});
