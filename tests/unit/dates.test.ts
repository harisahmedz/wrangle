import { describe, expect, it } from "vitest";
import { localDayWindow, localDateParts } from "@/lib/dates";
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
