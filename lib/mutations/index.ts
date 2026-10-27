import { createCard, moveCard, toggleCardComplete } from "@/lib/kanban/actions";
import type { Mutation, MutationResult } from "@/lib/mutations/types";

export type { Mutation, MutationResult } from "@/lib/mutations/types";

/**
 * V0 of the outbox's client mutation layer (docs/OFFLINE-OUTBOX.md §9.2).
 * Maps each queued kind straight onto today's Server Action; S8 swaps this
 * body for the real IndexedDB-backed queue without changing call sites.
 *
 * Only the kinds List view (V2 S4) needs are wired so far — `card.update`,
 * `checklist.set`, `learning.setStatus` and `expense.create` land in S5/S8.
 * Callers should not `await` this to drive UI (apply changes locally first,
 * call `mutate`, and treat a `{ok:false}` result as a toast).
 */
export async function mutate(m: Mutation): Promise<MutationResult> {
  try {
    switch (m.kind) {
      case "card.create": {
        if (!("columnId" in m.target)) {
          return { ok: false, error: "card.create: only a columnId target is wired in V0" };
        }
        const fd = new FormData();
        fd.set("columnId", m.target.columnId);
        fd.set("title", m.title);
        return await createCard(fd);
      }
      case "card.complete": {
        const fd = new FormData();
        fd.set("cardId", m.cardId);
        // V0 toggles server-side rather than setting `completed` explicitly
        // (OFFLINE-OUTBOX §9.2 Q2) — safe only because call sites invoke this
        // online, right after reading the card's current state.
        return await toggleCardComplete(fd);
      }
      case "card.move": {
        const fd = new FormData();
        fd.set("cardId", m.cardId);
        fd.set("toColumnId", m.toColumnId);
        fd.set("position", m.position);
        return await moveCard(fd);
      }
      default:
        return { ok: false, error: `mutations: "${m.kind}" isn't wired yet` };
    }
  } catch {
    // Per OFFLINE-OUTBOX §2.2, `mutate()` "never throws for network" — a
    // dropped connection or a stale/expired session surfaces as a normal
    // `{ok:false}` so every call site's existing `if (!res.ok)` toast
    // handles it, instead of becoming an unhandled rejection.
    return { ok: false, error: "Couldn't reach Wrangle. Try again." };
  }
}
