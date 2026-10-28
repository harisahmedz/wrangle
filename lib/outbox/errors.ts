// Error classification for `POST /api/outbox` (docs/OFFLINE-OUTBOX.md §4.3,
// §11): a throw inside one entry's `apply*` must not take the batch down
// with it unless the server itself is unhealthy.
//
// Postgres SQLSTATE classes 22 (data exception — bad date, overflow) and 23
// (integrity constraint — unique/FK/check) are deterministic for that entry:
// replaying it would throw again, so it becomes `failed`. Anything else
// (connection loss 08xxx, Neon cold-start timeouts, pool errors, our own
// bugs) is treated as transient and the batch returns 500 with the partial
// results, so the client keeps what landed and retries the rest.
export function isPermanentApplyError(error: unknown): boolean {
  if (!error || typeof error !== "object") return false;
  const code = (error as { code?: unknown }).code;
  if (typeof code !== "string" || code.length !== 5) return false;
  return code.startsWith("22") || code.startsWith("23");
}

export const PERMANENT_APPLY_REASON = "Couldn't apply this change";
