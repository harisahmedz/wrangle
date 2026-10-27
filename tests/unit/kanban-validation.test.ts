import { describe, expect, it } from "vitest";
import {
  createCardForProjectSchema,
  createCardSchema,
} from "@/lib/validation/kanban";

const COLUMN_ID = "018f6f1a-0000-7000-8000-000000000001";
const CARD_ID = "018f6f1a-0000-7000-8000-000000000002";
const PROJECT_ID = "018f6f1a-0000-7000-8000-000000000003";

describe("createCardSchema", () => {
  it("accepts the original columnId+title shape with no id/position (back-compat)", () => {
    const parsed = createCardSchema.safeParse({
      columnId: COLUMN_ID,
      title: "Water the plants",
    });
    expect(parsed.success).toBe(true);
  });

  it("accepts an optional client id and fractional position (V2 S5 / Q12)", () => {
    const parsed = createCardSchema.safeParse({
      columnId: COLUMN_ID,
      title: "Water the plants",
      id: CARD_ID,
      position: "a0",
    });
    expect(parsed.success).toBe(true);
    if (parsed.success) {
      expect(parsed.data.id).toBe(CARD_ID);
      expect(parsed.data.position).toBe("a0");
    }
  });

  it("rejects a non-UUID id", () => {
    const parsed = createCardSchema.safeParse({
      columnId: COLUMN_ID,
      title: "Water the plants",
      id: "not-a-uuid",
    });
    expect(parsed.success).toBe(false);
  });

  it("rejects an empty position string", () => {
    const parsed = createCardSchema.safeParse({
      columnId: COLUMN_ID,
      title: "Water the plants",
      position: "",
    });
    expect(parsed.success).toBe(false);
  });

  it("accepts an optional dueAt/isAllDay pair", () => {
    const parsed = createCardSchema.safeParse({
      columnId: COLUMN_ID,
      title: "Pay rent",
      dueAt: "2026-10-28T17:00:00.000Z",
      isAllDay: false,
    });
    expect(parsed.success).toBe(true);
  });

  it("rejects a missing title", () => {
    const parsed = createCardSchema.safeParse({ columnId: COLUMN_ID, title: "" });
    expect(parsed.success).toBe(false);
  });
});

describe("createCardForProjectSchema", () => {
  it("accepts a projectId + boardKind target (Quick Add v2's #project)", () => {
    const parsed = createCardForProjectSchema.safeParse({
      projectId: PROJECT_ID,
      boardKind: "todo",
      title: "Pay rent",
      id: CARD_ID,
      dueAt: "2026-10-28T17:00:00.000Z",
      isAllDay: false,
    });
    expect(parsed.success).toBe(true);
  });

  it("rejects a boardKind outside the enum", () => {
    const parsed = createCardForProjectSchema.safeParse({
      projectId: PROJECT_ID,
      boardKind: "nope",
      title: "Pay rent",
    });
    expect(parsed.success).toBe(false);
  });

  it("rejects a missing projectId", () => {
    const parsed = createCardForProjectSchema.safeParse({
      boardKind: "todo",
      title: "Pay rent",
    });
    expect(parsed.success).toBe(false);
  });
});
