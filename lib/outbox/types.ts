// The offline outbox's shared types (docs/OFFLINE-OUTBOX.md §2.2, §3, §4).
// Client-safe: types only, no Zod (that's lib/validation/outbox.ts,
// server-side). The `Mutation` union itself lives in lib/mutations/types.ts
// since every call site already imports it from there.
import type { Mutation } from "@/lib/mutations/types";

export type { Mutation };

export type OutboxStatus = "pending" | "inflight" | "applied" | "failed";

export type OutboxEntry = {
  /** UUIDv7 mutation id — time-ordered, so FIFO = sort by id. */
  id: string;
  userId: string;
  /** Device clock, ms epoch; the server uses it for `completedAt` (§5.3). */
  createdAt: number;
  /** Network attempts so far (cap 20, §4.3). */
  attempts: number;
  status: OutboxStatus;
  lastError?: string;
  /** Human label for the review sheet ("Complete 'Buy milk'"), set at enqueue. */
  label?: string;
  mutation: Mutation;
};

/** One entry on the wire — what `POST /api/outbox` receives. */
export type WireEntry = { id: string; createdAt: number; mutation: Mutation };

export type OutboxBatch = { v: 1; entries: WireEntry[] };

export type EntryResult =
  | { id: string; status: "applied"; patch?: { position?: string } }
  | { id: string; status: "dropped"; reason: string }
  | { id: string; status: "failed"; reason: string };

export type OutboxResponse = { results: EntryResult[] };

export const OUTBOX_WIRE_VERSION = 1 as const;
export const OUTBOX_BATCH_MAX = 25;
export const OUTBOX_MAX_ATTEMPTS = 20;
export const OUTBOX_TIMEOUT_MS = 20_000;
/** §4.3 backoff ladder; after the last rung the queue waits for a trigger. */
export const OUTBOX_BACKOFF_MS = [2_000, 5_000, 15_000, 60_000] as const;
/** Q8: failed entries auto-discard after 30 days; pending ones never expire. */
export const OUTBOX_FAILED_TTL_MS = 30 * 24 * 60 * 60 * 1000;
