import { describe, expect, it } from "vitest";
import {
  computeProgress,
  nextStatus,
  prevStatus,
} from "@/lib/learning/logic";

describe("status machine", () => {
  it("advances want → learning → learned → stops", () => {
    expect(nextStatus("want")).toBe("learning");
    expect(nextStatus("learning")).toBe("learned");
    expect(nextStatus("learned")).toBeNull();
    expect(prevStatus("learned")).toBe("learning");
    expect(prevStatus("want")).toBeNull();
  });
});

describe("computeProgress", () => {
  it("derives from milestones, guards divide-by-zero", () => {
    expect(computeProgress(0, 4)).toBe(0);
    expect(computeProgress(1, 4)).toBe(25);
    expect(computeProgress(3, 4)).toBe(75);
    expect(computeProgress(4, 4)).toBe(100);
    expect(computeProgress(2, 0)).toBe(0);
  });
});
