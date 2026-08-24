import { sql } from "drizzle-orm";
import { db } from "@/db";
import { activities, users } from "@/db/schema";

export type FeedEntry = {
  id: string;
  verb: string;
  entityType: string;
  entityId: string;
  meta: unknown;
  createdAt: Date;
  actorName: string | null;
};

export async function projectFeed(
  projectId: string,
  limit = 50,
): Promise<FeedEntry[]> {
  const rows = await db
    .select({
      id: activities.id,
      verb: activities.verb,
      entityType: activities.entityType,
      entityId: activities.entityId,
      meta: activities.meta,
      createdAt: activities.createdAt,
      actorName: users.name,
    })
    .from(activities)
    .leftJoin(users, sql`${activities.actorId} = ${users.id}`)
    .where(sql`${activities.projectId} = ${projectId}`)
    .orderBy(sql`${activities.createdAt} desc`)
    .limit(limit);
  return rows;
}

export async function cardHistory(
  projectId: string,
  cardId: string,
  limit = 12,
): Promise<FeedEntry[]> {
  const rows = await db
    .select({
      id: activities.id,
      verb: activities.verb,
      entityType: activities.entityType,
      entityId: activities.entityId,
      meta: activities.meta,
      createdAt: activities.createdAt,
      actorName: users.name,
    })
    .from(activities)
    .leftJoin(users, sql`${activities.actorId} = ${users.id}`)
    .where(
      sql`${activities.projectId} = ${projectId} and ${activities.entityType} = 'card' and ${activities.entityId} = ${cardId}`,
    )
    .orderBy(sql`${activities.createdAt} desc`)
    .limit(limit);
  return rows;
}

export function describeEntry(e: FeedEntry): string {
  const who = e.actorName ?? "Someone";
  switch (`${e.entityType}:${e.verb}`) {
    case "card:created":
      return `${who} created this card`;
    case "card:moved":
      return `${who} moved the card${(e.meta as { to_done?: boolean })?.to_done ? "" : ""}`;
    case "card:completed":
      return `${who} marked it done`;
    case "card:reopened":
      return `${who} reopened it`;
    case "card:archived":
      return `${who} deleted it`;
    case "card:promoted":
      return `${who} promoted it from Ideas`;
    case "comment:created":
      return `${who} commented`;
    case "membership:joined":
      return `${who} joined the project`;
    case "membership:left":
      return `${who} left the project`;
    case "membership:removed":
      return `${who} was removed`;
    case "membership:role-changed": {
      const to = (e.meta as { to?: string })?.to;
      return `${who}'s role changed${to ? ` to ${to}` : ""}`;
    }
    case "membership:ownership-transferred":
      return `Ownership went to ${who}`;
    case "invite:created":
      return `${who} created an invite`;
    case "column:created":
      return `${who} added a column`;
    case "column:deleted":
      return `${who} deleted a column`;
    default:
      return `${who} · ${e.verb}`;
  }
}
