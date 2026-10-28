import "fake-indexeddb/auto";
import { IDBFactory } from "fake-indexeddb";
import { describe, expect, it } from "vitest";
import { createIdbStore, openOutboxDb } from "@/lib/outbox/db";
import type { OutboxEntry } from "@/lib/outbox/types";

// docs/OFFLINE-OUTBOX.md §3/§8: the hand-written wrapper against fake-indexeddb.

function entry(id: string, userId = "u1", status: OutboxEntry["status"] = "pending"): OutboxEntry {
  return {
    id,
    userId,
    createdAt: 1,
    attempts: 0,
    status,
    mutation: { kind: "card.complete", cardId: "c", completed: true },
  };
}

const fresh = () => createIdbStore(openOutboxDb(new IDBFactory()));

describe("outbox IndexedDB store", () => {
  it("put/all round-trips, sorted by id and scoped to the user", async () => {
    const store = fresh();
    await store.put([entry("003"), entry("001"), entry("002", "u2")]);
    expect((await store.all("u1")).map((e) => e.id)).toEqual(["001", "003"]);
    expect((await store.all("u2")).map((e) => e.id)).toEqual(["002"]);
    expect(await store.all("u3")).toEqual([]);
  });

  it("put overwrites by id (status changes persist)", async () => {
    const store = fresh();
    await store.put([entry("001")]);
    await store.put([entry("001", "u1", "failed")]);
    const [row] = await store.all("u1");
    expect(row.status).toBe("failed");
  });

  it("remove deletes the given ids only", async () => {
    const store = fresh();
    await store.put([entry("001"), entry("002")]);
    await store.remove(["001"]);
    expect((await store.all("u1")).map((e) => e.id)).toEqual(["002"]);
    await store.remove([]);
    expect(await store.all("u1")).toHaveLength(1);
  });

  it("purgeOthers keeps only the signed-in user's entries (Q9)", async () => {
    const store = fresh();
    await store.put([entry("001"), entry("002", "u2"), entry("003", "u3")]);
    await store.purgeOthers("u1");
    expect(await store.all("u1")).toHaveLength(1);
    expect(await store.all("u2")).toHaveLength(0);
    expect(await store.all("u3")).toHaveLength(0);
  });
});
