// Device-only storage for the user's OpenRouter key (ROADMAP-V3 §4.1, D1).
// Same hand-written IndexedDB style as lib/outbox/db.ts: database
// `wrangle-ai`, one store `keys`, one row keyed "openrouter".
//
// The key never leaves this device except in the Authorization header of a
// browser → openrouter.ai request (lib/ai/openrouter.ts). It is not in
// `users.prefs`, not in the outbox, never logged, never sent to our origin.

import { AI_CHANGED_EVENT } from "@/lib/ai/types";

export const AI_DB_NAME = "wrangle-ai";
const DB_VERSION = 1;
const STORE = "keys";
const ROW_ID = "openrouter";

export interface StoredKey {
  key: string;
  /** How it got here: shown in Settings, nothing else. */
  source: "pkce" | "paste";
  connectedAt: number;
}

export interface KeyStore {
  get(): Promise<StoredKey | null>;
  set(row: StoredKey): Promise<void>;
  clear(): Promise<void>;
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

export function openAiDb(factory: IDBFactory): Promise<IDBDatabase> {
  const req = factory.open(AI_DB_NAME, DB_VERSION);
  req.onupgradeneeded = () => {
    req.result.createObjectStore(STORE, { keyPath: "id" });
  };
  return request(req);
}

export function createKeyStore(dbPromise: Promise<IDBDatabase>): KeyStore {
  type Row = StoredKey & { id: typeof ROW_ID };
  return {
    async get() {
      const db = await dbPromise;
      const row = await request(
        db.transaction(STORE, "readonly").objectStore(STORE).get(ROW_ID) as IDBRequest<Row | undefined>,
      );
      if (!row) return null;
      return { key: row.key, source: row.source, connectedAt: row.connectedAt };
    },
    async set(row) {
      const db = await dbPromise;
      const tx = db.transaction(STORE, "readwrite");
      tx.objectStore(STORE).put({ id: ROW_ID, ...row } satisfies Row);
      await done(tx);
    },
    async clear() {
      const db = await dbPromise;
      const tx = db.transaction(STORE, "readwrite");
      tx.objectStore(STORE).delete(ROW_ID);
      await done(tx);
    },
  };
}

let browserStore: KeyStore | null = null;

/** The app's store, opened lazily on first use (browser only). */
export function keyStore(): KeyStore {
  if (!browserStore) browserStore = createKeyStore(openAiDb(indexedDB));
  return browserStore;
}

/** Store + notify. The settings panel and `useAiAvailable` listen for the event. */
export async function saveKey(row: StoredKey): Promise<void> {
  await keyStore().set(row);
  window.dispatchEvent(new Event(AI_CHANGED_EVENT));
}

/** Local half of "Revoke"; the remote half is a link to openrouter.ai/settings/keys. */
export async function forgetKey(): Promise<void> {
  await keyStore().clear();
  window.dispatchEvent(new Event(AI_CHANGED_EVENT));
}
