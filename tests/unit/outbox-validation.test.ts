import { describe, expect, it } from "vitest";
import { isPermanentApplyError } from "@/lib/outbox/errors";
import { isValidPositionKey } from "@/lib/order";
import { outboxBatchSchema } from "@/lib/validation/outbox";

// S8 security review M1: a client-supplied position or date must be
// well-formed before it reaches the DB, and a deterministic DB error must
// fail one entry, not the batch.

const ID = "018f6f1a-0000-7000-8000-000000000001";
const batch = (mutation: unknown) => ({ v: 1, entries: [{ id: ID, createdAt: 1, mutation }] });

describe("isValidPositionKey", () => {
  it.each(["a0", "a1", "Zz", "a0V", "b00", "a0zzz"])("accepts %s", (key) => {
    expect(isValidPositionKey(key)).toBe(true);
  });
  it.each(["", "zz", "a10", "a", "0", "a0 ", "A", "aZ0"])("rejects %j", (key) => {
    expect(isValidPositionKey(key)).toBe(false);
  });
});

describe("outboxBatchSchema", () => {
  it("accepts a well-formed create and move", () => {
    expect(
      outboxBatchSchema.safeParse(batch({ kind: "card.create", id: ID, target: { columnId: ID }, title: "x", position: "a0" })).success,
    ).toBe(true);
    expect(outboxBatchSchema.safeParse(batch({ kind: "card.move", cardId: ID, toColumnId: ID, position: "a0V" })).success).toBe(true);
  });

  it.each(["zz", "a10", ""])("rejects a malformed position %j on create and move", (position) => {
    expect(outboxBatchSchema.safeParse(batch({ kind: "card.create", id: ID, target: { columnId: ID }, title: "x", position })).success).toBe(false);
    expect(outboxBatchSchema.safeParse(batch({ kind: "card.move", cardId: ID, toColumnId: ID, position })).success).toBe(false);
  });

  it("accepts priority 1|2|3|null on create and update, rejects 4/5 (S9 wire rule: P4 is null)", () => {
    const create = (priority: unknown) => batch({ kind: "card.create", id: ID, target: { columnId: ID }, title: "x", priority });
    const update = (priority: unknown) => batch({ kind: "card.update", cardId: ID, patch: { priority } });
    for (const ok of [1, 2, 3, null]) {
      expect(outboxBatchSchema.safeParse(create(ok)).success).toBe(true);
      expect(outboxBatchSchema.safeParse(update(ok)).success).toBe(true);
    }
    for (const bad of [4, 5, "1"]) {
      expect(outboxBatchSchema.safeParse(create(bad)).success).toBe(false);
      expect(outboxBatchSchema.safeParse(update(bad)).success).toBe(false);
    }
    expect(outboxBatchSchema.safeParse(batch({ kind: "card.update", cardId: ID, patch: {} })).success).toBe(true);
  });

  it("requires a real calendar date for spentOn", () => {
    const expense = (spentOn: string) => batch({ kind: "expense.create", id: ID, categoryId: ID, amountMinor: 100, spentOn });
    expect(outboxBatchSchema.safeParse(expense("2026-10-28")).success).toBe(true);
    expect(outboxBatchSchema.safeParse(expense("2026-13-45")).success).toBe(false);
    expect(outboxBatchSchema.safeParse(expense("2026-02-30")).success).toBe(false);
    expect(outboxBatchSchema.safeParse(expense("28/10/2026")).success).toBe(false);
  });

  it("rejects an unknown kind, a wrong version and an oversized batch", () => {
    expect(outboxBatchSchema.safeParse(batch({ kind: "card.explode", cardId: ID })).success).toBe(false);
    expect(outboxBatchSchema.safeParse({ ...batch({ kind: "card.complete", cardId: ID, completed: true }), v: 2 }).success).toBe(false);
    const entries = Array.from({ length: 26 }, (_, i) => ({
      id: ID.slice(0, -2) + String(i).padStart(2, "0"),
      createdAt: 1,
      mutation: { kind: "card.complete", cardId: ID, completed: true },
    }));
    expect(outboxBatchSchema.safeParse({ v: 1, entries }).success).toBe(false);
  });
});

describe("isPermanentApplyError", () => {
  it("treats Postgres data/integrity errors as permanent and everything else as transient", () => {
    expect(isPermanentApplyError({ code: "22008" })).toBe(true); // datetime field overflow
    expect(isPermanentApplyError({ code: "23505" })).toBe(true); // unique violation
    expect(isPermanentApplyError({ code: "08006" })).toBe(false); // connection failure
    expect(isPermanentApplyError({ code: "57014" })).toBe(false); // query canceled / timeout
    expect(isPermanentApplyError(new Error("socket hang up"))).toBe(false);
    expect(isPermanentApplyError(null)).toBe(false);
    expect(isPermanentApplyError({ code: 23505 })).toBe(false);
  });
});
