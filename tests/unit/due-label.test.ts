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
});
