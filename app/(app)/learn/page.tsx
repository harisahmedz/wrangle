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
import { requireUser } from "@/lib/authz";
import { todayKey } from "@/lib/money";
import { resolveInitialLayout } from "@/lib/kanban/view-resolve";
import { parseUserPrefs, LEARN_VIEW_KEY } from "@/lib/validation/prefs";
import { PageHeader } from "@/components/ui/page-header";
import { AddLearningButton } from "@/components/learn/add-learning";
import { LearnSwitcher } from "@/components/learn/learn-switcher";
import {
  LearnDetailSheet,
} from "@/components/learn/detail-sheet";

type Props = { searchParams: Promise<{ item?: string; view?: string }> };

export const metadata: Metadata = { title: "Learn" };

export default async function LearnPage({ searchParams }: Props) {
  const userId = await requireUser();

  const [user] = await db
    .select({ timezone: users.timezone, prefs: users.prefs })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);
  const timeZone = user?.timezone || "UTC";
  const learnPref = parseUserPrefs(user?.prefs).views?.[LEARN_VIEW_KEY];

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

  const rows = items.map((item) => ({
    id: item.id,
    title: item.title,
    type: item.type,
    status: item.status,
    sourceUrl: item.sourceUrl,
    whyNote: item.whyNote,
    targetDate: item.targetDate,
    progressPct: item.progressPct,
    hoursLogged: String(item.hoursLogged),
  }));

  const sp = await searchParams;
  const detailId = sp.item;
  const initialLayout = resolveInitialLayout(sp.view, learnPref);
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
      <PageHeader title="Learn" actions={<AddLearningButton />} />

      <LearnSwitcher items={rows} initialLayout={initialLayout} />

      {detail && <LearnDetailSheet {...detail} />}
    </div>
  );
}
