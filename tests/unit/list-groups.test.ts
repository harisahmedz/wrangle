import { describe, expect, it } from "vitest";
import { buildListGroups, reorderEnabledFor } from "@/lib/kanban/list-groups";
import type { BoardCardData, BoardColumnData } from "@/lib/kanban/types";

function col(id: string, name: string, position: string, isDone = false): BoardColumnData {
  return { id, name, position, color: null, wipLimit: null, isDone, isCollapsed: false };
}

function card(partial: Partial<BoardCardData> & { id: string; columnId: string }): BoardCardData {
  return {
    title: "Untitled",
    hasDescription: false,
    dueAt: null,
    completedAt: null,
    position: "a0",
    coverColor: null,
    labelColors: [],
    labelIds: [],
    assigneeIds: [],
    impact: null,
    effort: null,
    ...partial,
  };
}

const columns = [col("todo", "To do", "a0"), col("done", "Done", "a1", true)];

describe("buildListGroups — groupBy: column", () => {
  it("creates one group per column, in column order, with only its own cards", () => {
    const cards = [
      card({ id: "1", columnId: "todo", position: "a0" }),
      card({ id: "2", columnId: "done", position: "a0" }),
      card({ id: "3", columnId: "todo", position: "a1" }),
    ];
    const groups = buildListGroups(cards, columns, "column", "manual", "UTC");
    expect(groups.map((g) => g.id)).toEqual(["todo", "done"]);
    expect(groups[0].cards.map((c) => c.id)).toEqual(["1", "3"]);
    expect(groups[1].cards.map((c) => c.id)).toEqual(["2"]);
    expect(groups[0].columnId).toBe("todo");
  });

  it("sorts manually by fractional position", () => {
    const cards = [
      card({ id: "a", columnId: "todo", position: "a2" }),
      card({ id: "b", columnId: "todo", position: "a0" }),
      card({ id: "c", columnId: "todo", position: "a1" }),
    ];
    const groups = buildListGroups(cards, columns, "column", "manual", "UTC");
    expect(groups[0].cards.map((c) => c.id)).toEqual(["b", "c", "a"]);
  });
});

describe("buildListGroups — groupBy: due", () => {
  const now = new Date("2026-06-15T12:00:00Z");

  it("buckets into overdue/today/upcoming/none by date only", () => {
    const cards = [
      card({ id: "overdue", columnId: "todo", dueAt: "2026-06-10T00:00:00Z" }),
      card({ id: "today", columnId: "todo", dueAt: "2026-06-15T18:00:00Z" }),
      card({ id: "upcoming", columnId: "todo", dueAt: "2026-06-20T00:00:00Z" }),
      card({ id: "none", columnId: "todo", dueAt: null }),
    ];
    const groups = buildListGroups(cards, columns, "due", "manual", "UTC", now);
    const byId = Object.fromEntries(groups.map((g) => [g.id, g.cards.map((c) => c.id)]));
    expect(byId.overdue).toEqual(["overdue"]);
    expect(byId.today).toEqual(["today"]);
    expect(byId.upcoming).toEqual(["upcoming"]);
    expect(byId.none).toEqual(["none"]);
  });

  it("a completed card keeps the bucket its due date puts it in", () => {
    const cards = [
      card({ id: "x", columnId: "todo", dueAt: "2026-06-01T00:00:00Z", completedAt: "2026-06-02T00:00:00Z" }),
    ];
    const groups = buildListGroups(cards, columns, "due", "manual", "UTC", now);
    expect(groups.find((g) => g.id === "overdue")?.cards.map((c) => c.id)).toEqual(["x"]);
  });

  it("every due-mode group targets the first non-done column for inline add", () => {
    const groups = buildListGroups([], columns, "due", "manual", "UTC", now);
    expect(groups.every((g) => g.columnId === "todo")).toBe(true);
  });

  it("a non-UTC timezone changes which bucket a borderline due date lands in (SSR/CSR must agree on the user's zone, not UTC)", () => {
    // `now` is 2026-06-15T23:00Z — still June 15 in UTC, but already
    // 11am June 16 in Pacific/Auckland (UTC+12 in June, NZ winter/standard
    // time). A card due at 05:00Z the same UTC date is still "today" from
    // UTC's point of view, but already in the past relative to Auckland's
    // "today" (which starts at 2026-06-15T12:00Z).
    const now = new Date("2026-06-15T23:00:00Z");
    const dueAt = "2026-06-15T05:00:00Z";
    const dueCard = card({ id: "x", columnId: "todo", dueAt });

    const utcGroups = buildListGroups([dueCard], columns, "due", "manual", "UTC", now);
    expect(utcGroups.find((g) => g.id === "today")?.cards.map((c) => c.id)).toEqual(["x"]);
    expect(utcGroups.find((g) => g.id === "overdue")?.cards).toEqual([]);

    const aucklandGroups = buildListGroups([dueCard], columns, "due", "manual", "Pacific/Auckland", now);
    expect(aucklandGroups.find((g) => g.id === "overdue")?.cards.map((c) => c.id)).toEqual(["x"]);
    expect(aucklandGroups.find((g) => g.id === "today")?.cards).toEqual([]);
  });
});

describe("buildListGroups — groupBy: none", () => {
  it("returns a single group with every visible card, sorted", () => {
    const cards = [
      card({ id: "1", columnId: "todo", position: "a1" }),
      card({ id: "2", columnId: "done", position: "a0" }),
    ];
    const groups = buildListGroups(cards, columns, "none", "manual", "UTC");
    expect(groups).toHaveLength(1);
    expect(groups[0].cards.map((c) => c.id)).toEqual(["2", "1"]);
  });
});

describe("buildListGroups — sort: due", () => {
  it("orders by due date within a group, nulls last", () => {
    const cards = [
      card({ id: "a", columnId: "todo", dueAt: null, position: "a0" }),
      card({ id: "b", columnId: "todo", dueAt: "2026-06-20T00:00:00Z", position: "a1" }),
      card({ id: "c", columnId: "todo", dueAt: "2026-06-10T00:00:00Z", position: "a2" }),
    ];
    const groups = buildListGroups(cards, columns, "column", "due", "UTC");
    expect(groups[0].cards.map((c) => c.id)).toEqual(["c", "b", "a"]);
  });
});

describe("reorderEnabledFor", () => {
  it("is only enabled for column grouping + manual sort", () => {
    expect(reorderEnabledFor("column", "manual")).toBe(true);
    expect(reorderEnabledFor("column", "due")).toBe(false);
    expect(reorderEnabledFor("due", "manual")).toBe(false);
    expect(reorderEnabledFor("none", "manual")).toBe(false);
  });
});
