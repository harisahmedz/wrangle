import { describe, expect, it } from "vitest";
import {
  currentMonthParts,
  daysInMonth,
  formatYearMonth,
  isAfterMonth,
  localDateStrings,
  monthWindow,
  parseMonthKey,
  shiftMonth,
} from "@/lib/wrapped/month";
import {
  computeStats,
  pickPlotTwist,
} from "@/lib/wrapped/stats";
import { pickArchetype } from "@/lib/wrapped/archetype";
import type { StatInputs, WrappedStats } from "@/lib/wrapped/types";

const AUG_2026 = { timeZone: "UTC", year: 2026, monthIndex: 7 };

function emptyInputs(): StatInputs {
  return {
    ...AUG_2026,
    completedCards: [],
    ideas: [],
    sessions: [],
    expenses: [],
    closedReviews: [],
    allTime: { loopsClosed: 0, minutesLearned: 0, sinceDate: null },
  };
}

function baseStats(overrides: Partial<WrappedStats>): WrappedStats {
  return {
    monthLabel: "August 2026",
    shippedCount: 0,
    topProject: null,
    completedByWeekday: [0, 0, 0, 0, 0, 0, 0],
    ideasCaptured: 0,
    learningMinutesTotal: 0,
    topLearningItem: null,
    learningDaysCount: 0,
    dominantCurrency: null,
    spentMinorTotal: 0,
    otherCurrencyTotals: [],
    topCategory: null,
    expenseDaysCount: 0,
    productivityPerWeek: [0, 0, 0, 0, 0],
    spendPerWeek: [0, 0, 0, 0, 0],
    activeDays: [],
    daysInMonth: 28,
    plotTwist: null,
    allTime: { loopsClosed: 0, minutesLearned: 0, sinceDate: null },
    ...overrides,
  };
}

describe("monthWindow", () => {
  it("computes an exclusive month window in UTC", () => {
    const w = monthWindow(new Date(), "UTC", 2026, 7);
    expect(w.start.toISOString()).toBe("2026-08-01T00:00:00.000Z");
    expect(w.end.toISOString()).toBe("2026-09-01T00:00:00.000Z");
  });

  it("computes the window in a positive-offset timezone", () => {
    const w = monthWindow(new Date(), "Asia/Karachi", 2026, 7);
    expect(w.start.toISOString()).toBe("2026-07-31T19:00:00.000Z");
    expect(w.end.toISOString()).toBe("2026-08-31T19:00:00.000Z");
  });

  it("handles negative offsets with DST transitions", () => {
    const w = monthWindow(new Date(), "America/New_York", 2026, 2);
    expect(w.start.toISOString()).toBe("2026-03-01T05:00:00.000Z");
    expect(w.end.toISOString()).toBe("2026-04-01T04:00:00.000Z");
  });
});

describe("localDateStrings", () => {
  it("lists every local date between bounds", () => {
    const w = monthWindow(new Date(), "UTC", 2026, 7);
    const days = localDateStrings(w.start, w.end, "UTC");
    expect(days).toHaveLength(31);
    expect(days[0]).toBe("2026-08-01");
    expect(days[days.length - 1]).toBe("2026-08-31");
  });

  it("survives spring-forward and fall-back in the window", () => {
    const mar = monthWindow(new Date(), "America/New_York", 2026, 2);
    expect(localDateStrings(mar.start, mar.end, "America/New_York")).toHaveLength(31);
    const oct = monthWindow(new Date(), "America/New_York", 2026, 9);
    const octDays = localDateStrings(oct.start, oct.end, "America/New_York");
    expect(octDays).toHaveLength(31);
    expect(octDays[octDays.length - 1]).toBe("2026-10-31");
  });
});

describe("month helpers", () => {
  it("shifts months across year boundaries", () => {
    expect(shiftMonth(2026, 11, 1)).toEqual({ year: 2027, monthIndex: 0 });
    expect(shiftMonth(2026, 0, -1)).toEqual({ year: 2025, monthIndex: 11 });
  });

  it("formats and parses YYYY-MM keys", () => {
    expect(formatYearMonth(2026, 7)).toBe("2026-08");
    expect(parseMonthKey("2026-08")).toEqual({ year: 2026, monthIndex: 7 });
    expect(parseMonthKey("2026-13")).toBeNull();
    expect(parseMonthKey("nope")).toBeNull();
  });

  it("compares and clamps months", () => {
    expect(isAfterMonth({ year: 2026, monthIndex: 8 }, { year: 2026, monthIndex: 7 })).toBe(true);
    expect(isAfterMonth({ year: 2026, monthIndex: 7 }, { year: 2027, monthIndex: 0 })).toBe(false);
    expect(currentMonthParts(new Date(Date.UTC(2026, 7, 31, 23)), "Asia/Karachi")).toEqual({
      year: 2026,
      monthIndex: 8,
    });
  });

  it("counts calendar days", () => {
    expect(daysInMonth(2026, 7)).toBe(31);
    expect(daysInMonth(2028, 1)).toBe(29);
  });
});

describe("computeStats", () => {
  it("aggregates signals into active days, buckets, and tops", () => {
    const stats = computeStats({
      ...emptyInputs(),
      completedCards: [
        {
          id: "c1",
          title: "a",
          projectName: "Zeta",
          projectEmoji: "z",
          completedAt: new Date(Date.UTC(2026, 7, 4, 12)),
        },
        {
          id: "c2",
          title: "b",
          projectName: "Apollo",
          projectEmoji: "a",
          completedAt: new Date(Date.UTC(2026, 7, 11, 12)),
        },
        {
          id: "c3",
          title: "c",
          projectName: "Apollo",
          projectEmoji: "a",
          completedAt: new Date(Date.UTC(2026, 7, 15, 12)),
        },
      ],
      ideas: [{ id: "i1", title: "spark" }],
      sessions: [
        { minutes: 90, itemTitle: "Rust book", happenedOn: "2026-08-10" },
        { minutes: 30, itemTitle: "Algorithms", happenedOn: "2026-08-10" },
      ],
      expenses: [
        {
          amountMinor: 5000,
          currency: "USD",
          categoryName: "Food",
          categoryEmoji: "🍔",
          spentOn: "2026-08-02",
        },
        {
          amountMinor: 2000,
          currency: "USD",
          categoryName: "Food",
          categoryEmoji: "🍔",
          spentOn: "2026-08-20",
        },
        {
          amountMinor: 1000,
          currency: "EUR",
          categoryName: "Fun",
          categoryEmoji: "🎉",
          spentOn: "2026-08-21",
        },
      ],
      closedReviews: [{ date: "2026-08-05" }],
      allTime: { loopsClosed: 41, minutesLearned: 900, sinceDate: "2026-03-14" },
    });

    expect(stats.monthLabel).toBe("August 2026");
    expect(stats.shippedCount).toBe(3);
    expect(stats.topProject).toEqual({ name: "Apollo", count: 2 });
    expect(stats.activeDays).toEqual([
      "2026-08-02",
      "2026-08-04",
      "2026-08-05",
      "2026-08-10",
      "2026-08-11",
      "2026-08-15",
      "2026-08-20",
      "2026-08-21",
    ]);
    expect(stats.completedByWeekday[2]).toBe(2);
    expect(stats.completedByWeekday[6]).toBe(1);
    expect(stats.learningMinutesTotal).toBe(120);
    expect(stats.topLearningItem).toEqual({ title: "Rust book", minutes: 90 });
    expect(stats.learningDaysCount).toBe(1);
    expect(stats.dominantCurrency).toBe("USD");
    expect(stats.spentMinorTotal).toBe(7000);
    expect(stats.otherCurrencyTotals).toEqual([{ currency: "EUR", minor: 1000 }]);
    expect(stats.topCategory).toEqual({ name: "Food", emoji: "🍔", minor: 7000 });
    expect(stats.expenseDaysCount).toBe(3);
    expect(stats.ideasCaptured).toBe(1);
    expect(stats.productivityPerWeek).toHaveLength(5);
    expect(stats.spendPerWeek[0]).toBe(5000);
    expect(stats.allTime).toEqual({
      loopsClosed: 41,
      minutesLearned: 900,
      sinceDate: "2026-03-14",
    });
  });

  it("breaks ties alphabetically for deterministic tops", () => {
    const stats = computeStats({
      ...emptyInputs(),
      completedCards: [
        {
          id: "1",
          title: "x",
          projectName: "Zebra",
          projectEmoji: null,
          completedAt: new Date(Date.UTC(2026, 7, 2, 12)),
        },
        {
          id: "2",
          title: "y",
          projectName: "Alpha",
          projectEmoji: null,
          completedAt: new Date(Date.UTC(2026, 7, 3, 12)),
        },
      ],
    });
    expect(stats.topProject).toEqual({ name: "Alpha", count: 1 });
  });

  it("handles zero expenses without spend twists", () => {
    const stats = computeStats({
      ...emptyInputs(),
      completedCards: [
        {
          id: "1",
          title: "x",
          projectName: "Solo",
          projectEmoji: null,
          completedAt: new Date(Date.UTC(2026, 7, 2, 12)),
        },
      ],
    });
    expect(stats.spentMinorTotal).toBe(0);
    expect(stats.dominantCurrency).toBeNull();
    expect(stats.topCategory).toBeNull();
    expect(stats.plotTwist?.kind).not.toBe("cheapest-week");
    expect(stats.plotTwist?.kind).not.toBe("per-learning-hour");
  });

  it("concentrates weekly buckets when all activity lands in week one", () => {
    const stats = computeStats({
      ...emptyInputs(),
      completedCards: [
        {
          id: "1",
          title: "x",
          projectName: "P",
          projectEmoji: null,
          completedAt: new Date(Date.UTC(2026, 7, 3, 12)),
        },
      ],
      sessions: [
        { minutes: 60, itemTitle: "T", happenedOn: "2026-08-04" },
      ],
    });
    expect(stats.productivityPerWeek[0]).toBeCloseTo(2, 5);
    for (let i = 1; i < 5; i++) {
      expect(stats.productivityPerWeek[i]).toBe(0);
    }
  });
});

describe("pickPlotTwist pick order", () => {
  function withWeekly(
    productivityPerWeek: number[],
    spendPerWeek: number[],
  ): WrappedStats {
    return baseStats({
      productivityPerWeek,
      spendPerWeek,
      dominantCurrency: "USD",
      spentMinorTotal: spendPerWeek.reduce((a, b) => a + b, 0),
      learningMinutesTotal: 600,
      completedByWeekday: [0, 0, 5, 0, 0, 0, 0],
      ideasCaptured: 9,
      shippedCount: 2,
    });
  }

  it("prefers cheapest-week over all later rules", () => {
    const twist = pickPlotTwist(
      withWeekly([5, 1, 0, 0, 0], [1000, 9000, 3000, 0, 0]),
    );
    expect(twist?.kind).toBe("cheapest-week");
    expect(twist?.sentence).toBe(
      "Your cheapest week was your most productive one.",
    );
  });

  it("falls through to usd-per-learning-hour", () => {
    const twist = pickPlotTwist(
      withWeekly([0, 5, 0, 0, 0], [1000, 1000, 0, 0, 0]),
    );
    expect(twist?.kind).toBe("per-learning-hour");
    expect(twist?.sentence).toBe("About $2.00 per learning hour.");
  });

  it("skips cheapest-week when a different week was most productive", () => {
    const twist = pickPlotTwist(
      withWeekly([1, 5, 0, 0, 0], [1000, 3000, 0, 0, 0]),
    );
    expect(twist?.kind).toBe("per-learning-hour");
  });

  it("picks best weekday when spend and hours are absent", () => {
    const stats = baseStats({
      completedByWeekday: [0, 0, 3, 0, 0, 0, 0],
    });
    expect(pickPlotTwist(stats)?.sentence).toBe(
      "Tuesdays were your power day — 3 shipped.",
    );
  });

  it("quips on idea surplus before the spike fallback", () => {
    const stats = baseStats({ ideasCaptured: 5, shippedCount: 2 });
    expect(pickPlotTwist(stats)?.kind).toBe("ideas-ratio");
  });

  it("does not fabricate a spike without per-day data", () => {
    const stats = baseStats({
      activeDays: ["2026-08-14"],
      shippedCount: 2,
      topProject: { name: "P", count: 2 },
    });
    expect(pickPlotTwist(stats)).toBeNull();
  });

  it("returns null when there is nothing to say", () => {
    expect(pickPlotTwist(baseStats({}))).toBeNull();
  });

  it("surfaces the spike through computeStats", () => {
    const stats = computeStats({
      ...emptyInputs(),
      completedCards: [
        {
          id: "1",
          title: "a",
          projectName: "P",
          projectEmoji: null,
          completedAt: new Date(Date.UTC(2026, 7, 14, 12)),
        },
        {
          id: "2",
          title: "b",
          projectName: "P",
          projectEmoji: null,
          completedAt: new Date(Date.UTC(2026, 7, 14, 13)),
        },
      ],
    });
    expect(stats.plotTwist?.kind).toBe("shipping-spike");
    expect(stats.plotTwist?.sentence).toBe(
      "August 14 was your biggest day — 2 cards shipped.",
    );
  });
});

describe("pickArchetype", () => {
  it("is deterministic for identical stats", () => {
    const stats = baseStats({ shippedCount: 24 });
    expect(pickArchetype(stats)).toEqual(pickArchetype(stats));
  });

  it("splits at the builder-scholar boundary", () => {
    const builderScholar = baseStats({
      shippedCount: 20,
      learningMinutesTotal: 480,
      daysInMonth: 28,
    });
    expect(pickArchetype(builderScholar).label).toBe("The Builder-Scholar");

    const belowHours = baseStats({
      shippedCount: 20,
      learningMinutesTotal: 479,
      ideasCaptured: 8,
      daysInMonth: 28,
    });
    expect(pickArchetype(belowHours).label).toBe("The Explorer-Maker");
  });

  it("labels pure builders at five shipped per week", () => {
    const builder = baseStats({ shippedCount: 35, daysInMonth: 49 });
    expect(pickArchetype(builder).label).toBe("The Builder");
  });

  it("separates scholar-dreamer from plain scholar", () => {
    const scholarDreamer = baseStats({
      learningMinutesTotal: 480,
      ideasCaptured: 5,
      shippedCount: 5,
    });
    expect(pickArchetype(scholarDreamer).label).toBe("The Scholar-Dreamer");

    const scholar = baseStats({
      learningMinutesTotal: 480,
      ideasCaptured: 4,
      shippedCount: 5,
    });
    expect(pickArchetype(scholar).label).toBe("The Scholar");
  });

  it("rewards idea surplus with the dreamer", () => {
    const dreamer = baseStats({ ideasCaptured: 3, shippedCount: 1 });
    expect(pickArchetype(dreamer).label).toBe("The Dreamer");

    const shyDreamer = baseStats({ ideasCaptured: 2, shippedCount: 1 });
    expect(pickArchetype(shyDreamer).label).not.toBe("The Dreamer");
  });

  it("keeps the ledger when money dominates quiet months", () => {
    const ledger = baseStats({
      expenseDaysCount: 3,
      activeDays: ["d1", "d2", "d3", "d4", "d5", "d6"],
      spentMinorTotal: 50000,
      dominantCurrency: "USD",
    });
    expect(pickArchetype(ledger).label).toBe("The Ledger-Keeper");

    const sparseLedger = baseStats({
      expenseDaysCount: 3,
      activeDays: ["d1", "d2", "d3", "d4", "d5", "d6", "d7"],
      spentMinorTotal: 50000,
      dominantCurrency: "USD",
    });
    expect(pickArchetype(sparseLedger).label).toBe("The Steady Hand");
  });

  it("defaults to the steady hand", () => {
    expect(pickArchetype(baseStats({})).label).toBe("The Steady Hand");
  });

  it("covers at least eight distinct outcomes", () => {
    const labels = new Set<string>();
    const cases: Partial<WrappedStats>[] = [
      { shippedCount: 20, learningMinutesTotal: 480 },
      { shippedCount: 20, ideasCaptured: 8 },
      { shippedCount: 35 },
      { learningMinutesTotal: 480, ideasCaptured: 6, shippedCount: 5 },
      { learningMinutesTotal: 480 },
      { ideasCaptured: 3, shippedCount: 1 },
      {
        expenseDaysCount: 3,
        activeDays: ["d1", "d2", "d3", "d4", "d5", "d6"],
        spentMinorTotal: 1,
      },
      {},
    ];
    for (const partial of cases) {
      labels.add(pickArchetype(baseStats(partial)).label);
    }
    expect(labels.size).toBeGreaterThanOrEqual(8);
  });
});
