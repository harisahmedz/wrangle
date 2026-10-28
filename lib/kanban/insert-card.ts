// Card insert behind the outbox apply layer's `card.create` (V2 S8; before
// that, the `createCard`/`createCardForProject` Server Actions, V2 S5).
//
// Deliberately NOT in a "use server" file: every export of such a file
// becomes a publicly callable Server Action endpoint, and this helper does
// no auth. Callers must authorize (requireMembership / membershipRole) first.
import { and, asc, desc, eq, gt, isNull, ne, sql } from "drizzle-orm";
import { generateKeyBetween } from "fractional-indexing";
import { db } from "@/db";
import { cards } from "@/db/schema";
import { normalizePriority } from "@/lib/kanban/priority";

export type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];

export type InsertCardArgs = {
  columnId: string;
  boardId: string;
  projectId: string;
  title: string;
  userId: string;
  id?: string;
  position?: string;
  dueAt?: Date | null;
  isAllDay?: boolean;
  /** ROADMAP-V2 S9: wire value is 1|2|3|4|null; normalized to 1|2|3|null
   * before the insert (see lib/kanban/priority.ts). */
  priority?: 1 | 2 | 3 | 4 | null;
};

/**
 * docs/OFFLINE-OUTBOX.md §6: a client-computed fractional position may
 * already be taken by the time it replays (another device inserted at the
 * same spot). Inside the caller's `cards:<columnId>` advisory lock, returns
 * `requested` if it's free, else a key between it and the next live position
 * in the column — the incoming row is nudged, never the existing one. Keys
 * grow by a character per nudge; no rebalancing.
 */
export async function resolveFreePosition(
  tx: Tx,
  columnId: string,
  requested: string,
  excludeCardId?: string,
): Promise<string> {
  const [taken] = await tx
    .select({ id: cards.id })
    .from(cards)
    .where(
      and(
        eq(cards.columnId, columnId),
        eq(cards.position, requested),
        isNull(cards.deletedAt),
        excludeCardId ? ne(cards.id, excludeCardId) : undefined,
      ),
    )
    .limit(1);
  if (!taken) return requested;
  const [next] = await tx
    .select({ position: cards.position })
    .from(cards)
    .where(
      and(
        eq(cards.columnId, columnId),
        gt(cards.position, requested),
        isNull(cards.deletedAt),
        excludeCardId ? ne(cards.id, excludeCardId) : undefined,
      ),
    )
    .orderBy(asc(cards.position))
    .limit(1);
  return generateKeyBetween(requested, next?.position ?? null);
}

/**
 * Inserts a card under the column's advisory lock. With a caller-computed
 * `position` (the outbox's client layer), the position is nudged on
 * collision (`resolveFreePosition`); without one, appends to the bottom.
 * A duplicate `id` (a replayed mutation) is idempotent:
 * `ON CONFLICT (id) DO NOTHING`, then the already-inserted row is returned
 * instead of erroring — but only if it is the caller's own card in the same
 * project (not the column: a replayed create may find the card already
 * moved). A colliding id from anyone else returns null, so the caller fails
 * without learning anything about that row.
 */
export async function insertCard(
  args: InsertCardArgs,
): Promise<{ cardId: string; position: string } | null> {
  return db.transaction(async (tx) => {
    await tx.execute(
      sql`select pg_advisory_xact_lock(hashtext(${`cards:${args.columnId}`}::text))`,
    );
    let position: string;
    if (args.position) {
      position = await resolveFreePosition(tx, args.columnId, args.position);
    } else {
      const [last] = await tx
        .select({ position: cards.position })
        .from(cards)
        .where(and(eq(cards.columnId, args.columnId), isNull(cards.deletedAt)))
        .orderBy(desc(cards.position))
        .limit(1);
      position = generateKeyBetween(last?.position ?? null, null);
    }

    const values: typeof cards.$inferInsert = {
      columnId: args.columnId,
      boardId: args.boardId,
      projectId: args.projectId,
      title: args.title,
      position,
      dueAt: args.dueAt ?? null,
      isAllDay: args.isAllDay ?? false,
      priority: normalizePriority(args.priority ?? null),
      createdBy: args.userId,
    };
    if (args.id) values.id = args.id;

    const [created] = await tx
      .insert(cards)
      .values(values)
      .onConflictDoNothing({ target: cards.id })
      .returning({ id: cards.id, position: cards.position });
    if (created) return { cardId: created.id, position: created.position };
    if (!args.id) return null;
    const [existing] = await tx
      .select({ id: cards.id, position: cards.position })
      .from(cards)
      .where(
        and(
          eq(cards.id, args.id),
          eq(cards.projectId, args.projectId),
          eq(cards.createdBy, args.userId),
        ),
      )
      .limit(1);
    return existing ? { cardId: existing.id, position: existing.position } : null;
  });
}
