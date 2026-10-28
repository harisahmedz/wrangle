import { describe, expect, it } from "vitest";
import {
  LEARN_VIEW_KEY,
  mergeViewPref,
  parseUserPrefs,
  userPrefsSchema,
  viewPrefSchema,
} from "@/lib/validation/prefs";

describe("viewPrefSchema", () => {
  it("accepts a partial patch", () => {
    expect(viewPrefSchema.safeParse({ layout: "list" }).success).toBe(true);
    expect(viewPrefSchema.safeParse({}).success).toBe(true);
    expect(
      viewPrefSchema.safeParse({ layout: "list", groupBy: "due", sort: "due", showCompleted: true }).success,
    ).toBe(true);
  });

  it("rejects unknown enum values", () => {
    expect(viewPrefSchema.safeParse({ layout: "kanban" }).success).toBe(false);
    expect(viewPrefSchema.safeParse({ groupBy: "project" }).success).toBe(false);
    expect(viewPrefSchema.safeParse({ sort: "alphabetical" }).success).toBe(false);
  });

  it("accepts sort: priority (V2 S9/B85)", () => {
    expect(viewPrefSchema.safeParse({ sort: "priority" }).success).toBe(true);
  });

  it("rejects the wrong type for showCompleted", () => {
    expect(viewPrefSchema.safeParse({ showCompleted: "yes" }).success).toBe(false);
  });
});

describe("parseUserPrefs", () => {
  it("returns {} for null/undefined", () => {
    expect(parseUserPrefs(null)).toEqual({});
    expect(parseUserPrefs(undefined)).toEqual({});
  });

  it("returns {} for malformed data instead of throwing", () => {
    expect(parseUserPrefs("not an object")).toEqual({});
    expect(parseUserPrefs({ views: { board1: { layout: "grid" } } })).toEqual({});
  });

  it("round-trips a valid shape", () => {
    const raw = { views: { "board-1": { layout: "list", groupBy: "due" } } };
    expect(parseUserPrefs(raw)).toEqual(raw);
    expect(userPrefsSchema.safeParse(raw).success).toBe(true);
  });
});

describe("mergeViewPref", () => {
  it("adds a new view key into an empty prefs object", () => {
    const result = mergeViewPref({}, "board-1", { layout: "list" });
    expect(result).toEqual({ views: { "board-1": { layout: "list" } } });
  });

  it("merges a patch into an existing view without touching other keys", () => {
    const prefs = { views: { "board-1": { layout: "list" as const, groupBy: "column" as const } } };
    const result = mergeViewPref(prefs, "board-1", { showCompleted: true });
    expect(result.views?.["board-1"]).toEqual({
      layout: "list",
      groupBy: "column",
      showCompleted: true,
    });
  });

  it("does not disturb other boards' prefs", () => {
    const prefs = { views: { other: { layout: "board" as const } } };
    const result = mergeViewPref(prefs, "board-1", { layout: "list" });
    expect(result.views?.other).toEqual({ layout: "board" });
    expect(result.views?.["board-1"]).toEqual({ layout: "list" });
  });

  it("a later patch overwrites only the fields it carries", () => {
    let prefs = mergeViewPref({}, "b", { layout: "list", sort: "due" });
    prefs = mergeViewPref(prefs, "b", { layout: "board" });
    expect(prefs.views?.b).toEqual({ layout: "board", sort: "due" });
  });

  it("the reserved learn key works the same as any board id (S4b, no schema change)", () => {
    const result = mergeViewPref({}, LEARN_VIEW_KEY, { layout: "list" });
    expect(result).toEqual({ views: { learn: { layout: "list" } } });
    expect(userPrefsSchema.safeParse(result).success).toBe(true);
  });
});
