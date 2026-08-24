import { describe, expect, it } from "vitest";
import {
  consistencyStats,
  groupByProject,
  localDateKey,
  shiftDateKey,
} from "@/lib/shutdown/stats";

describe("consistencyStats (G6-04)", () => {
  const today = "2026-08-24";

  it("counts the last 7 days including today and rounds the rate", () => {
    const s = consistencyStats(
      ["2026-08-18", "2026-08-19", "2026-08-20", "2026-08-21", "2026-08-23"],
      today,
    );
    expect(s.closedLast7).toBe(5);
    expect(s.consistencyRatePct).toBe(71);
    expect(s.totalAllTime).toBe(5);
    expect(s.missedYesterday).toBe(false);
    expect(s.showNeverMissTwiceNudge).toBe(false);
  });

  it("never-miss-twice nudge fires only when yesterday and today are both open", () => {
    expect(consistencyStats(["2026-08-22"], today).showNeverMissTwiceNudge).toBe(
      true,
    );
    expect(consistencyStats([], today).showNeverMissTwiceNudge).toBe(true);
    expect(consistencyStats(["2026-08-23"], today).showNeverMissTwiceNudge).toBe(
      false,
    );
    expect(
      consistencyStats(["2026-08-24"], today).showNeverMissTwiceNudge,
    ).toBe(false);
    expect(
      consistencyStats(["2026-08-23", "2026-08-24"], today)
        .showNeverMissTwiceNudge,
    ).toBe(false);
  });

  it("missedYesterday reflects only the previous day", () => {
    expect(consistencyStats([], today).missedYesterday).toBe(true);
    expect(consistencyStats(["2026-08-23"], today).missedYesterday).toBe(false);
    expect(consistencyStats(["2026-08-24"], today).missedYesterday).toBe(true);
  });

  it("window boundary excludes the day before the window starts", () => {
    const s = consistencyStats(["2026-08-17"], today);
    expect(s.closedLast7).toBe(0);
    expect(s.consistencyRatePct).toBe(0);
  });

  it("handles a fully closed week", () => {
    const s = consistencyStats(
      [
        "2026-08-18",
        "2026-08-19",
        "2026-08-20",
        "2026-08-21",
        "2026-08-22",
        "2026-08-23",
        "2026-08-24",
      ],
      today,
    );
    expect(s.closedLast7).toBe(7);
    expect(s.consistencyRatePct).toBe(100);
    expect(s.showNeverMissTwiceNudge).toBe(false);
  });

  it("dedupes the all-time count", () => {
    const s = consistencyStats(
      ["2026-08-01", "2026-08-01", "2026-07-15"],
      today,
    );
    expect(s.totalAllTime).toBe(2);
  });

  it("supports a custom window size", () => {
    const s = consistencyStats(["2026-08-23"], today, { windowDays: 14 });
    expect(s.closedLast7).toBe(1);
    expect(s.consistencyRatePct).toBe(7);
  });
});

describe("shiftDateKey", () => {
  it("rolls across month boundaries", () => {
    expect(shiftDateKey("2026-08-31", 1)).toBe("2026-09-01");
    expect(shiftDateKey("2026-03-01", -1)).toBe("2026-02-28");
    expect(shiftDateKey("2026-01-01", -1)).toBe("2025-12-31");
  });
});

describe("localDateKey", () => {
  it("formats the calendar date in the user's timezone", () => {
    const utcInstant = new Date(Date.UTC(2026, 7, 24, 20, 0, 0));
    expect(localDateKey(utcInstant, "Asia/Karachi")).toBe("2026-08-25");
    expect(localDateKey(utcInstant, "UTC")).toBe("2026-08-24");
  });
});

describe("groupByProject", () => {
  it("groups rows by project preserving first-seen order", () => {
    const rows = [
      { projectName: "B", title: "b2" },
      { projectName: "A", title: "a1" },
      { projectName: "B", title: "b1" },
    ];
    const grouped = groupByProject(rows);
    expect(grouped.map(([name]) => name)).toEqual(["B", "A"]);
    expect(grouped[0][1].map((r) => r.title)).toEqual(["b2", "b1"]);
    expect(grouped[1][1].map((r) => r.title)).toEqual(["a1"]);
  });

  it("returns an empty array for empty input", () => {
    expect(groupByProject([])).toEqual([]);
  });
});
