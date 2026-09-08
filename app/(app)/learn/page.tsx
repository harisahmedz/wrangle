import type { Metadata } from "next";
import { and, asc, desc, eq, isNull } from "drizzle-orm";
import { db } from "@/db";
import {
  learningItems,
  learningMilestones,
  learningNotes,
  learningResources,
  learningSessions,
  memberships,
  projects,
  users,
} from "@/db/schema";
import type { learningStatus } from "@/db/schema";
import { requireUser } from "@/lib/authz";
import { todayKey } from "@/lib/money";
import { AddLearningButton } from "@/components/learn/add-learning";
import { PipelineCard } from "@/components/learn/pipeline-card";
import {
  LearnDetailSheet,
} from "@/components/learn/detail-sheet";

type Props = { searchParams: Promise<{ item?: string }> };

export const metadata: Metadata = { title: "Learn" };

const COLUMNS: Array<{
  status: (typeof learningStatus.enumValues)[number];
  label: string;
  hint: string;
  empty: string;
}> = [
  {
    status: "want",
    label: "Want to learn",
    hint: "The backlog of curiosity",
    empty: "Add something you want to learn",
  },
  {
    status: "learning",
    label: "Learning",
    hint: "In progress now",
    empty: "Move an item here when you start it",
  },
  {
    status: "learned",
    label: "Learned",
    hint: "Finished & celebrated",
    empty: "Finished items land here",
  },
];

export default async function LearnPage({ searchParams }: Props) {
  const userId = await requireUser();

  const [user] = await db
    .select({ timezone: users.timezone })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);
  const timeZone = user?.timezone || "UTC";

  const items = await db
    .select()
    .from(learningItems)
    .where(
      and(
        eq(learningItems.userId, userId),
        isNull(learningItems.deletedAt),
      ),
    )
    .orderBy(asc(learningItems.position));

  const grouped = new Map<string, typeof items>();
  for (const col of COLUMNS) grouped.set(col.status, []);
  for (const item of items) {
    grouped.get(item.status)?.push(item);
  }

  const detailId = (await searchParams).item;
  let detail = null;

  if (detailId) {
    const [row] = await db
      .select()
      .from(learningItems)
      .where(
        and(
          eq(learningItems.id, detailId),
          eq(learningItems.userId, userId),
          isNull(learningItems.deletedAt),
        ),
      )
      .limit(1);

    if (row) {
      const [milestones, sessions, resources, notes, memberProjects] =
        await Promise.all([
          db
            .select({
              id: learningMilestones.id,
              text: learningMilestones.text,
              isDone: learningMilestones.isDone,
            })
            .from(learningMilestones)
            .where(
              and(
                eq(learningMilestones.itemId, row.id),
                isNull(learningMilestones.deletedAt),
              ),
            )
            .orderBy(asc(learningMilestones.position)),
          db
            .select({
              id: learningSessions.id,
              happenedOn: learningSessions.happenedOn,
              minutes: learningSessions.minutes,
              note: learningSessions.note,
            })
            .from(learningSessions)
            .where(
              and(
                eq(learningSessions.itemId, row.id),
                isNull(learningSessions.deletedAt),
              ),
            )
            .orderBy(desc(learningSessions.happenedOn))
            .limit(30),
          db
            .select({
              id: learningResources.id,
              url: learningResources.url,
              title: learningResources.title,
            })
            .from(learningResources)
            .where(
              and(
                eq(learningResources.itemId, row.id),
                isNull(learningResources.deletedAt),
              ),
            )
            .orderBy(desc(learningResources.createdAt)),
          db
            .select({
              id: learningNotes.id,
              body: learningNotes.body,
              createdAt: learningNotes.createdAt,
            })
            .from(learningNotes)
            .where(
              and(
                eq(learningNotes.itemId, row.id),
                isNull(learningNotes.deletedAt),
              ),
            )
            .orderBy(desc(learningNotes.createdAt))
            .limit(50),
          db
            .select({ id: projects.id, name: projects.name })
            .from(memberships)
            .innerJoin(projects, eq(memberships.projectId, projects.id))
            .where(
              and(
                eq(memberships.userId, userId),
                isNull(projects.deletedAt),
              ),
            ),
        ]);

      detail = {
        projectIdBase: "/learn",
        item: {
          id: row.id,
          title: row.title,
          type: row.type,
          status: row.status,
          sourceUrl: row.sourceUrl,
          whyNote: row.whyNote,
          targetDate: row.targetDate,
          progressPct: row.progressPct,
          hoursLogged: String(row.hoursLogged),
        },
        milestones,
        sessions: sessions.map((s) => ({
          ...s,
          happenedOn: s.happenedOn,
        })),
        resources,
        notes: notes.map((n) => ({
          id: n.id,
          body: n.body,
          createdAt: n.createdAt.toISOString(),
        })),
        projects: memberProjects,
        todayKey: todayKey(timeZone),
      };
    }
  }

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold tracking-tight">Learn</h1>
        <AddLearningButton />
      </div>

      <div className="-mx-4 grid snap-x snap-mandatory grid-flow-col auto-cols-[88%] gap-4 overflow-x-auto px-4 pb-2 sm:grid-flow-row sm:auto-cols-auto sm:grid-cols-3 sm:snap-none md:-mx-8 md:px-8">
        {COLUMNS.map((col) => (
          <section key={col.status} className="min-w-0 snap-start space-y-2.5 rounded-xl border border-border bg-surface p-2.5">
            <div className="flex items-baseline justify-between px-1">
              <h2 className="text-sm font-semibold">{col.label}</h2>
              <span className="text-xs tabular-nums text-muted">
                {grouped.get(col.status)?.length ?? 0}
              </span>
            </div>
            <p className="px-1 text-xs text-muted">{col.hint}</p>
            <div className="space-y-2">
              {(grouped.get(col.status) ?? []).map((item) => (
                <PipelineCard
                  key={item.id}
                  item={{
                    id: item.id,
                    title: item.title,
                    type: item.type,
                    status: item.status,
                    sourceUrl: item.sourceUrl,
                    whyNote: item.whyNote,
                    targetDate: item.targetDate,
                    progressPct: item.progressPct,
                    hoursLogged: String(item.hoursLogged),
                  }}
                />
              ))}
              {(grouped.get(col.status) ?? []).length === 0 && (
                <p className="rounded-lg border border-dashed border-border px-3 py-4 text-center text-xs text-muted">
                  {col.empty}
                </p>
              )}
            </div>
          </section>
        ))}
      </div>

      {detail && <LearnDetailSheet {...detail} />}
    </div>
  );
}
