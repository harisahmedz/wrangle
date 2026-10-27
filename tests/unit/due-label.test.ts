import { describe, expect, it } from "vitest";
import { formatDueLabel } from "@/components/tasks/due-label";

describe("formatDueLabel", () => {
  it("tags overdue dates with the overdue tone", () => {
    const result = formatDueLabel(new Date("2026-01-05T00:00:00Z"), true, "UTC");
    expect(result.tone).toBe("overdue");
  });

  it("tags non-overdue dates with the upcoming tone", () => {
    const result = formatDueLabel(new Date("2026-01-05T00:00:00Z"), false, "UTC");
    expect(result.tone).toBe("upcoming");
  });

  it("formats the label as a short month/day date in the given zone", () => {
    const result = formatDueLabel(new Date("2026-03-09T12:00:00Z"), false, "UTC");
    expect(result.label).toBe("Mar 9");
  });

  it("uses the zoned date, not the UTC date, when they differ", () => {
    // 23:00 UTC on Mar 9 is still Mar 9 in UTC, but already Mar 10 in a
    // zone far enough ahead (Pacific/Auckland is UTC+13 in March).
    const dueAt = new Date("2026-03-09T23:00:00Z");

    expect(formatDueLabel(dueAt, false, "UTC").label).toBe("Mar 9");
    expect(formatDueLabel(dueAt, false, "Pacific/Auckland").label).toBe("Mar 10");
  });

  it("labels Today/Tomorrow/Yesterday relative to the given `now`", () => {
    const now = new Date("2026-10-27T12:00:00Z");

    expect(formatDueLabel(new Date("2026-10-27T15:00:00Z"), false, "UTC", now).label).toBe(
      "Today",
    );
    expect(formatDueLabel(new Date("2026-10-28T01:00:00Z"), false, "UTC", now).label).toBe(
      "Tomorrow",
    );
    expect(formatDueLabel(new Date("2026-10-26T23:00:00Z"), true, "UTC", now).label).toBe(
      "Yesterday",
    );
  });

  it("falls back to the short date outside the Today/Tomorrow/Yesterday window", () => {
    const now = new Date("2026-10-27T12:00:00Z");
    expect(formatDueLabel(new Date("2026-10-29T12:00:00Z"), false, "UTC", now).label).toBe(
      "Oct 29",
    );
  });

  it("computes Today/Tomorrow relative to the zone, not UTC", () => {
    // now = 2026-01-15T23:00:00Z: still Jan 15 in UTC, already Jan 16 in Auckland (UTC+13).
    const now = new Date("2026-01-15T23:00:00Z");
    // dueAt = 2026-01-16T00:30:00Z: Jan 16 in UTC (tomorrow, relative to UTC's "today" of
    // Jan 15), but Jan 16 13:30 in Auckland too (today, relative to Auckland's "today").
    const dueAt = new Date("2026-01-16T00:30:00Z");

    expect(formatDueLabel(dueAt, false, "UTC", now).label).toBe("Tomorrow");
    expect(formatDueLabel(dueAt, false, "Pacific/Auckland", now).label).toBe("Today");
  });

  it("defaults `now` to the real current instant when omitted", () => {
    // Today's date in this sandbox is 2026-10-27 — far from any of the
    // fixed dates above, so the default-`now` call path stays exercised
    // without making the other tests time-dependent.
    const result = formatDueLabel(new Date("2026-01-05T00:00:00Z"), true, "UTC");
    expect(result.label).toBe("Jan 5");
  });
});
