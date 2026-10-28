import { createCard, createCardForProject, moveCard, toggleCardComplete } from "@/lib/kanban/actions";
import { setLearningStatus } from "@/lib/actions/learning";
import type { Mutation, MutationResult } from "@/lib/mutations/types";

export type { Mutation, MutationResult } from "@/lib/mutations/types";

/**
 * V0 of the outbox's client mutation layer (docs/OFFLINE-OUTBOX.md §9.2).
 * Maps each queued kind straight onto today's Server Action; S8 swaps this
 * body for the real IndexedDB-backed queue without changing call sites.
 *
 * Only the kinds List view (V2 S4), Learn list (V2 S4b) and Quick Add v2
 * (V2 S5) need are wired so far — `card.update`, `checklist.set` and
 * `expense.create` land in S8. Callers should not `await` this to drive UI
 * (apply changes locally first, call `mutate`, and treat a `{ok:false}`
 * result as a toast).
 */
export async function mutate(m: Mutation): Promise<MutationResult> {
  try {
    switch (m.kind) {
      case "card.create": {
        const fd = new FormData();
        fd.set("id", m.id);
        fd.set("title", m.title);
        // TODO(S8): don't forward `m.position` yet. `insertCard`'s
        // position-given path inserts outside the `cards:<columnId>`
        // advisory lock, so a collision with `cards_column_position_uq`
        // would surface as a raw DB error instead of the re-home-on-conflict
        // resolution docs/OFFLINE-OUTBOX.md §6 specifies (inside the lock).
        // Until that's built, every create goes through the server-computed
        // append path; the schema field stays for S8 to wire up.
        if (m.dueAt) fd.set("dueAt", m.dueAt);
        if (m.isAllDay !== undefined) fd.set("isAllDay", String(m.isAllDay));
        if (m.priority !== undefined) fd.set("priority", m.priority === null ? "" : String(m.priority));
        if ("columnId" in m.target) {
          fd.set("columnId", m.target.columnId);
          return await createCard(fd);
        }
        // §9.2.7: the project token resolves to {projectId, boardKind} —
        // the server picks that board's first column, never the client.
        fd.set("projectId", m.target.projectId);
        fd.set("boardKind", m.target.boardKind);
        return await createCardForProject(fd);
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
      case "learning.setStatus": {
        const fd = new FormData();
        fd.set("itemId", m.itemId);
        fd.set("status", m.status);
        // Already a true set server-side (setLearningStatus writes the
        // given status, never flips), so no V0 toggle caveat applies here.
        return await setLearningStatus(fd);
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
