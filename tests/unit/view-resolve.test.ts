import { describe, expect, it } from "vitest";
import { resolveInitialLayout } from "@/lib/kanban/view-resolve";

describe("resolveInitialLayout", () => {
  it("a valid ?view= query param wins over a saved pref", () => {
    expect(resolveInitialLayout("list", { layout: "board" })).toBe("list");
    expect(resolveInitialLayout("board", { layout: "list" })).toBe("board");
  });

  it("falls back to the saved pref when there is no query override", () => {
    expect(resolveInitialLayout(undefined, { layout: "list" })).toBe("list");
    expect(resolveInitialLayout("", { layout: "board" })).toBe("board");
  });

  it("an invalid query value is ignored, not treated as a layout", () => {
    expect(resolveInitialLayout("grid", { layout: "list" })).toBe("list");
    expect(resolveInitialLayout("grid", undefined)).toBeNull();
  });

  it("returns null (auto) when there is neither a query override nor a pref", () => {
    expect(resolveInitialLayout(undefined, undefined)).toBeNull();
    expect(resolveInitialLayout(undefined, {})).toBeNull();
  });
});
