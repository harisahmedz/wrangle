// Card insert shared by createCard and createCardForProject (V2 S5).
//
// Deliberately NOT in lib/kanban/actions.ts: every export of a "use server"
// file becomes a publicly callable Server Action endpoint, and this helper
// does no auth. Callers must authorize (requireMembership) before calling.
import { and, asc, desc, eq, isNull, sql } from "drizzle-orm";
import { generateKeyBetween } from "fractional-indexing";
import { db } from "@/db";
import { cards } from "@/db/schema";
import { normalizePriority } from "@/lib/kanban/priority";

export type InsertCardArgs = {
  columnId: string;
  boardId: string;
  projectId: string;
  title: string;
  userId: string;
  id?: string;
  position?: string;
  atTop?: boolean;
  dueAt?: Date | null;
  isAllDay?: boolean;
  /** ROADMAP-V2 S9: wire value is 1|2|3|4|null; normalized to 1|2|3|null
   * before the insert (see lib/kanban/priority.ts). */
  priority?: 1 | 2 | 3 | 4 | null;
};

/**
 * Shared by `createCard` and `createCardForProject` (V2 S5 / Q12). When the
 * caller already computed a fractional `position` (the outbox's client
 * mutation layer does), inserts directly — no advisory lock needed, since
 * there's no "append to the end" race to resolve. A duplicate `id` (a
 * replayed mutation) is idempotent: `ON CONFLICT (id) DO NOTHING`, then the
 * already-inserted row is returned instead of erroring, but only if it is the
 * caller's own card in the same project (not the column: a replayed create
 * may find the card already moved). A colliding id from anyone else returns
 * null, so the caller fails without learning anything about that row. Without a
 * `position`, keeps the original advisory-lock append path.
 */
export async function insertCard(
  args: InsertCardArgs,
): Promise<{ cardId: string; position: string } | null> {
  const values = (position: string) => {
    const v: typeof cards.$inferInsert = {
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
    if (args.id) v.id = args.id;
    return v;
  };

  const ownReplay = (id: string) =>
    and(eq(cards.id, id), eq(cards.projectId, args.projectId), eq(cards.createdBy, args.userId));

  const existingById = async (): Promise<{ cardId: string; position: string } | null> => {
    if (!args.id) return null;
    const [existing] = await db
      .select({ id: cards.id, position: cards.position })
      .from(cards)
      .where(ownReplay(args.id))
      .limit(1);
    return existing ? { cardId: existing.id, position: existing.position } : null;
  };

  if (args.position) {
    const [created] = await db
      .insert(cards)
      .values(values(args.position))
      .onConflictDoNothing({ target: cards.id })
      .returning({ id: cards.id, position: cards.position });
    if (created) return { cardId: created.id, position: created.position };
    return existingById();
  }

  return db.transaction(async (tx) => {
    await tx.execute(
      sql`select pg_advisory_xact_lock(hashtext(${`cards:${args.columnId}`}::text))`,
    );
    const [edge] = await tx
      .select({ position: cards.position })
      .from(cards)
      .where(and(eq(cards.columnId, args.columnId), isNull(cards.deletedAt)))
      .orderBy(args.atTop ? asc(cards.position) : desc(cards.position))
      .limit(1);
    const position = args.atTop
      ? generateKeyBetween(null, edge?.position ?? null)
      : generateKeyBetween(edge?.position ?? null, null);
    const [created] = await tx
      .insert(cards)
      .values(values(position))
      .onConflictDoNothing({ target: cards.id })
      .returning({ id: cards.id, position: cards.position });
    if (created) return { cardId: created.id, position: created.position };
    if (!args.id) return null;
    const [existing] = await tx
      .select({ id: cards.id, position: cards.position })
      .from(cards)
      .where(ownReplay(args.id))
      .limit(1);
    return existing ? { cardId: existing.id, position: existing.position } : null;
  });
}
