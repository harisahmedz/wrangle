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
}> = [
  { status: "want", label: "Want to learn", hint: "The backlog of curiosity" },
  { status: "learning", label: "Learning", hint: "In progress now" },
  { status: "learned", label: "Learned", hint: "Finished & celebrated" },
];

export default async function LearnPage({ searchParams }: Props) {
  const userId = await requireUser();

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
            .where(eq(learningMilestones.itemId, row.id))
            .orderBy(asc(learningMilestones.position)),
          db
            .select({
              id: learningSessions.id,
              happenedOn: learningSessions.happenedOn,
              minutes: learningSessions.minutes,
              note: learningSessions.note,
            })
            .from(learningSessions)
            .where(eq(learningSessions.itemId, row.id))
            .orderBy(desc(learningSessions.happenedOn))
            .limit(30),
          db
            .select({
              id: learningResources.id,
              url: learningResources.url,
              title: learningResources.title,
            })
            .from(learningResources)
            .where(eq(learningResources.itemId, row.id))
            .orderBy(desc(learningResources.createdAt)),
          db
            .select({
              id: learningNotes.id,
              body: learningNotes.body,
              createdAt: learningNotes.createdAt,
            })
            .from(learningNotes)
            .where(eq(learningNotes.itemId, row.id))
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
        todayKey: todayKey("UTC"),
      };
    }
  }

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold tracking-tight">Learn</h1>
        <AddLearningButton />
      </div>

      <div className="-mx-4 grid gap-4 overflow-x-auto px-4 sm:grid-cols-3 md:-mx-8 md:px-8">
        {COLUMNS.map((col) => (
          <section key={col.status} className="min-w-0 space-y-2.5 rounded-xl bg-surface-2/60 p-2.5">
            <div className="flex items-baseline justify-between px-1">
              <h2 className="text-sm font-semibold">{col.label}</h2>
              <span className="text-xs text-muted">
                {grouped.get(col.status)?.length ?? 0}
              </span>
            </div>
            <p className="hidden px-1 text-[11px] text-muted sm:block">{col.hint}</p>
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
                <p className="rounded-lg border border-dashed border-border p-3 text-center text-xs text-muted">
                  Empty
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
