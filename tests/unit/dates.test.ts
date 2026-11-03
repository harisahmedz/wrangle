import { describe, expect, it } from "vitest";
import {
  dayWindowForDate,
  instantAtLocalTime,
  localDayWindow,
  localDateParts,
  localTimeOfDay,
} from "@/lib/dates";
import { scoreOf } from "@/lib/kanban/score";

describe("scoreOf (G4-01)", () => {
  it("scores impact*2 - effort, nulls yield null", () => {
    expect(scoreOf(5, 1)).toBe(9);
    expect(scoreOf(3, 3)).toBe(3);
    expect(scoreOf(1, 5)).toBe(-3);
    expect(scoreOf(null, 2)).toBeNull();
    expect(scoreOf(4, null)).toBeNull();
  });
});

describe("localDayWindow", () => {
  it("computes the user's calendar day in a positive-offset timezone", () => {
    const utcInstant = Date.UTC(2026, 7, 23, 20, 0, 0);
    const parts = localDateParts(new Date(utcInstant), "Asia/Karachi");
    expect(parts).toEqual({ y: 2026, m: 8, d: 24 });

    const w = localDayWindow(new Date(utcInstant), "Asia/Karachi");
    expect(w.start.toISOString()).toBe("2026-08-23T19:00:00.000Z");
    expect(w.end.getTime() - w.start.getTime()).toBe(86_400_000);
  });

  it("offsetDays shifts whole local days", () => {
    const now = new Date(Date.UTC(2026, 7, 23, 12, 0, 0));
    const tomorrow = localDayWindow(now, "UTC", 1);
    expect(tomorrow.start.toISOString()).toBe("2026-08-24T00:00:00.000Z");
  });
});

describe("dayWindowForDate (DST boundaries)", () => {
  it("is 23 hours long on the US spring-forward day (2026-03-08, EST -> EDT)", () => {
    const w = dayWindowForDate(2026, 3, 8, "America/New_York");
    // Local midnight is still EST (UTC-5); next local midnight is already EDT (UTC-4).
    expect(w.start.toISOString()).toBe("2026-03-08T05:00:00.000Z");
    expect(w.end.toISOString()).toBe("2026-03-09T04:00:00.000Z");
    expect(w.end.getTime() - w.start.getTime()).toBe(23 * 3_600_000);
  });

  it("is 25 hours long on the US fall-back day (2026-11-01, EDT -> EST)", () => {
    const w = dayWindowForDate(2026, 11, 1, "America/New_York");
    // Local midnight is still EDT (UTC-4); next local midnight is already EST (UTC-5).
    expect(w.start.toISOString()).toBe("2026-11-01T04:00:00.000Z");
    expect(w.end.toISOString()).toBe("2026-11-02T05:00:00.000Z");
    expect(w.end.getTime() - w.start.getTime()).toBe(25 * 3_600_000);
  });
});

describe("localTimeOfDay / instantAtLocalTime (V3 S6, Plan my week)", () => {
  it("round-trips a wall-clock time across the US fall-back day", () => {
    // 14:30 PDT on Oct 30 2026 is 21:30Z; the same wall time on Nov 5 (PST) is 22:30Z.
    const before = new Date("2026-10-30T21:30:00.000Z");
    expect(localTimeOfDay(before, "America/Los_Angeles")).toEqual({ h: 14, mi: 30 });
    expect(instantAtLocalTime("2026-11-05", 14, 30, "America/Los_Angeles").toISOString()).toBe(
      "2026-11-05T22:30:00.000Z",
    );
  });

  it("midnight matches dayWindowForDate's start, and noon is twelve hours later on a normal day", () => {
    expect(instantAtLocalTime("2026-11-05", 0, 0, "Asia/Karachi")).toEqual(
      dayWindowForDate(2026, 11, 5, "Asia/Karachi").start,
    );
    expect(instantAtLocalTime("2026-11-05", 12, 0, "Asia/Karachi").toISOString()).toBe("2026-11-05T07:00:00.000Z");
    expect(instantAtLocalTime("2026-11-05", 12, 0, "UTC").toISOString()).toBe("2026-11-05T12:00:00.000Z");
  });

  it("reads 00:xx (not 24:xx) just after local midnight", () => {
    expect(localTimeOfDay(new Date("2026-11-05T00:05:00.000Z"), "UTC")).toEqual({ h: 0, mi: 5 });
  });
});
