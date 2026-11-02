import "fake-indexeddb/auto";
import { IDBFactory } from "fake-indexeddb";
import { describe, expect, it } from "vitest";
import { createKeyStore, openAiDb } from "@/lib/ai/key-store";

// docs/AI.md "Key safety": the device-only IndexedDB store, against fake-indexeddb.

const fresh = () => createKeyStore(openAiDb(new IDBFactory()));

describe("AI key store", () => {
  it("starts empty, round-trips a key, overwrites, clears", async () => {
    const store = fresh();
    expect(await store.get()).toBeNull();
    await store.set({ key: "sk-or-v1-abc", source: "pkce", connectedAt: 100 });
    expect(await store.get()).toEqual({ key: "sk-or-v1-abc", source: "pkce", connectedAt: 100 });
    await store.set({ key: "sk-or-v1-def", source: "paste", connectedAt: 200 });
    expect(await store.get()).toEqual({ key: "sk-or-v1-def", source: "paste", connectedAt: 200 });
    await store.clear();
    expect(await store.get()).toBeNull();
    await store.clear(); // idempotent
    expect(await store.get()).toBeNull();
  });

  it("stores are isolated per database factory", async () => {
    const a = fresh();
    const b = fresh();
    await a.set({ key: "k", source: "paste", connectedAt: 1 });
    expect(await b.get()).toBeNull();
  });
});
