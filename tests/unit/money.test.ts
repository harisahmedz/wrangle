import { describe, expect, it } from "vitest";
import {
  formatMinor,
  monthBounds,
  parseAmountToMinor,
  shiftMonth,
} from "@/lib/money";

describe("parseAmountToMinor", () => {
  it("parses common inputs to integer minor units", () => {
    expect(parseAmountToMinor("12.34")).toBe(1234);
    expect(parseAmountToMinor("12")).toBe(1200);
    expect(parseAmountToMinor(".5")).toBe(50);
    expect(parseAmountToMinor("0.99")).toBe(99);
    expect(parseAmountToMinor("$1,234.5")).toBe(123450);
  });

  it("rejects junk and extra dots", () => {
    expect(parseAmountToMinor("abc")).toBeNull();
    expect(parseAmountToMinor("1.2.3")).toBeNull();
    expect(parseAmountToMinor("")).toBeNull();
  });
});

describe("formatMinor", () => {
  it("renders USD", () => {
    expect(formatMinor(1234)).toContain("12.34");
    expect(formatMinor(5)).toContain("0.05");
  });
});

describe("month math", () => {
  it("shifts across year boundaries", () => {
    expect(shiftMonth("2026-01", -1)).toBe("2025-12");
    expect(shiftMonth("2026-12", 1)).toBe("2027-01");
  });

  it("bounds are half-open UTC date strings", () => {
    const b = monthBounds("2026-02");
    expect(b.startDate).toBe("2026-02-01");
    expect(b.endDate).toBe("2026-03-01");
  });
});
