import { describe, expect, it } from "vitest";
import {
  aiPrefSchema,
  LEARN_VIEW_KEY,
  mergeViewPref,
  parseUserPrefs,
  PLAN_CAP_DEFAULTS,
  planPrefSchema,
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

  it("accepts ai.mode (V3 S0) next to views, and rejects unknown modes", () => {
    const raw = { views: {}, ai: { mode: "on-device-then-openrouter" } };
    expect(parseUserPrefs(raw)).toEqual(raw);
    expect(parseUserPrefs({ ai: { mode: "on-device" } }).ai?.mode).toBe("on-device");
    expect(aiPrefSchema.safeParse({ mode: "off" }).success).toBe(true);
    expect(aiPrefSchema.safeParse({ mode: "cloud" }).success).toBe(false);
    expect(parseUserPrefs({ ai: { mode: "cloud" } })).toEqual({});
  });

  it("never carries an OpenRouter key: unknown ai fields are stripped", () => {
    expect(parseUserPrefs({ ai: { mode: "off", key: "sk-or-v1-x" } })).toEqual({ ai: { mode: "off" } });
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

describe("plan prefs (V3 S6)", () => {
  it("accepts plan caps next to views and ai, with the 1–20 / 0–20 limits", () => {
    const raw = { ai: { mode: "off" }, plan: { dailyCap: 4, weekendCap: 0 } };
    expect(parseUserPrefs(raw)).toEqual(raw);
    expect(planPrefSchema.safeParse({ dailyCap: 1, weekendCap: 20 }).success).toBe(true);
    expect(planPrefSchema.safeParse({ dailyCap: 0 }).success).toBe(false);
    expect(planPrefSchema.safeParse({ weekendCap: -1 }).success).toBe(false);
    expect(planPrefSchema.safeParse({ dailyCap: 21 }).success).toBe(false);
    expect(planPrefSchema.safeParse({ dailyCap: 2.5 }).success).toBe(false);
    expect(parseUserPrefs({ plan: { dailyCap: "5" } })).toEqual({});
    expect(PLAN_CAP_DEFAULTS).toEqual({ dailyCap: 5, weekendCap: 2 });
  });
});
