import type { Metadata } from "next";
import Link from "next/link";
import { and, asc, eq, isNull, sql } from "drizzle-orm";
import { db } from "@/db";
import {
  activities,
  boards,
  cards,
  memberships,
  projects,
} from "@/db/schema";
import type { BoardKind } from "@/db/schema";
import { requireUser } from "@/lib/authz";
import { EmptyState } from "@/components/ui/empty-state";

export const metadata: Metadata = { title: "Boards" };

const KINDS: { kind: BoardKind; label: string }[] = [
  { kind: "todo", label: "To-Do" },
  { kind: "ideas", label: "Ideas" },
  { kind: "work", label: "Work" },
];

const EMPTY_OPEN: Record<BoardKind, number> = { todo: 0, ideas: 0, work: 0 };

function relativeLabel(date: Date, now: Date): string {
  const minutes = Math.floor(
    Math.max(0, now.getTime() - date.getTime()) / 60_000,
  );
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days}d ago`;
  return `${Math.floor(days / 30)}mo ago`;
}

export default async function BoardsPage() {
  const userId = await requireUser();

  const myProjects = await db
    .select({
      id: projects.id,
      name: projects.name,
      emoji: projects.emoji,
      color: projects.color,
      isPersonal: projects.isPersonal,
    })
    .from(memberships)
    .innerJoin(projects, eq(memberships.projectId, projects.id))
    .where(and(eq(memberships.userId, userId), isNull(projects.deletedAt)))
    .orderBy(asc(projects.position));

  const openCounts = await db
    .select({
      projectId: cards.projectId,
      kind: boards.kind,
      count: sql<number>`count(*)::int`,
    })
    .from(cards)
    .innerJoin(boards, eq(cards.boardId, boards.id))
    .innerJoin(
      memberships,
      and(
        eq(memberships.projectId, cards.projectId),
        eq(memberships.userId, userId),
      ),
    )
    .where(and(isNull(cards.deletedAt), isNull(cards.completedAt)))
    .groupBy(cards.projectId, boards.kind);

  const activityRows = await db
    .select({
      projectId: activities.projectId,
      lastAt: sql<Date>`max(${activities.createdAt})`,
    })
    .from(activities)
    .innerJoin(
      memberships,
      and(
        eq(memberships.projectId, activities.projectId),
        eq(memberships.userId, userId),
      ),
    )
    .groupBy(activities.projectId);

  const now = new Date();

  const openByProject = new Map<string, Record<BoardKind, number>>();
  for (const row of openCounts) {
    const entry = openByProject.get(row.projectId) ?? { ...EMPTY_OPEN };
    entry[row.kind] = row.count;
    openByProject.set(row.projectId, entry);
  }

  const lastByProject = new Map<string, string>();
  for (const row of activityRows) {
    if (!row.lastAt) continue;
    lastByProject.set(row.projectId, relativeLabel(new Date(row.lastAt), now));
  }

  return (
    <div className="space-y-5">
      <h1 className="text-2xl font-bold tracking-tight">Boards</h1>
      {myProjects.length === 0 ? (
        <EmptyState
          icon="🗂️"
          title="No projects yet"
          description="Create a project from the sidebar — each one gets To-Do, Ideas, and Work boards."
        />
      ) : (
        <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {myProjects.map((p) => (
            <li
              key={p.id}
              className="flex flex-col gap-3 rounded-xl border border-border bg-surface p-4 transition-colors hover:border-muted/40"
            >
              <div className="flex min-w-0 items-center gap-2.5">
                <span
                  aria-hidden
                  className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-base"
                  style={{
                    backgroundColor: p.color ? `${p.color}22` : undefined,
                  }}
                >
                  {p.emoji ?? "📁"}
                </span>
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium">{p.name}</p>
                  <p className="truncate text-xs text-muted">
                    {p.isPersonal ? "Personal space" : "Shared project"} ·{" "}
                    {lastByProject.has(p.id)
                      ? `Active ${lastByProject.get(p.id)}`
                      : "No activity yet"}
                  </p>
                </div>
              </div>
              <div className="mt-auto grid grid-cols-3 gap-1.5">
                {KINDS.map((k) => (
                  <Link
                    key={k.kind}
                    href={`/p/${p.id}/b/${k.kind}`}
                    className="flex min-h-11 flex-col justify-center gap-0.5 rounded-lg border border-border px-2.5 py-1.5 transition-colors hover:bg-surface-2"
                  >
                    <span className="text-xs font-medium">{k.label}</span>
                    <span className="text-xs tabular-nums text-muted">
                      {(openByProject.get(p.id) ?? EMPTY_OPEN)[k.kind]} open
                    </span>
                  </Link>
                ))}
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
