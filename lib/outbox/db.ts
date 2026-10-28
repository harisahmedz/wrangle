// Hand-written IndexedDB wrapper for the outbox (docs/OFFLINE-OUTBOX.md §3,
// Q6): database `wrangle-outbox`, one store `entries` keyed by the UUIDv7
// mutation id, index `byUserStatus` on [userId, status]. Six promisified
// requests; no `idb` dependency. Tests run it against `fake-indexeddb`.
import type { OutboxEntry } from "@/lib/outbox/types";

export const OUTBOX_DB_NAME = "wrangle-outbox";
const DB_VERSION = 1;
const STORE = "entries";
const INDEX = "byUserStatus";

export interface OutboxStore {
  /** Every entry for `userId`, oldest first (UUIDv7 ids sort by time). */
  all(userId: string): Promise<OutboxEntry[]>;
  put(entries: OutboxEntry[]): Promise<void>;
  remove(ids: string[]): Promise<void>;
  /** Q9: another user's entries never survive a sign-in (same rule as the SW page cache). */
  purgeOthers(userId: string): Promise<void>;
}

function request<T>(req: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

function done(tx: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error);
  });
}

export function openOutboxDb(factory: IDBFactory): Promise<IDBDatabase> {
  const req = factory.open(OUTBOX_DB_NAME, DB_VERSION);
  req.onupgradeneeded = () => {
    const store = req.result.createObjectStore(STORE, { keyPath: "id" });
    store.createIndex(INDEX, ["userId", "status"]);
  };
  return request(req);
}

export function createIdbStore(dbPromise: Promise<IDBDatabase>): OutboxStore {
  const byId = (a: OutboxEntry, b: OutboxEntry) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0);
  return {
    async all(userId) {
      const db = await dbPromise;
      const index = db.transaction(STORE, "readonly").objectStore(STORE).index(INDEX);
      const rows = await request(
        index.getAll(IDBKeyRange.bound([userId, ""], [userId, "￿"])) as IDBRequest<OutboxEntry[]>,
      );
      return rows.sort(byId);
    },
    async put(entries) {
      if (entries.length === 0) return;
      const db = await dbPromise;
      const tx = db.transaction(STORE, "readwrite");
      const store = tx.objectStore(STORE);
      for (const e of entries) store.put(e);
      await done(tx);
    },
    async remove(ids) {
      if (ids.length === 0) return;
      const db = await dbPromise;
      const tx = db.transaction(STORE, "readwrite");
      const store = tx.objectStore(STORE);
      for (const id of ids) store.delete(id);
      await done(tx);
    },
    async purgeOthers(userId) {
      const db = await dbPromise;
      const tx = db.transaction(STORE, "readwrite");
      const store = tx.objectStore(STORE);
      const rows = await request(store.getAll() as IDBRequest<OutboxEntry[]>);
      for (const row of rows) if (row.userId !== userId) store.delete(row.id);
      await done(tx);
    },
  };
}

let browserStore: OutboxStore | null = null;

/** The app's store, opened lazily on first use (browser only). */
export function idbStore(): OutboxStore {
  if (!browserStore) browserStore = createIdbStore(openOutboxDb(indexedDB));
  return browserStore;
}
