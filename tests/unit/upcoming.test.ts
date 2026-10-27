import { describe, expect, it } from "vitest";
import { localDateKey, shiftDateKey } from "@/lib/dates";
import {
  dayHeaderLabel,
  groupUpcomingRows,
  monthLabel,
  resolveFromParam,
  weekStripDays,
} from "@/lib/kanban/upcoming";
import type { DueCardRow } from "@/lib/kanban/due-cards";

function row(id: string, dueAt: string): DueCardRow {
  return {
    id,
    title: id,
    projectId: "p1",
    projectName: "My Space",
    boardKind: "todo",
    dueAt: new Date(dueAt),
    overdue: false,
    role: "member",
  };
}

describe("resolveFromParam", () => {
  const today = "2026-10-27";

  it("accepts a valid, in-range date", () => {
    expect(resolveFromParam("2026-11-03", today)).toBe("2026-11-03");
  });

  it("falls back to today for malformed input", () => {
    expect(resolveFromParam(undefined, today)).toBe(today);
    expect(resolveFromParam("not-a-date", today)).toBe(today);
    expect(resolveFromParam("2026-11-3", today)).toBe(today);
  });

  it("falls back to today for a date that doesn't exist", () => {
    expect(resolveFromParam("2026-02-30", today)).toBe(today);
  });

  it("clamps absurdly far dates to +/-1 year", () => {
    expect(resolveFromParam("2099-01-01", today)).toBe(
      shiftDateKey(today, 365),
    );
    expect(resolveFromParam("1900-01-01", today)).toBe(
      shiftDateKey(today, -365),
    );
  });
});

describe("dayHeaderLabel / monthLabel", () => {
  it("labels today and tomorrow specially", () => {
    expect(dayHeaderLabel("2026-10-27", "2026-10-27")).toBe("Today");
    expect(dayHeaderLabel("2026-10-28", "2026-10-27")).toBe("Tomorrow");
  });

  it("formats other days as 'Weekday Day Month'", () => {
    expect(dayHeaderLabel("2026-10-29", "2026-10-27")).toBe("Thu 29 Oct");
  });

  it("formats the month subtitle", () => {
    expect(monthLabel("2026-10-27")).toBe("October 2026");
  });
});

describe("localDateKey (timezone where UTC and local dates differ)", () => {
  it("resolves the local day in a zone with a large positive offset ahead of UTC", () => {
    // 2026-01-15T20:00:00Z is already 2026-01-16 09:00 in Auckland (NZDT, UTC+13 in January).
    expect(localDateKey(new Date("2026-01-15T20:00:00Z"), "Pacific/Auckland")).toBe(
      "2026-01-16",
    );
    // Same instant, UTC itself is still the 15th.
    expect(localDateKey(new Date("2026-01-15T20:00:00Z"), "UTC")).toBe(
      "2026-01-15",
    );
  });
});

describe("groupUpcomingRows (DST boundary)", () => {
  // US spring-forward: clocks jump from 2:00am EST to 3:00am EDT on 2026-03-08.
  it("buckets cards correctly across the DST transition day", () => {
    const rows = [
      row("before-midnight", "2026-03-08T04:00:00Z"), // 2026-03-07 23:00 EST
      row("after-midnight", "2026-03-08T06:30:00Z"), // 2026-03-08 01:30 EST
      row("after-transition", "2026-03-09T03:30:00Z"), // 2026-03-08 23:30 EDT
      row("next-day", "2026-03-09T12:00:00Z"), // 2026-03-09 08:00 EDT
    ];

    const { days } = groupUpcomingRows(rows, "America/New_York", {
      fromKey: "2026-03-07",
      todayKey: "2026-03-07",
      numDays: 3,
      includeOverdue: false,
    });

    const byKey = Object.fromEntries(days.map((g) => [g.key, g.rows.map((r) => r.id)]));
    expect(byKey["2026-03-07"]).toEqual(["before-midnight"]);
    expect(byKey["2026-03-08"]).toEqual(["after-midnight", "after-transition"]);
    expect(byKey["2026-03-09"]).toEqual(["next-day"]);
  });

  it("splits out an overdue pile only when asked", () => {
    const rows = [row("old", "2026-03-05T12:00:00Z"), row("today", "2026-03-07T12:00:00Z")];
    const { overdue, days } = groupUpcomingRows(rows, "America/New_York", {
      fromKey: "2026-03-07",
      todayKey: "2026-03-07",
      numDays: 1,
      includeOverdue: true,
    });
    expect(overdue.map((r) => r.id)).toEqual(["old"]);
    expect(days.find((g) => g.key === "2026-03-07")?.rows.map((r) => r.id)).toEqual([
      "today",
    ]);
  });
});

describe("weekStripDays", () => {
  it("builds 7 pills starting at fromKey, flagging today and card days", () => {
    const pills = weekStripDays("2026-10-27", "2026-10-27", new Set(["2026-10-29"]));
    expect(pills).toHaveLength(7);
    expect(pills[0]).toMatchObject({ key: "2026-10-27", isToday: true, hasCards: false });
    expect(pills[2]).toMatchObject({ key: "2026-10-29", hasCards: true });
    expect(pills.at(-1)?.key).toBe("2026-11-02");
  });
});
