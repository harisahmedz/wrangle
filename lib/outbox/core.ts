// The outbox's replay engine (docs/OFFLINE-OUTBOX.md §4): one FIFO per
// user, batches of 25, backoff ladder, 401 pause, cascade-fail. Pure —
// takes an `OutboxStore` + a `send` function so unit tests script both;
// lib/outbox/client.tsx wires the browser (IndexedDB, fetch, navigator
// events, Web Locks) around it.
import type { OutboxStore } from "@/lib/outbox/db";
import {
  OUTBOX_BACKOFF_MS,
  OUTBOX_BATCH_MAX,
  OUTBOX_FAILED_TTL_MS,
  OUTBOX_MAX_ATTEMPTS,
  OUTBOX_WIRE_VERSION,
  type EntryResult,
  type Mutation,
  type OutboxBatch,
  type OutboxEntry,
} from "@/lib/outbox/types";
import { uuidv7 } from "@/lib/uuid";

export type SendOutcome =
  | { kind: "ok"; results: EntryResult[] }
  /** Non-2xx; a 500 may still carry the results the server got through before it died. */
  | { kind: "http"; status: number; results?: EntryResult[] }
  /** fetch threw or timed out. */
  | { kind: "network" };

export type OutboxEvent =
  | { type: "applied"; count: number }
  | { type: "dropped"; reasons: string[] }
  | { type: "failed"; entries: OutboxEntry[] };

export type OutboxState = {
  /** Every entry for this user, oldest first, all statuses. */
  entries: OutboxEntry[];
  syncing: boolean;
  /** A 401 stopped the drain; stays until the next page load (§4.4). */
  authPaused: boolean;
};

export type OutboxOptions = {
  userId: string;
  store: OutboxStore;
  send: (batch: OutboxBatch) => Promise<SendOutcome>;
  isOnline?: () => boolean;
  now?: () => number;
  /** Timer injection for tests; must return a cancel function. */
  schedule?: (fn: () => void, ms: number) => () => void;
  /** Multi-tab guard around a drain (navigator.locks in the browser). */
  lock?: <T>(fn: () => Promise<T>) => Promise<T>;
  newId?: () => string;
  onEvent?: (event: OutboxEvent) => void;
};

export type Outbox = {
  /** Load from the store: reset `inflight`, drop stale `applied`, expire old `failed`, purge other users. */
  start(): Promise<void>;
  /**
   * Re-read the store (another tab may have drained). Resolves with how many
   * entries this tab was still overlaying (pending/inflight/applied) that the
   * store no longer has — the caller should refetch server state when > 0.
   */
  reload(): Promise<number>;
  /** Resolves with the entry id once stored locally; never throws for network. */
  enqueue(mutation: Mutation, label?: string): Promise<string>;
  drain(): Promise<void>;
  /** Delete `applied` entries — the provider calls this after `router.refresh()` settles (§2.3). */
  settle(): Promise<void>;
  retry(id: string): Promise<void>;
  discard(id: string): Promise<void>;
  discardAll(): Promise<void>;
  subscribe(listener: (state: OutboxState) => void): () => void;
  getState(): OutboxState;
  stop(): void;
};

const CASCADE_REASON = "Depends on a change that failed";
const UNREACHABLE_REASON = "Couldn't reach Wrangle";
const BAD_BATCH_REASON = "Couldn't sync this change (update the app)";

/** The entity id a mutation creates, if any — the anchor for cascade rules. */
function createdId(m: Mutation): string | null {
  return m.kind === "card.create" || m.kind === "expense.create" ? m.id : null;
}

/** The entity ids a mutation depends on having been created. */
function dependsOn(m: Mutation): string[] {
  switch (m.kind) {
    case "card.update":
    case "card.complete":
    case "card.move":
    case "checklist.set":
      return [m.cardId];
    default:
      return [];
  }
}

export function createOutbox(opts: OutboxOptions): Outbox {
  const isOnline = opts.isOnline ?? (() => true);
  const now = opts.now ?? Date.now;
  const schedule =
    opts.schedule ??
    ((fn: () => void, ms: number) => {
      const t = setTimeout(fn, ms);
      return () => clearTimeout(t);
    });
  const lock = opts.lock ?? (<T>(fn: () => Promise<T>) => fn());
  const newId = opts.newId ?? uuidv7;

  let state: OutboxState = { entries: [], syncing: false, authPaused: false };
  const listeners = new Set<(s: OutboxState) => void>();
  let draining = false;
  let backoffLevel = 0;
  let cancelBackoff: (() => void) | null = null;
  let stopped = false;
  // Store writes run in order; a failing IndexedDB (private mode, eviction)
  // must not break the in-memory queue for this session.
  let persistChain: Promise<void> = Promise.resolve();

  const persist = (op: () => Promise<void>): Promise<void> => {
    persistChain = persistChain.then(op).catch(() => {});
    return persistChain;
  };

  const setState = (patch: Partial<OutboxState>) => {
    state = { ...state, ...patch };
    for (const l of listeners) l(state);
  };

  const sorted = (entries: OutboxEntry[]) =>
    [...entries].sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));

  const replace = (next: OutboxEntry[]) => setState({ entries: sorted(next) });

  /** Apply `fn` to the entries with these ids; persists the changed ones. */
  const update = (ids: Set<string>, fn: (e: OutboxEntry) => OutboxEntry) => {
    const changed: OutboxEntry[] = [];
    const next = state.entries.map((e) => {
      if (!ids.has(e.id)) return e;
      const n = fn(e);
      changed.push(n);
      return n;
    });
    replace(next);
    void persist(() => opts.store.put(changed));
  };

  const removeIds = (ids: Set<string>) => {
    if (ids.size === 0) return;
    replace(state.entries.filter((e) => !ids.has(e.id)));
    void persist(() => opts.store.remove([...ids]));
  };

  /**
   * §4.3 cascade: once a create is failed/dropped, later entries that target
   * the created id could never apply — mark them the same way.
   */
  const cascade = (from: OutboxEntry[], status: "failed" | "dropped") => {
    const lostIds = new Set(from.map((e) => createdId(e.mutation)).filter((x): x is string => !!x));
    if (lostIds.size === 0) return { failed: [] as OutboxEntry[], dropped: new Set<string>() };
    const failedNow: OutboxEntry[] = [];
    const droppedNow = new Set<string>();
    for (const e of state.entries) {
      if (e.status === "applied" || e.status === "failed") continue;
      if (!dependsOn(e.mutation).some((id) => lostIds.has(id))) continue;
      if (status === "dropped") droppedNow.add(e.id);
      else failedNow.push({ ...e, status: "failed", lastError: CASCADE_REASON });
    }
    if (failedNow.length) update(new Set(failedNow.map((e) => e.id)), (e) => failedNow.find((f) => f.id === e.id) ?? e);
    removeIds(droppedNow);
    return { failed: failedNow, dropped: droppedNow };
  };

  const handleResults = (batch: OutboxEntry[], results: EntryResult[]) => {
    const byId = new Map(results.map((r) => [r.id, r]));
    const applied: OutboxEntry[] = [];
    const failedNow: OutboxEntry[] = [];
    const droppedNow: OutboxEntry[] = [];
    const reasons: string[] = [];

    const next = state.entries.map((e) => {
      const r = byId.get(e.id);
      if (!r || !batch.some((b) => b.id === e.id)) return e;
      if (r.status === "applied") {
        const m = e.mutation;
        const position = r.patch?.position;
        // §6: write the nudged position back so later entries (and the
        // overlay) keep the client's relative order.
        const mutation =
          position && (m.kind === "card.create" || m.kind === "card.move") ? { ...m, position } : m;
        const n: OutboxEntry = { ...e, status: "applied", mutation, lastError: undefined };
        applied.push(n);
        return n;
      }
      if (r.status === "dropped") {
        droppedNow.push(e);
        reasons.push(r.reason);
        return e;
      }
      const n: OutboxEntry = { ...e, status: "failed", lastError: r.reason };
      failedNow.push(n);
      return n;
    });
    // Entries the server didn't answer for go back to pending.
    const unanswered = batch.filter((b) => !byId.has(b.id)).map((b) => b.id);
    replace(
      next.map((e) => (unanswered.includes(e.id) && e.status === "inflight" ? { ...e, status: "pending" } : e)),
    );
    void persist(() => opts.store.put(state.entries.filter((e) => batch.some((b) => b.id === e.id))));
    removeIds(new Set(droppedNow.map((e) => e.id)));

    const viaFailed = cascade(failedNow, "failed");
    const viaDropped = cascade(droppedNow, "dropped");
    const allFailed = [...failedNow, ...viaFailed.failed];

    if (applied.length) opts.onEvent?.({ type: "applied", count: applied.length });
    if (reasons.length) opts.onEvent?.({ type: "dropped", reasons });
    if (allFailed.length) opts.onEvent?.({ type: "failed", entries: allFailed });
    void viaDropped;
  };

  const revert = (batch: OutboxEntry[], countAttempt: boolean) => {
    const ids = new Set(batch.map((b) => b.id));
    const exhausted: OutboxEntry[] = [];
    update(ids, (e) => {
      const attempts = countAttempt ? e.attempts + 1 : e.attempts;
      if (attempts >= OUTBOX_MAX_ATTEMPTS) {
        const n: OutboxEntry = { ...e, attempts, status: "failed", lastError: UNREACHABLE_REASON };
        exhausted.push(n);
        return n;
      }
      return { ...e, attempts, status: "pending" };
    });
    if (exhausted.length) {
      const viaCascade = cascade(exhausted, "failed");
      opts.onEvent?.({ type: "failed", entries: [...exhausted, ...viaCascade.failed] });
    }
  };

  const scheduleBackoff = () => {
    cancelBackoff?.();
    cancelBackoff = null;
    if (backoffLevel >= OUTBOX_BACKOFF_MS.length) return; // wait for the next trigger
    const ms = OUTBOX_BACKOFF_MS[backoffLevel++];
    cancelBackoff = schedule(() => {
      cancelBackoff = null;
      void drain(false);
    }, ms);
  };

  /**
   * `fromTrigger` (the default — enqueue, online, visible, mount, Retry)
   * re-arms the backoff ladder; only the ladder's own timer passes `false`,
   * so 2/5/15/60 s runs once per trigger and then waits for the next one
   * instead of stalling forever short of the 20-attempt cap.
   */
  async function drain(fromTrigger = true): Promise<void> {
    if (fromTrigger) backoffLevel = 0;
    if (stopped || draining || state.authPaused || !isOnline()) return;
    draining = true;
    cancelBackoff?.();
    cancelBackoff = null;
    setState({ syncing: true });
    try {
      await lock(async () => {
        while (!stopped) {
          const batch = state.entries.filter((e) => e.status === "pending").slice(0, OUTBOX_BATCH_MAX);
          if (batch.length === 0) break;
          const ids = new Set(batch.map((b) => b.id));
          update(ids, (e) => ({ ...e, status: "inflight" }));
          const wire: OutboxBatch = {
            v: OUTBOX_WIRE_VERSION,
            entries: batch.map((e) => ({ id: e.id, createdAt: e.createdAt, mutation: e.mutation })),
          };
          const outcome = await opts.send(wire);
          const inflight = state.entries.filter((e) => ids.has(e.id));
          // A 200 with no results for a non-empty batch is a broken reply
          // (proxy, stale deploy): treat it as transient below rather than
          // looping on it with no attempt counted.
          if (outcome.kind === "ok" && outcome.results.length > 0) {
            backoffLevel = 0;
            handleResults(inflight, outcome.results);
            continue;
          }
          if (outcome.kind === "http" && outcome.status === 401) {
            revert(inflight, false);
            setState({ authPaused: true });
            break;
          }
          if (outcome.kind === "http" && outcome.status === 400) {
            // Poison batch (§4.3): surface it instead of looping.
            const poisoned = inflight.map((e) => ({ ...e, status: "failed" as const, lastError: BAD_BATCH_REASON }));
            update(ids, (e) => poisoned.find((p) => p.id === e.id) ?? e);
            opts.onEvent?.({ type: "failed", entries: poisoned });
            continue;
          }
          // Transient: network, timeout, 5xx, 429. A 500 mid-batch still
          // reports the entries that landed before the throw — keep those
          // (§4 "partial progress survives a poison entry"), retry the rest.
          if (outcome.kind === "http" && outcome.results?.length) {
            handleResults(inflight, outcome.results);
          }
          const remaining = state.entries.filter(
            (e) => ids.has(e.id) && e.status !== "applied" && e.status !== "failed",
          );
          revert(remaining, true);
          scheduleBackoff();
          break;
        }
      });
    } finally {
      draining = false;
      setState({ syncing: false });
    }
  }

  async function load(): Promise<OutboxEntry[]> {
    try {
      return await opts.store.all(opts.userId);
    } catch {
      return [];
    }
  }

  return {
    async start() {
      await persist(() => opts.store.purgeOthers(opts.userId));
      const stored = await load();
      const t = now();
      const keep: OutboxEntry[] = [];
      const drop: string[] = [];
      const changed: OutboxEntry[] = [];
      for (const e of stored) {
        if (e.status === "applied") {
          drop.push(e.id); // the page is fresh from the server anyway
        } else if (e.status === "failed" && t - e.createdAt > OUTBOX_FAILED_TTL_MS) {
          drop.push(e.id);
        } else if (e.status === "inflight") {
          const n: OutboxEntry = { ...e, status: "pending" }; // a crashed drain
          changed.push(n);
          keep.push(n);
        } else {
          keep.push(e);
        }
      }
      // Anything enqueued before the load finished wins over the stored copy.
      const inMemory = new Map(state.entries.map((e) => [e.id, e]));
      replace([...keep.filter((e) => !inMemory.has(e.id)), ...state.entries]);
      void persist(() => opts.store.put(changed));
      void persist(() => opts.store.remove(drop));
    },
    async reload() {
      if (draining) return 0;
      const stored = await load();
      const storedIds = new Set(stored.map((s) => s.id));
      // Take the store's word (another tab may have drained it), but keep
      // local entries whose write may still be in flight.
      const missing = state.entries.filter((e) => !storedIds.has(e.id));
      const localOnly = missing.filter((e) => now() - e.createdAt < 5_000);
      replace([...stored, ...localOnly]);
      return missing.filter((e) => !localOnly.includes(e) && e.status !== "failed").length;
    },
    async enqueue(mutation, label) {
      const entry: OutboxEntry = {
        id: newId(),
        userId: opts.userId,
        createdAt: now(),
        attempts: 0,
        status: "pending",
        label,
        mutation,
      };
      replace([...state.entries, entry]);
      await persist(() => opts.store.put([entry]));
      void drain();
      return entry.id;
    },
    drain,
    async settle() {
      removeIds(new Set(state.entries.filter((e) => e.status === "applied").map((e) => e.id)));
      await persistChain;
    },
    async retry(id) {
      update(new Set([id]), (e) => ({ ...e, status: "pending", attempts: 0, lastError: undefined }));
      await persistChain;
      void drain();
    },
    async discard(id) {
      removeIds(new Set([id]));
      await persistChain;
    },
    async discardAll() {
      removeIds(new Set(state.entries.filter((e) => e.status === "failed").map((e) => e.id)));
      await persistChain;
    },
    subscribe(listener) {
      listeners.add(listener);
      listener(state);
      return () => {
        listeners.delete(listener);
      };
    },
    getState: () => state,
    stop() {
      stopped = true;
      cancelBackoff?.();
      cancelBackoff = null;
      listeners.clear();
    },
  };
}
