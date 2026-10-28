import { describe, expect, it } from "vitest";
import {
  cardPatchOf,
  completionOf,
  describeMutation,
  overlayCards,
  overlayChecklist,
  overlayExpenses,
  overlayLearning,
  syncStateOf,
} from "@/lib/outbox/overlay";
import type { Mutation, OutboxEntry, OutboxStatus } from "@/lib/outbox/types";
import type { BoardCardData, BoardColumnData } from "@/lib/kanban/types";

const T0 = Date.UTC(2026, 9, 28, 12, 0, 0);

let seq = 0;
function entry(mutation: Mutation, status: OutboxStatus = "pending", createdAt = T0): OutboxEntry {
  seq += 1;
  return { id: `e${String(seq).padStart(3, "0")}`, userId: "u1", createdAt, attempts: 0, status, mutation };
}

function card(id: string, columnId: string, position: string, extra: Partial<BoardCardData> = {}): BoardCardData {
  return {
    id,
    columnId,
    title: id,
    hasDescription: false,
    dueAt: null,
    completedAt: null,
    position,
    coverColor: null,
    labelColors: [],
    labelIds: [],
    assigneeIds: [],
    impact: null,
    effort: null,
    priority: null,
    ...extra,
  };
}

const columns: BoardColumnData[] = [
  { id: "todo", name: "To do", position: "a0", color: null, wipLimit: null, isDone: false, isCollapsed: false },
  { id: "done", name: "Done", position: "a1", color: null, wipLimit: null, isDone: true, isCollapsed: false },
];

describe("overlayCards", () => {
  const base = [card("c1", "todo", "a0"), card("c2", "todo", "a1")];

  it.each<[string, Mutation, (out: BoardCardData[]) => void]>([
    [
      "create into a known column uses the client position",
      { kind: "card.create", id: "new", target: { columnId: "todo" }, title: "New", position: "a2" },
      (out) => expect(out.find((c) => c.id === "new")).toMatchObject({ columnId: "todo", title: "New", position: "a2" }),
    ],
    [
      "create without a position appends after the column's last card",
      { kind: "card.create", id: "new", target: { columnId: "todo" }, title: "New" },
      (out) => expect(out.find((c) => c.id === "new")!.position > "a1").toBe(true),
    ],
    [
      "create into an unknown column is skipped",
      { kind: "card.create", id: "new", target: { columnId: "elsewhere" }, title: "New" },
      (out) => expect(out).toHaveLength(2),
    ],
    [
      "move into a Done column auto-completes",
      { kind: "card.move", cardId: "c1", toColumnId: "done", position: "a0" },
      (out) =>
        expect(out.find((c) => c.id === "c1")).toMatchObject({
          columnId: "done",
          position: "a0",
          completedAt: new Date(T0).toISOString(),
        }),
    ],
    [
      "complete sets completedAt to the entry's time",
      { kind: "card.complete", cardId: "c2", completed: true },
      (out) => expect(out.find((c) => c.id === "c2")!.completedAt).toBe(new Date(T0).toISOString()),
    ],
    [
      "update patches only the given fields",
      { kind: "card.update", cardId: "c1", patch: { title: "Renamed", description: "x", priority: 2 } },
      (out) => expect(out.find((c) => c.id === "c1")).toMatchObject({ title: "Renamed", hasDescription: true, dueAt: null, priority: 2 }),
    ],
    [
      "create carries its priority (S9)",
      { kind: "card.create", id: "new", target: { columnId: "todo" }, title: "New", position: "a2", priority: 1 },
      (out) => expect(out.find((c) => c.id === "new")).toMatchObject({ priority: 1 }),
    ],
    [
      "a mutation for a card not on this board is ignored",
      { kind: "card.complete", cardId: "nope", completed: true },
      (out) => expect(out).toEqual(base),
    ],
  ])("%s", (_name, m, check) => {
    check(overlayCards(base, columns, [entry(m)]));
  });

  it("applies entries in id order (create, then move, then reopen)", () => {
    const entries = [
      entry({ kind: "card.create", id: "n", target: { columnId: "todo" }, title: "n", position: "a5" }),
      entry({ kind: "card.move", cardId: "n", toColumnId: "done", position: "a0" }),
      entry({ kind: "card.complete", cardId: "n", completed: false }),
    ];
    const out = overlayCards(base, columns, [entries[2], entries[0], entries[1]]);
    expect(out.find((c) => c.id === "n")).toMatchObject({ columnId: "done", completedAt: null });
  });

  it("lands a Quick Add {projectId, boardKind} create in the board's first column when in scope", () => {
    const m: Mutation = { kind: "card.create", id: "q", target: { projectId: "p", boardKind: "todo" }, title: "q" };
    expect(overlayCards(base, columns, [entry(m)], { projectId: "p", boardKind: "todo" }).find((c) => c.id === "q")).toMatchObject({ columnId: "todo" });
    expect(overlayCards(base, columns, [entry(m)], { projectId: "p", boardKind: "ideas" })).toHaveLength(2);
    expect(overlayCards(base, columns, [entry(m)])).toHaveLength(2);
  });

  it("returns the same array when there are no entries", () => {
    expect(overlayCards(base, columns, [])).toBe(base);
  });
});

describe("other overlays", () => {
  it("overlayChecklist sets isDone", () => {
    const items = [{ id: "i1", text: "a", isDone: false }];
    expect(overlayChecklist(items, [entry({ kind: "checklist.set", itemId: "i1", cardId: "c", isDone: true })])).toEqual([
      { id: "i1", text: "a", isDone: true },
    ]);
  });

  it("overlayLearning sets status", () => {
    const items = [{ id: "l1", title: "t", type: "book", status: "want" as const, sourceUrl: null, whyNote: null, targetDate: null, progressPct: 0, hoursLogged: "0" }];
    expect(overlayLearning(items, [entry({ kind: "learning.setStatus", itemId: "l1", status: "learned" })])[0].status).toBe("learned");
  });

  it("overlayExpenses prepends creates for the month on screen, once", () => {
    const m: Mutation = { kind: "expense.create", id: "x1", categoryId: "cat", amountMinor: 1250, spentOn: "2026-10-28" };
    const cats = [{ id: "cat", name: "Food", emoji: "F", color: "#fff" }];
    const out = overlayExpenses([], [entry(m), entry(m)], cats, "USD", "2026-10");
    expect(out).toHaveLength(1);
    expect(out[0]).toMatchObject({ id: "x1", categoryName: "Food", currency: "USD", amountMinor: 1250 });
    expect(overlayExpenses([], [entry(m)], cats, "USD", "2026-09")).toHaveLength(0);
  });
});

describe("syncStateOf / completionOf / describeMutation", () => {
  it("failed wins over pending; null when untouched", () => {
    const entries = [
      entry({ kind: "card.complete", cardId: "c1", completed: true }, "pending"),
      entry({ kind: "card.move", cardId: "c1", toColumnId: "done", position: "a0" }, "failed"),
      entry({ kind: "card.create", id: "c2", target: { columnId: "todo" }, title: "x" }, "applied"),
      entry({ kind: "checklist.set", itemId: "i1", cardId: "c3", isDone: true }),
    ];
    expect(syncStateOf("c1", entries)).toBe("failed");
    expect(syncStateOf("c2", entries)).toBe("pending");
    expect(syncStateOf("i1", entries)).toBe("pending");
    expect(syncStateOf("c3", entries)).toBeNull();
    expect(syncStateOf("zzz", entries)).toBeNull();
  });

  it("cardPatchOf folds queued updates in id order (later fields win, untouched ones absent)", () => {
    const entries = [
      entry({ kind: "card.update", cardId: "c1", patch: { title: "A", priority: 1 } }),
      entry({ kind: "card.update", cardId: "c1", patch: { title: "B" } }),
      entry({ kind: "card.update", cardId: "c2", patch: { title: "other" } }),
    ];
    expect(cardPatchOf("c1", [entries[1], entries[0], entries[2]])).toEqual({ title: "B", priority: 1 });
    expect(cardPatchOf("c9", entries)).toEqual({});
  });

  it("completionOf takes the latest complete entry", () => {
    const entries = [
      entry({ kind: "card.complete", cardId: "c1", completed: true }),
      entry({ kind: "card.complete", cardId: "c1", completed: false }),
    ];
    expect(completionOf("c1", entries)).toBe(false);
    expect(completionOf("c1", [entries[0]])).toBe(true);
    expect(completionOf("c9", entries)).toBeNull();
  });

  it("describeMutation gives a human label per kind", () => {
    expect(describeMutation({ kind: "card.create", id: "x", target: { columnId: "c" }, title: "Milk" })).toBe("Add “Milk”");
    expect(describeMutation({ kind: "card.complete", cardId: "x", completed: true })).toBe("Complete a card");
    expect(describeMutation({ kind: "learning.setStatus", itemId: "x", status: "learned" })).toBe("Mark as learned");
  });
});
