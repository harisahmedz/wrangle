import { describe, expect, it } from "vitest";
import { createOutbox, type SendOutcome } from "@/lib/outbox/core";
import type { OutboxStore } from "@/lib/outbox/db";
import type { EntryResult, Mutation, OutboxBatch, OutboxEntry } from "@/lib/outbox/types";

// docs/OFFLINE-OUTBOX.md §8: pure engine tests — an in-memory store and a
// scripted `send`, no IndexedDB, no fetch.

function memoryStore(seed: OutboxEntry[] = []): OutboxStore & { rows: Map<string, OutboxEntry> } {
  const rows = new Map(seed.map((e) => [e.id, e]));
  return {
    rows,
    async all(userId) {
      return [...rows.values()].filter((e) => e.userId === userId).sort((a, b) => (a.id < b.id ? -1 : 1));
    },
    async put(entries) {
      for (const e of entries) rows.set(e.id, e);
    },
    async remove(ids) {
      for (const id of ids) rows.delete(id);
    },
    async purgeOthers(userId) {
      for (const [id, e] of rows) if (e.userId !== userId) rows.delete(id);
    },
  };
}

const tick = () => new Promise((r) => setTimeout(r, 5));

const complete = (cardId: string): Mutation => ({ kind: "card.complete", cardId, completed: true });
const create = (id: string): Mutation => ({ kind: "card.create", id, target: { columnId: "col" }, title: id });

function harness(opts: { online?: () => boolean; outcomes?: Array<SendOutcome | ((b: OutboxBatch) => SendOutcome)> } = {}) {
  let n = 0;
  const batches: OutboxBatch[] = [];
  const timers: Array<{ fn: () => void; ms: number }> = [];
  const store = memoryStore();
  const script = opts.outcomes ?? [];
  const outbox = createOutbox({
    userId: "u1",
    store,
    isOnline: opts.online ?? (() => true),
    newId: () => `id-${String(++n).padStart(3, "0")}`,
    schedule: (fn, ms) => {
      const t = { fn, ms };
      timers.push(t);
      return () => timers.splice(timers.indexOf(t), 1);
    },
    send: async (batch) => {
      batches.push(batch);
      const next = script.shift();
      if (!next) return { kind: "ok", results: batch.entries.map((e) => ({ id: e.id, status: "applied" })) };
      return typeof next === "function" ? next(batch) : next;
    },
  });
  return { outbox, store, batches, timers };
}

describe("outbox core", () => {
  it("drains FIFO in batches of 25", async () => {
    let online = false;
    const h = harness({ online: () => online });
    for (let i = 0; i < 30; i++) await h.outbox.enqueue(complete(`c${i}`));
    expect(h.batches).toHaveLength(0);
    online = true;
    await h.outbox.drain();
    expect(h.batches.map((b) => b.entries.length)).toEqual([25, 5]);
    expect(h.batches[0].entries[0].id).toBe("id-001");
    expect(h.batches[1].entries[4].id).toBe("id-030");
    expect(h.outbox.getState().entries.every((e) => e.status === "applied")).toBe(true);
    await h.outbox.settle();
    expect(h.outbox.getState().entries).toHaveLength(0);
    expect(h.store.rows.size).toBe(0);
  });

  it("writes a nudged position back into the entry (§6)", async () => {
    const h = harness({
      outcomes: [(b) => ({ kind: "ok", results: [{ id: b.entries[0].id, status: "applied", patch: { position: "a0V" } }] })],
    });
    await h.outbox.enqueue({ kind: "card.move", cardId: "c1", toColumnId: "col", position: "a0" });
    await tick();
    const [e] = h.outbox.getState().entries;
    expect(e.status).toBe("applied");
    expect(e.mutation).toMatchObject({ position: "a0V" });
  });

  it("deletes dropped entries and reports the reason", async () => {
    const events: string[] = [];
    const h = harness({
      outcomes: [(b) => ({ kind: "ok", results: [{ id: b.entries[0].id, status: "dropped", reason: "gone" }] })],
    });
    h.outbox.subscribe(() => {});
    const outbox = createOutbox({
      userId: "u1",
      store: h.store,
      send: async (b) => ({ kind: "ok", results: b.entries.map((e) => ({ id: e.id, status: "dropped", reason: "gone" })) }),
      onEvent: (ev) => events.push(ev.type),
    });
    await outbox.enqueue(complete("c1"));
    await tick();
    expect(outbox.getState().entries).toHaveLength(0);
    expect(events).toEqual(["dropped"]);
  });

  it("marks failed entries and cascades to later entries that depend on a failed create", async () => {
    let online = false;
    const h = harness({
      online: () => online,
      outcomes: [
        // The server answers for the create only; the unanswered rest go
        // back to pending, where the cascade rule catches the dependent.
        (b) => ({
          kind: "ok",
          results: [{ id: b.entries[0].id, status: "failed", reason: "no access" } satisfies EntryResult],
        }),
      ],
    });
    await h.outbox.enqueue(create("new1"));
    await h.outbox.enqueue(complete("new1"));
    await h.outbox.enqueue(complete("other"));
    online = true;
    await h.outbox.drain();
    const [a, b, c] = h.outbox.getState().entries;
    expect(a.status).toBe("failed");
    expect(a.lastError).toBe("no access");
    expect(b.status).toBe("failed");
    expect(b.lastError).toBe("Depends on a change that failed");
    expect(c.status).toBe("applied");
    // Retry resets the entry and drains again.
    await h.outbox.retry(a.id);
    await tick();
    expect(h.outbox.getState().entries.find((e) => e.id === a.id)?.status).toBe("applied");
  });

  it("backs off on transient failures and gives up after 20 attempts", async () => {
    const h = harness({ outcomes: Array.from({ length: 30 }, () => ({ kind: "network" }) as SendOutcome) });
    await h.outbox.enqueue(complete("c1"));
    await tick();
    expect(h.outbox.getState().entries[0]).toMatchObject({ status: "pending", attempts: 1 });
    expect(h.timers.map((t) => t.ms)).toEqual([2_000]);
    for (const expected of [5_000, 15_000, 60_000]) {
      h.timers.shift()!.fn();
      await tick();
      expect(h.timers.map((t) => t.ms)).toEqual([expected]);
    }
    h.timers.shift()!.fn();
    await tick();
    // Ladder exhausted: no timer, waits for the next trigger.
    expect(h.timers).toHaveLength(0);
    expect(h.outbox.getState().entries[0].attempts).toBe(5);
    // A trigger (online/visible/mount/enqueue) re-arms the ladder from 2 s.
    await h.outbox.drain();
    expect(h.outbox.getState().entries[0].attempts).toBe(6);
    expect(h.timers.map((t) => t.ms)).toEqual([2_000]);
    for (let i = 6; i < 20; i++) {
      await h.outbox.drain();
    }
    expect(h.outbox.getState().entries[0]).toMatchObject({ status: "failed", lastError: "Couldn't reach Wrangle" });
  });

  it("treats a 200 with no results for a non-empty batch as transient", async () => {
    const h = harness({ outcomes: [{ kind: "ok", results: [] }] });
    await h.outbox.enqueue(complete("c1"));
    await tick();
    expect(h.outbox.getState().entries[0]).toMatchObject({ status: "pending", attempts: 1 });
    expect(h.timers.map((t) => t.ms)).toEqual([2_000]);
  });

  it("reload() reports entries another tab settled so the caller can refetch", async () => {
    const h = harness({ online: () => false });
    await h.outbox.enqueue(complete("c1"));
    await h.outbox.enqueue(complete("c2"));
    // "Another tab" drained c1 and deleted it from the store.
    h.store.rows.delete("id-001");
    // Only entries older than the in-flight-write grace window count.
    for (const e of h.outbox.getState().entries) h.store.rows.set(e.id, { ...e, createdAt: 0 });
    h.store.rows.delete("id-001");
    expect(await h.outbox.reload()).toBe(0); // id-001 is < 5 s old: assumed still being written
    const outbox = createOutbox({
      userId: "u1",
      store: h.store,
      now: () => 10_000,
      isOnline: () => false,
      send: async () => ({ kind: "network" }),
    });
    await outbox.start();
    h.store.rows.delete("id-002");
    expect(await outbox.reload()).toBe(1);
    expect(outbox.getState().entries).toHaveLength(0);
  });

  it("keeps the partial results of a 500 mid-batch and retries only the rest", async () => {
    let online = false;
    const h = harness({
      online: () => online,
      outcomes: [
        // The server applied #1, failed #2 deterministically, then died on #3.
        (b) => ({
          kind: "http",
          status: 500,
          results: [
            { id: b.entries[0].id, status: "applied" },
            { id: b.entries[1].id, status: "failed", reason: "Couldn't apply this change" },
          ],
        }),
      ],
    });
    await h.outbox.enqueue(complete("c1"));
    await h.outbox.enqueue(complete("c2"));
    await h.outbox.enqueue(complete("c3"));
    online = true;
    await h.outbox.drain();
    const [a, b, c] = h.outbox.getState().entries;
    expect(a).toMatchObject({ status: "applied", attempts: 0 });
    expect(b).toMatchObject({ status: "failed", lastError: "Couldn't apply this change", attempts: 0 });
    expect(c).toMatchObject({ status: "pending", attempts: 1 });
    expect(h.timers.map((t) => t.ms)).toEqual([2_000]);
    // The retry sends only the unresolved entry, and it lands.
    h.timers.shift()!.fn();
    await tick();
    expect(h.batches[1].entries.map((e) => e.id)).toEqual([c.id]);
    expect(h.outbox.getState().entries.find((e) => e.id === c.id)?.status).toBe("applied");
  });

  it("pauses on 401 and keeps the batch pending", async () => {
    const h = harness({ outcomes: [{ kind: "http", status: 401 }] });
    await h.outbox.enqueue(complete("c1"));
    await tick();
    expect(h.outbox.getState()).toMatchObject({ authPaused: true });
    expect(h.outbox.getState().entries[0]).toMatchObject({ status: "pending", attempts: 0 });
    await h.outbox.drain();
    expect(h.batches).toHaveLength(1);
  });

  it("fails a poison batch (400) instead of looping", async () => {
    const h = harness({ outcomes: [{ kind: "http", status: 400 }] });
    await h.outbox.enqueue(complete("c1"));
    await tick();
    expect(h.outbox.getState().entries[0].status).toBe("failed");
    expect(h.timers).toHaveLength(0);
  });

  it("start(): resets inflight, drops applied, expires old failed, purges other users", async () => {
    const now = 1_000_000_000_000;
    const base = { userId: "u1", createdAt: now, attempts: 0, mutation: complete("x") };
    const store = memoryStore([
      { ...base, id: "a", status: "inflight" },
      { ...base, id: "b", status: "applied" },
      { ...base, id: "c", status: "failed", createdAt: now - 31 * 24 * 3600 * 1000 },
      { ...base, id: "d", status: "failed", createdAt: now - 1000 },
      { ...base, id: "e", status: "pending", userId: "u2" },
    ]);
    const outbox = createOutbox({ userId: "u1", store, now: () => now, isOnline: () => false, send: async () => ({ kind: "network" }) });
    await outbox.start();
    expect(outbox.getState().entries.map((e) => [e.id, e.status])).toEqual([
      ["a", "pending"],
      ["d", "failed"],
    ]);
    await tick();
    expect([...store.rows.keys()].sort()).toEqual(["a", "d"]);
  });

  it("does nothing while offline", async () => {
    const h = harness({ online: () => false });
    await h.outbox.enqueue(complete("c1"));
    await h.outbox.drain();
    expect(h.batches).toHaveLength(0);
    expect(h.outbox.getState().entries[0].status).toBe("pending");
  });
});
