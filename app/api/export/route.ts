import { eq, inArray, or } from "drizzle-orm";
import { auth } from "@/auth";
import { db } from "@/db";
import {
  accounts,
  activities,
  attachments,
  boards,
  cardAssignees,
  cardFocuses,
  cardLabels,
  cardLinks,
  cards,
  checklistItems,
  columns,
  comments,
  dayReviews,
  expenseCategories,
  expenses,
  invites,
  labels,
  learningItems,
  learningMilestones,
  learningNotes,
  learningResources,
  learningSessions,
  memberships,
  projects,
  users,
} from "@/db/schema";

type ExportFormat = "json" | "cards.csv" | "expenses.csv" | "learning.csv" | "reviews.csv";

function csvValue(value: unknown): string {
  if (value == null) return "";
  const text = value instanceof Date ? value.toISOString() : String(value);
  return `"${text.replaceAll('"', '""')}"`;
}

function toCsv(rows: Array<Record<string, unknown>>, columns: string[]): string {
  const header = columns.map(csvValue).join(",");
  const body = rows.map((row) => columns.map((key) => csvValue(row[key])).join(","));
  return [header, ...body].join("\r\n");
}

function download(body: string, contentType: string, filename: string) {
  return new Response(body, {
    headers: {
      "Cache-Control": "private, no-store",
      "Content-Disposition": `attachment; filename="${filename}"`,
      "Content-Type": contentType,
    },
  });
}

async function loadExport(userId: string) {
  const [profile, accountRows, membershipRows, ownedProjectRows, categoryRows, expenseRows, learningRows, reviewRows] =
    await Promise.all([
      db
        .select({
          id: users.id,
          name: users.name,
          email: users.email,
          image: users.image,
          timezone: users.timezone,
          theme: users.theme,
          currency: users.currency,
          createdAt: users.createdAt,
        })
        .from(users)
        .where(eq(users.id, userId))
        .limit(1),
      db
        .select({ provider: accounts.provider, providerAccountId: accounts.providerAccountId })
        .from(accounts)
        .where(eq(accounts.userId, userId)),
      db
        .select({
          projectId: memberships.projectId,
          role: memberships.role,
          position: memberships.position,
          joinedAt: memberships.joinedAt,
          projectName: projects.name,
          projectEmoji: projects.emoji,
          projectColor: projects.color,
          projectArchivedAt: projects.archivedAt,
          projectDeletedAt: projects.deletedAt,
        })
        .from(memberships)
        .innerJoin(projects, eq(memberships.projectId, projects.id))
        .where(eq(memberships.userId, userId)),
      db.select().from(projects).where(eq(projects.ownerId, userId)),
      db.select().from(expenseCategories).where(eq(expenseCategories.userId, userId)),
      db
        .select({
          id: expenses.id,
          projectId: expenses.projectId,
          categoryId: expenses.categoryId,
          category: expenseCategories.name,
          amountMinor: expenses.amountMinor,
          currency: expenses.currency,
          spentOn: expenses.spentOn,
          note: expenses.note,
          paymentMethod: expenses.paymentMethod,
          receiptUrl: expenses.receiptUrl,
          createdAt: expenses.createdAt,
          updatedAt: expenses.updatedAt,
          deletedAt: expenses.deletedAt,
        })
        .from(expenses)
        .innerJoin(expenseCategories, eq(expenses.categoryId, expenseCategories.id))
        .where(eq(expenses.userId, userId)),
      db.select().from(learningItems).where(eq(learningItems.userId, userId)),
      db.select().from(dayReviews).where(eq(dayReviews.userId, userId)),
    ]);

  const ownedProjectIds = ownedProjectRows.map((project) => project.id);
  const boardRows = ownedProjectIds.length
    ? await db.select().from(boards).where(inArray(boards.projectId, ownedProjectIds))
    : [];
  const boardIds = boardRows.map((board) => board.id);
  const columnRows = boardIds.length
    ? await db.select().from(columns).where(inArray(columns.boardId, boardIds))
    : [];
  const cardRows = await db
    .select()
    .from(cards)
    .where(
      ownedProjectIds.length
        ? or(inArray(cards.projectId, ownedProjectIds), eq(cards.createdBy, userId))
        : eq(cards.createdBy, userId),
    );
  const cardIds = cardRows.map((card) => card.id);
  const learningIds = learningRows.map((item) => item.id);

  const [
    labelRows,
    cardLabelRows,
    assigneeRows,
    focusRows,
    checklistRows,
    commentRows,
    attachmentRows,
    activityRows,
    inviteRows,
    milestoneRows,
    sessionRows,
    resourceRows,
    noteRows,
    linkRows,
  ] = await Promise.all([
    ownedProjectIds.length
      ? db.select().from(labels).where(inArray(labels.projectId, ownedProjectIds))
      : Promise.resolve([]),
    cardIds.length
      ? db.select().from(cardLabels).where(inArray(cardLabels.cardId, cardIds))
      : Promise.resolve([]),
    cardIds.length
      ? db.select().from(cardAssignees).where(inArray(cardAssignees.cardId, cardIds))
      : db.select().from(cardAssignees).where(eq(cardAssignees.userId, userId)),
    db.select().from(cardFocuses).where(eq(cardFocuses.userId, userId)),
    cardIds.length
      ? db.select().from(checklistItems).where(inArray(checklistItems.cardId, cardIds))
      : Promise.resolve([]),
    db
      .select()
      .from(comments)
      .where(
        cardIds.length
          ? or(inArray(comments.cardId, cardIds), eq(comments.authorId, userId))
          : eq(comments.authorId, userId),
      ),
    db
      .select()
      .from(attachments)
      .where(
        cardIds.length
          ? or(inArray(attachments.cardId, cardIds), eq(attachments.uploadedBy, userId))
          : eq(attachments.uploadedBy, userId),
      ),
    db
      .select()
      .from(activities)
      .where(
        ownedProjectIds.length
          ? or(inArray(activities.projectId, ownedProjectIds), eq(activities.actorId, userId))
          : eq(activities.actorId, userId),
      ),
    db
      .select()
      .from(invites)
      .where(
        ownedProjectIds.length
          ? or(inArray(invites.projectId, ownedProjectIds), eq(invites.createdBy, userId))
          : eq(invites.createdBy, userId),
      ),
    learningIds.length
      ? db.select().from(learningMilestones).where(inArray(learningMilestones.itemId, learningIds))
      : Promise.resolve([]),
    learningIds.length
      ? db.select().from(learningSessions).where(inArray(learningSessions.itemId, learningIds))
      : Promise.resolve([]),
    learningIds.length
      ? db.select().from(learningResources).where(inArray(learningResources.itemId, learningIds))
      : Promise.resolve([]),
    learningIds.length
      ? db.select().from(learningNotes).where(inArray(learningNotes.itemId, learningIds))
      : Promise.resolve([]),
    cardIds.length || learningIds.length
      ? db
          .select()
          .from(cardLinks)
          .where(
            cardIds.length && learningIds.length
              ? or(
                  inArray(cardLinks.cardId, cardIds),
                  inArray(cardLinks.learningItemId, learningIds),
                )
              : cardIds.length
                ? inArray(cardLinks.cardId, cardIds)
                : inArray(cardLinks.learningItemId, learningIds),
          )
      : Promise.resolve([]),
  ]);

  return {
    exportedAt: new Date().toISOString(),
    profile: profile[0] ?? null,
    signInAccounts: accountRows,
    memberships: membershipRows,
    projects: ownedProjectRows,
    boards: boardRows,
    columns: columnRows,
    cards: cardRows,
    cardLabels: cardLabelRows,
    cardAssignees: assigneeRows,
    cardFocuses: focusRows,
    cardLinks: linkRows,
    labels: labelRows,
    checklistItems: checklistRows,
    comments: commentRows,
    attachments: attachmentRows,
    activities: activityRows,
    invites: inviteRows.map(({ tokenHash, ...invite }) => {
      void tokenHash;
      return invite;
    }),
    expenseCategories: categoryRows,
    expenses: expenseRows,
    learningItems: learningRows,
    learningMilestones: milestoneRows,
    learningSessions: sessionRows,
    learningResources: resourceRows,
    learningNotes: noteRows,
    dayReviews: reviewRows,
  };
}

export async function GET(request: Request) {
  const session = await auth();
  if (!session?.user?.id) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const requested = new URL(request.url).searchParams.get("format") ?? "json";
  const formats: ExportFormat[] = [
    "json",
    "cards.csv",
    "expenses.csv",
    "learning.csv",
    "reviews.csv",
  ];
  if (!formats.includes(requested as ExportFormat)) {
    return Response.json({ error: "Unsupported export format" }, { status: 400 });
  }

  const data = await loadExport(session.user.id);
  const stamp = new Date().toISOString().slice(0, 10);

  if (requested === "cards.csv") {
    return download(
      toCsv(data.cards, [
        "id",
        "projectId",
        "boardId",
        "columnId",
        "title",
        "description",
        "dueAt",
        "isAllDay",
        "completedAt",
        "impact",
        "effort",
        "createdAt",
        "updatedAt",
        "deletedAt",
      ]),
      "text/csv; charset=utf-8",
      `wrangle-cards-${stamp}.csv`,
    );
  }
  if (requested === "expenses.csv") {
    return download(
      toCsv(data.expenses, [
        "id",
        "spentOn",
        "amountMinor",
        "currency",
        "category",
        "note",
        "paymentMethod",
        "projectId",
        "receiptUrl",
        "createdAt",
        "updatedAt",
        "deletedAt",
      ]),
      "text/csv; charset=utf-8",
      `wrangle-expenses-${stamp}.csv`,
    );
  }
  if (requested === "learning.csv") {
    return download(
      toCsv(data.learningItems, [
        "id",
        "title",
        "type",
        "status",
        "sourceUrl",
        "whyNote",
        "targetDate",
        "progressPct",
        "hoursLogged",
        "completedAt",
        "createdAt",
        "updatedAt",
        "deletedAt",
      ]),
      "text/csv; charset=utf-8",
      `wrangle-learning-${stamp}.csv`,
    );
  }
  if (requested === "reviews.csv") {
    return download(
      toCsv(data.dayReviews, [
        "id",
        "date",
        "note",
        "closed",
        "closedAt",
        "createdAt",
        "updatedAt",
      ]),
      "text/csv; charset=utf-8",
      `wrangle-reviews-${stamp}.csv`,
    );
  }

  return download(
    JSON.stringify(data, null, 2),
    "application/json; charset=utf-8",
    `wrangle-export-${stamp}.json`,
  );
}
