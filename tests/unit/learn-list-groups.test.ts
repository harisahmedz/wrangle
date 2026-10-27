import { describe, expect, it } from "vitest";
import {
  buildLearnListGroups,
  formatTargetDate,
  learnRowMeta,
} from "@/lib/learning/list-groups";
import type { LearnItemRow } from "@/components/learn/types";

function item(overrides: Partial<LearnItemRow>): LearnItemRow {
  return {
    id: "1",
    title: "Item",
    type: "course",
    status: "want",
    sourceUrl: null,
    whyNote: null,
    targetDate: null,
    progressPct: 0,
    hoursLogged: "0",
    ...overrides,
  };
}

describe("buildLearnListGroups", () => {
  it("returns groups in want/learning/learned order with counts", () => {
    const items = [
      item({ id: "a", status: "learned" }),
      item({ id: "b", status: "want" }),
      item({ id: "c", status: "learning" }),
      item({ id: "d", status: "want" }),
    ];
    const groups = buildLearnListGroups(items);
    expect(groups.map((g) => g.status)).toEqual(["want", "learning", "learned"]);
    expect(groups[0].items.map((i) => i.id)).toEqual(["b", "d"]);
    expect(groups[1].items.map((i) => i.id)).toEqual(["c"]);
    expect(groups[2].items.map((i) => i.id)).toEqual(["a"]);
  });

  it("keeps each group's input order (server position order)", () => {
    const items = [item({ id: "z", status: "want" }), item({ id: "a", status: "want" })];
    const groups = buildLearnListGroups(items);
    expect(groups[0].items.map((i) => i.id)).toEqual(["z", "a"]);
  });

  it("returns an empty array for a status with no items", () => {
    const groups = buildLearnListGroups([]);
    expect(groups.every((g) => g.items.length === 0)).toBe(true);
    expect(groups).toHaveLength(3);
  });
});

describe("formatTargetDate", () => {
  it("formats a YYYY-MM-DD date as a short month/day, UTC-pinned", () => {
    expect(formatTargetDate("2026-10-30")).toBe("Oct 30");
  });
});

describe("learnRowMeta", () => {
  it("shows only type for a 'want' item with no target date", () => {
    expect(learnRowMeta(item({ type: "book", status: "want" }))).toBe("📖 Book");
  });

  it("adds progress once the item has started", () => {
    expect(learnRowMeta(item({ type: "course", status: "learning", progressPct: 45 }))).toBe(
      "🎓 Course · 45%",
    );
  });

  it("hides progress once learned (marking done never bumps progressPct)", () => {
    expect(learnRowMeta(item({ type: "course", status: "learned", progressPct: 0 }))).toBe(
      "🎓 Course",
    );
  });

  it("appends the target date when present, after progress", () => {
    expect(
      learnRowMeta(
        item({ type: "course", status: "learning", progressPct: 45, targetDate: "2026-10-30" }),
      ),
    ).toBe("🎓 Course · 45% · Target Oct 30");
  });

  it("appends the target date for a 'want' item without progress", () => {
    expect(learnRowMeta(item({ type: "skill", status: "want", targetDate: "2026-12-01" }))).toBe(
      "🛠️ Skill · Target Dec 1",
    );
  });

  it("falls back to Other for an unrecognized type", () => {
    expect(learnRowMeta(item({ type: "mystery" }))).toBe("📦 Other");
  });
});
