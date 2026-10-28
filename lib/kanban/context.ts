// Row-context lookups and the activity-log insert shared by the kanban
// Server Actions (lib/kanban/actions.ts) and the outbox apply layer
// (lib/outbox/apply.ts, V2 S8). A plain module, not "use server": none of
// these check auth, so they must never be callable endpoints.
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { activities, boards, cards, columns } from "@/db/schema";

export async function columnContext(columnId: string) {
  const [row] = await db
    .select({
      projectId: boards.projectId,
      boardId: columns.boardId,
      name: columns.name,
      position: columns.position,
      isDone: columns.isDone,
      deletedAt: columns.deletedAt,
    })
    .from(columns)
    .innerJoin(boards, eq(columns.boardId, boards.id))
    .where(eq(columns.id, columnId))
    .limit(1);
  return row ?? null;
}

export async function cardContext(cardId: string) {
  const [row] = await db
    .select({
      projectId: cards.projectId,
      boardId: cards.boardId,
      columnId: cards.columnId,
      title: cards.title,
      position: cards.position,
      completedAt: cards.completedAt,
      completedBy: cards.completedBy,
      createdAt: cards.createdAt,
      deletedAt: cards.deletedAt,
    })
    .from(cards)
    .where(eq(cards.id, cardId))
    .limit(1);
  return row ?? null;
}

export async function logActivity(
  projectId: string,
  actorId: string,
  entityType: string,
  entityId: string,
  verb: string,
  meta?: Record<string, unknown>,
) {
  await db.insert(activities).values({
    projectId,
    actorId,
    entityType,
    entityId,
    verb,
    meta,
  });
}
