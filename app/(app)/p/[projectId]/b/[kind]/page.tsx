import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { and, asc, eq, inArray, isNull } from "drizzle-orm";
import { db } from "@/db";
import {
  boards,
  columns,
  cards as cardsTable,
  cardAssignees,
  cardLabels,
  checklistItems,
  comments,
  labels,
  memberships,
  users,
  attachments,
} from "@/db/schema";
import type { BoardKind } from "@/db/schema";
import { hasMinRole, requireMembership } from "@/lib/authz";
import { renderMarkdown } from "@/lib/markdown";
import { isCloudinaryConfigured } from "@/lib/cloudinary";
import { cardHistory, describeEntry } from "@/lib/kanban/activity";
import { BoardTabs } from "@/components/kanban/board-tabs";
import { BoardView } from "@/components/kanban/board-view";
import { CardDetail } from "@/components/kanban/card-detail";

type Props = {
  params: Promise<{ projectId: string; kind: string }>;
  searchParams: Promise<{
    card?: string;
    q?: string;
    label?: string | string[];
    assignee?: string | string[];
    due?: string;
  }>;
};

export const metadata: Metadata = { title: "Board" };

const KINDS: BoardKind[] = ["todo", "ideas", "work"];

export default async function BoardPage({ params, searchParams }: Props) {
  const { projectId, kind } = await params;
  if (!KINDS.includes(kind as BoardKind)) notFound();
  const boardKind = kind as BoardKind;

  const ctx = await requireMembership(projectId);

  const [board] = await db
    .select()
    .from(boards)
    .where(and(eq(boards.projectId, projectId), eq(boards.kind, boardKind)))
    .limit(1);
  if (!board) notFound();

  const boardColumns = await db
    .select({
      id: columns.id,
      name: columns.name,
      position: columns.position,
      color: columns.color,
      wipLimit: columns.wipLimit,
      isDone: columns.isDone,
      isCollapsed: columns.isCollapsed,
    })
    .from(columns)
    .where(eq(columns.boardId, board.id))
    .orderBy(asc(columns.position));

  const boardCards = await db
    .select({
      id: cardsTable.id,
      columnId: cardsTable.columnId,
      title: cardsTable.title,
      description: cardsTable.description,
      dueAt: cardsTable.dueAt,
      completedAt: cardsTable.completedAt,
      position: cardsTable.position,
      coverColor: cardsTable.coverColor,
      impact: cardsTable.impact,
      effort: cardsTable.effort,
    })
    .from(cardsTable)
    .where(
      and(
        eq(cardsTable.boardId, board.id),
        eq(cardsTable.projectId, projectId),
        isNull(cardsTable.deletedAt),
      ),
    )
    .orderBy(asc(cardsTable.position));

  const cardIds = boardCards.map((c) => c.id);
  const chipLabelRows =
    cardIds.length > 0
      ? await db
          .select({
            cardId: cardLabels.cardId,
            labelId: cardLabels.labelId,
            color: labels.color,
          })
          .from(cardLabels)
          .innerJoin(labels, eq(cardLabels.labelId, labels.id))
          .where(inArray(cardLabels.cardId, cardIds))
      : [];
  const assigneeRows =
    cardIds.length > 0
      ? await db
          .select({ cardId: cardAssignees.cardId, userId: cardAssignees.userId })
          .from(cardAssignees)
          .where(inArray(cardAssignees.cardId, cardIds))
      : [];

  const labelDots = new Map<string, string[]>();
  const labelIdsByCard = new Map<string, string[]>();
  for (const row of chipLabelRows) {
    const dots = labelDots.get(row.cardId) ?? [];
    if (!dots.includes(row.color)) dots.push(row.color);
    labelDots.set(row.cardId, dots);
    const ids = labelIdsByCard.get(row.cardId) ?? [];
    ids.push(row.labelId);
    labelIdsByCard.set(row.cardId, ids);
  }
  const assigneeIdsByCard = new Map<string, string[]>();
  for (const row of assigneeRows) {
    const ids = assigneeIdsByCard.get(row.cardId) ?? [];
    ids.push(row.userId);
    assigneeIdsByCard.set(row.cardId, ids);
  }

  const [filterLabels, filterMembers] = await Promise.all([
    db
      .select({ id: labels.id, name: labels.name })
      .from(labels)
      .where(eq(labels.projectId, projectId)),
    db
      .select({ userId: memberships.userId, name: users.name })
      .from(memberships)
      .innerJoin(users, eq(memberships.userId, users.id))
      .where(eq(memberships.projectId, projectId)),
  ]);

  const sp = await searchParams;
  const detailCardId = sp.card;

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <BoardTabs projectId={projectId} active={boardKind} />
        <div className="flex items-center gap-3">
          <Link
            href={`/p/${projectId}/members`}
            className="rounded-md border border-border px-3 py-1.5 text-sm text-muted transition-colors hover:text-text"
          >
            Members
          </Link>
          <Link
            href={`/p/${projectId}/activity`}
            className="rounded-md border border-border px-3 py-1.5 text-sm text-muted transition-colors hover:text-text"
          >
            Activity
          </Link>
          <form action={`/p/${projectId}/search`} className="contents">
            <input
              type="search"
              name="q"
              placeholder="Search…"
              aria-label="Search this project"
              className="h-9 w-36 rounded-md border border-border bg-surface px-3 text-sm sm:w-48"
            />
          </form>
          <p className="hidden text-sm text-muted lg:block">
            Drag cards · long-press on touch · space to lift with keyboard
          </p>
        </div>
      </div>

      <Suspense fallback={null}>
        <BoardView
          projectId={projectId}
          boardId={board.id}
          boardKind={boardKind}
          columns={boardColumns}
          filterLabels={filterLabels}
          filterMembers={filterMembers}
          cards={boardCards.map((c) => ({
            id: c.id,
            columnId: c.columnId,
            title: c.title,
            hasDescription: Boolean(c.description),
            dueAt: c.dueAt ? c.dueAt.toISOString() : null,
            completedAt: c.completedAt ? c.completedAt.toISOString() : null,
            position: c.position,
            coverColor: c.coverColor,
            labelColors: labelDots.get(c.id) ?? [],
            labelIds: labelIdsByCard.get(c.id) ?? [],
            assigneeIds: assigneeIdsByCard.get(c.id) ?? [],
            impact: c.impact,
            effort: c.effort,
          }))}
        />
      </Suspense>

      {detailCardId && (
        <CardDetailView
          projectId={projectId}
          boardKind={boardKind}
          cardId={detailCardId}
          userId={ctx.userId}
          role={ctx.role}
        />
      )}
    </div>
  );
}

async function CardDetailView({
  projectId,
  boardKind,
  cardId,
  userId,
  role,
}: {
  projectId: string;
  boardKind: BoardKind;
  cardId: string;
  userId: string;
  role: "owner" | "admin" | "member" | "viewer";
}) {
  const [row] = await db
    .select()
    .from(cardsTable)
    .where(
      and(
        eq(cardsTable.id, cardId),
        eq(cardsTable.projectId, projectId),
        isNull(cardsTable.deletedAt),
      ),
    )
    .limit(1);
  if (!row) notFound();

  const history = await cardHistory(projectId, row.id, 10);

  const [checklist, projectLabels, activeLabelRows, members, activeAssigneeRows, commentRows, attachmentRows] =
    await Promise.all([
      db
        .select({
          id: checklistItems.id,
          text: checklistItems.text,
          isDone: checklistItems.isDone,
        })
        .from(checklistItems)
        .where(eq(checklistItems.cardId, row.id))
        .orderBy(asc(checklistItems.position)),
      db
        .select({ id: labels.id, name: labels.name, color: labels.color })
        .from(labels)
        .where(eq(labels.projectId, projectId)),
      db
        .select({ labelId: cardLabels.labelId })
        .from(cardLabels)
        .where(eq(cardLabels.cardId, row.id)),
      db
        .select({
          userId: memberships.userId,
          name: users.name,
          image: users.image,
        })
        .from(memberships)
        .innerJoin(users, eq(memberships.userId, users.id))
        .where(eq(memberships.projectId, projectId)),
      db
        .select({ userId: cardAssignees.userId })
        .from(cardAssignees)
        .where(eq(cardAssignees.cardId, row.id)),
      db
        .select({
          id: comments.id,
          body: comments.body,
          createdAt: comments.createdAt,
          authorName: users.name,
          authorId: comments.authorId,
        })
        .from(comments)
        .innerJoin(users, eq(comments.authorId, users.id))
        .where(and(eq(comments.cardId, row.id), isNull(comments.deletedAt)))
        .orderBy(asc(comments.createdAt)),
      db
        .select({
          id: attachments.id,
          url: attachments.url,
          mime: attachments.mime,
          bytes: attachments.bytes,
          uploadedBy: attachments.uploadedBy,
        })
        .from(attachments)
        .where(eq(attachments.cardId, row.id))
        .orderBy(asc(attachments.createdAt)),
    ]);

  return (
    <CardDetail
      key={row.id}
      projectId={projectId}
      boardKind={boardKind}
      isIdeasBoard={boardKind === "ideas"}
      canManageLabels={hasMinRole(role, "admin")}
      cloudinaryReady={isCloudinaryConfigured()}
      card={{
        id: row.id,
        title: row.title,
        description: row.description,
        descriptionHtml: renderMarkdown(row.description),
        dueAt: row.dueAt,
        isAllDay: row.isAllDay,
        completedAt: row.completedAt,
        impact: row.impact,
        effort: row.effort,
        coverColor: row.coverColor,
        createdAt: row.createdAt.toISOString(),
        updatedAt: row.updatedAt.toISOString(),
      }}
      history={history.map((h) => ({
        text: describeEntry(h),
        when: h.createdAt.toISOString(),
      }))}
      checklist={checklist}
      labels={projectLabels}
      activeLabelIds={activeLabelRows.map((l) => l.labelId)}
      members={members}
      activeAssigneeIds={activeAssigneeRows.map((a) => a.userId)}
      viewerName={members.find((m) => m.userId === userId)?.name ?? undefined}
      comments={commentRows.map((c) => ({
        id: c.id,
        authorName: c.authorName ?? "Member",
        bodyHtml: renderMarkdown(c.body),
        createdAt: c.createdAt.toISOString(),
        isMine: c.authorId === userId,
        canDelete: c.authorId === userId || hasMinRole(role, "admin"),
      }))}
      attachments={attachmentRows.map((a) => ({
        id: a.id,
        url: a.url,
        mime: a.mime,
        bytes: a.bytes,
        canDelete: a.uploadedBy === userId || hasMinRole(role, "admin"),
      }))}
    />
  );
}
