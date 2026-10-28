import { describe, expect, it } from "vitest";
import { normalizePriority } from "@/lib/kanban/priority";

describe("normalizePriority", () => {
  it("passes 1, 2, 3 through unchanged", () => {
    expect(normalizePriority(1)).toBe(1);
    expect(normalizePriority(2)).toBe(2);
    expect(normalizePriority(3)).toBe(3);
  });

  it("folds 4 (P4, 'no priority') down to null", () => {
    expect(normalizePriority(4)).toBeNull();
  });

  it("treats null/undefined/out-of-range as null", () => {
    expect(normalizePriority(null)).toBeNull();
    expect(normalizePriority(undefined)).toBeNull();
    expect(normalizePriority(0)).toBeNull();
    expect(normalizePriority(5)).toBeNull();
    expect(normalizePriority(-1)).toBeNull();
  });
});
