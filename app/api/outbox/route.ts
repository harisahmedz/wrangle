import { auth } from "@/auth";
import { applyMutation } from "@/lib/outbox/apply";
import { PERMANENT_APPLY_REASON, isPermanentApplyError } from "@/lib/outbox/errors";
import type { EntryResult } from "@/lib/outbox/types";
import { outboxBatchSchema } from "@/lib/validation/outbox";

// The outbox replay endpoint (docs/OFFLINE-OUTBOX.md §2.1 option B, §4).
// Uses `auth()` directly, never `requireUser()`: its `redirect("/signin")`
// would turn into a 307 here, and the client needs a clean 401 to pause the
// queue (§4.4). Entries are applied in order; each gets its own result so a
// poison entry doesn't block the ones after it — a deterministic DB error
// (`isPermanentApplyError`) fails that entry alone, while a connection or
// timeout-class error returns 500 with the results so far, and the client
// retries only what's left (replaying applied entries is idempotent, §5.1).
//
// Route Handlers don't get Server Actions' built-in origin check, so this
// one enforces same-origin itself (S8 review L2): the body must be JSON and
// `Origin` must match the host the request came in on.
function sameOrigin(request: Request): boolean {
  const origin = request.headers.get("origin");
  const host = request.headers.get("x-forwarded-host") ?? request.headers.get("host");
  if (!origin || !host) return false;
  try {
    return new URL(origin).host === host;
  } catch {
    return false;
  }
}

export async function POST(request: Request) {
  if (!request.headers.get("content-type")?.toLowerCase().includes("application/json") || !sameOrigin(request)) {
    return Response.json({ error: "forbidden" }, { status: 403 });
  }

  const session = await auth();
  const userId = session?.user?.id;
  if (!userId) {
    return Response.json({ error: "unauthenticated" }, { status: 401 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "invalid" }, { status: 400 });
  }
  const parsed = outboxBatchSchema.safeParse(body);
  if (!parsed.success) {
    return Response.json({ error: "invalid" }, { status: 400 });
  }

  const results: EntryResult[] = [];
  for (const entry of parsed.data.entries) {
    try {
      const result = await applyMutation(userId, entry);
      results.push({ id: entry.id, ...result });
    } catch (error) {
      console.error("outbox: apply failed", entry.mutation.kind, error);
      if (isPermanentApplyError(error)) {
        results.push({ id: entry.id, status: "failed", reason: PERMANENT_APPLY_REASON });
        continue;
      }
      return Response.json({ error: "server", results }, { status: 500 });
    }
  }
  return Response.json({ results });
}
