import { describe, expect, it } from "vitest";
import { reorderById } from "@/lib/order";

type Item = { id: string; position: string };

function item(id: string, position: string): Item {
  return { id, position };
}

const list = [item("a", "a0"), item("b", "a1"), item("c", "a2")];

describe("reorderById (B55 — columns + projects)", () => {
  it("moves an item right and computes a fractional position between neighbors", () => {
    const result = reorderById(list, "a", "b")!;
    expect(result.id).toBe("a");
    expect(result.items.map((i) => i.id)).toEqual(["b", "a", "c"]);
    expect(result.position > "a1" && result.position < "a2").toBe(true);
  });

  it("moves an item left to the front with a key below the old first", () => {
    const result = reorderById(list, "c", "a")!;
    expect(result.items.map((i) => i.id)).toEqual(["c", "a", "b"]);
    expect(result.position < "a0").toBe(true);
  });

  it("moves an item to the end with null after-key", () => {
    const result = reorderById(list, "a", "c")!;
    expect(result.items.map((i) => i.id)).toEqual(["b", "c", "a"]);
    expect(result.position > "a2").toBe(true);
  });

  it("returns null for no-op and unknown ids", () => {
    expect(reorderById(list, "a", "a")).toBeNull();
    expect(reorderById(list, "x", "a")).toBeNull();
    expect(reorderById(list, "a", "x")).toBeNull();
  });

  it("does not mutate the input array", () => {
    reorderById(list, "a", "c");
    expect(list.map((i) => i.id)).toEqual(["a", "b", "c"]);
  });
});
