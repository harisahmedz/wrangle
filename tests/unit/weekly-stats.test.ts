import { describe, expect, it } from "vitest";
import {
  computeWeekReview,
  scoreOf,
  weekLabel,
  weekWindow,
  type WeeklyExpenseRow,
} from "@/lib/weekly/stats";

const NOW = new Date("2026-08-26T12:00:00Z"); // a Wednesday
const UTC = "UTC";

describe("weekWindow (Mon–Sun, tz-aware)", () => {
  it("returns the Monday–Sunday window containing now", () => {
    const win = weekWindow(NOW, UTC);
    expect(win.start.toISOString()).toBe("2026-08-24T00:00:00.000Z");
    expect(win.end.toISOString()).toBe("2026-08-31T00:00:00.000Z");
  });

  it("wraps weekends: Sunday belongs to the week that started the Monday before", () => {
    const sunday = new Date("2026-08-30T10:00:00Z");
    const win = weekWindow(sunday, UTC);
    expect(win.start.toISOString()).toBe("2026-08-24T00:00:00.000Z");
  });

  it("offset -1 gives last week", () => {
    const win = weekWindow(NOW, UTC, -1);
    expect(weekLabel(win)).toBe("Aug 17 – Aug 23");
  });

  it("handles DST: spring-forward week in New York still spans exactly 7 local days", () => {
    // US DST starts 2026-03-08; Wednesday Mar 11 local
    const now = new Date("2026-03-11T17:00:00Z");
    const win = weekWindow(now, "America/New_York");
    expect(win.start.toISOString()).toBe("2026-03-09T04:00:00.000Z"); // Mon 00:00 local (EDT after spring-forward)
    expect(+win.end - +win.start).toBe(7 * 86_400_000);
  });

  it("labels the current week correctly", () => {
    expect(weekLabel(weekWindow(NOW, UTC))).toBe("Aug 24 – Aug 30");
  });
});

function expense(
  amountMinor: number,
  currency = "USD",
  categoryName = "Food",
): WeeklyExpenseRow {
  return { amountMinor, currency, categoryName, categoryEmoji: "🍜" };
}

function baseInputs() {
  return {
    now: NOW,
    timeZone: UTC,
    offsetWeeks: 0,
    shipped: [],
    slipped: [],
    sessions: [],
    expenses: [] as WeeklyExpenseRow[],
    lastWeekExpenses: [] as WeeklyExpenseRow[],
    ideas: [],
  };
}

describe("computeWeekReview", () => {
  it("groups shipped cards by project with counts", () => {
    const r = computeWeekReview({
      ...baseInputs(),
      shipped: [
        { id: "c1", title: "A", projectName: "Blog", projectEmoji: "✍️" },
        { id: "c2", title: "B", projectName: "Blog", projectEmoji: "✍️" },
        { id: "c3", title: "C", projectName: "Work", projectEmoji: null },
      ],
    });
    expect(r.shippedCount).toBe(3);
    expect(r.shippedByProject).toHaveLength(2);
    const blog = r.shippedByProject.find((g) => g.name === "Blog")!;
    expect(blog.cards.map((c) => c.id)).toEqual(["c1", "c2"]);
    expect(blog.emoji).toBe("✍️");
  });

  it("sorts slipped cards by due date ascending", () => {
    const r = computeWeekReview({
      ...baseInputs(),
      slipped: [
        {
          id: "later",
          title: "Later",
          projectName: "P",
          dueAt: new Date("2026-08-27T09:00:00Z"),
          isAllDay: false,
        },
        {
          id: "earlier",
          title: "Earlier",
          projectName: "P",
          dueAt: new Date("2026-08-25T09:00:00Z"),
          isAllDay: false,
        },
      ],
    });
    expect(r.slipped.map((c) => c.id)).toEqual(["earlier", "later"]);
  });

  it("totals learning minutes and picks top item with alphabetical tie-break", () => {
    const r = computeWeekReview({
      ...baseInputs(),
      sessions: [
        { minutes: 40, itemTitle: "Postgres course" },
        { minutes: 20, itemTitle: "Rust book" },
        { minutes: 25, itemTitle: "Postgres course" },
        { minutes: 65, itemTitle: "Algorithms" },
      ],
    });
    expect(r.learningMinutesTotal).toBe(150);
    expect(r.sessionCount).toBe(4);
    expect(r.topLearningItem).toEqual({ title: "Algorithms", minutes: 65 });
  });

  it("ties on learning minutes break alphabetically", () => {
    const r = computeWeekReview({
      ...baseInputs(),
      sessions: [
        { minutes: 30, itemTitle: "Zeta" },
        { minutes: 30, itemTitle: "Alpha" },
      ],
    });
    expect(r.topLearningItem!.title).toBe("Alpha");
  });

  it("picks dominant currency and sums last week only for that currency", () => {
    const r = computeWeekReview({
      ...baseInputs(),
      expenses: [
        expense(1000),
        expense(500),
        expense(100, "EUR", "Transport"),
      ],
      lastWeekExpenses: [expense(250), expense(50, "EUR")],
    });
    expect(r.dominantCurrency).toBe("USD");
    expect(r.spentMinorTotal).toBe(1500);
    expect(r.lastWeekSpentMinor).toBe(250);
    expect(r.otherCurrencyTotals).toEqual([
      { currency: "EUR", minor: 100 },
    ]);
  });

  it("reports zero spend when nothing was logged", () => {
    const r = computeWeekReview(baseInputs());
    expect(r.dominantCurrency).toBeNull();
    expect(r.spentMinorTotal).toBe(0);
    expect(r.lastWeekSpentMinor).toBe(0);
    expect(r.topCategory).toBeNull();
  });

  it("picks top category within the dominant currency only, ties break alphabetically", () => {
    const r = computeWeekReview({
      ...baseInputs(),
      expenses: [
        expense(1000, "USD", "Food"),
        expense(2500, "USD", "Transport"),
        expense(1000, "USD", "Food"),
        expense(1, "JPY", "Food"), // foreign currency must not win top category
      ],
    });
    expect(r.dominantCurrency).toBe("USD");
    expect(r.topCategory).toEqual({
      name: "Transport",
      emoji: "🍜",
      minor: 2500,
    });
  });

  it("top idea is the highest-scoring scored idea (impact*2 − effort)", () => {
    const r = computeWeekReview({
      ...baseInputs(),
      ideas: [
        { id: "i1", title: "Low", impact: 1, effort: 5 },
        { id: "i2", title: "High", impact: 5, effort: 1 },
        { id: "i3", title: "Unscored", impact: null, effort: null },
      ],
    });
    expect(r.ideasCaptured).toBe(3);
    expect(r.topIdea).toEqual({ id: "i2", title: "High", score: 9 });
  });

  it("flags whether the reviewed week contains today", () => {
    const current = computeWeekReview(baseInputs());
    expect(current.containsToday).toBe(true);

    const past = computeWeekReview({ ...baseInputs(), offsetWeeks: -1 });
    expect(past.containsToday).toBe(false);
  });
});

describe("scoreOf (G4-01)", () => {
  it("computes impact*2 − effort and tolerates nulls", () => {
    expect(scoreOf(3, 2)).toBe(4);
    expect(scoreOf(null, 2)).toBeNull();
    expect(scoreOf(3, null)).toBeNull();
  });
});
