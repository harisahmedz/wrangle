import { relations } from "drizzle-orm";
import {
  bigint,
  boolean,
  char,
  date,
  index,
  integer,
  jsonb,
  numeric,
  pgEnum,
  pgTable,
  primaryKey,
  smallint,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";
import { uuidv7 } from "../lib/uuid";

export const projectRole = pgEnum("project_role", [
  "owner",
  "admin",
  "member",
  "viewer",
]);

export const projectTheme = pgEnum("project_theme", ["dark", "light", "system"]);

export const users = pgTable(
  "users",
  {
    id: uuid("id")
      .primaryKey()
      .$defaultFn(() => uuidv7()),
    name: text("name"),
    email: text("email").notNull().unique(),
    emailVerified: timestamp("email_verified", {
      mode: "date",
      withTimezone: true,
    }),
    image: text("image_url"),
    timezone: text("timezone").notNull().default("UTC"),
    theme: projectTheme("theme").notNull().default("system"),
    currency: char("currency", { length: 3 }).notNull().default("USD"),
    onboardedAt: timestamp("onboarded_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
    deletedAt: timestamp("deleted_at", { withTimezone: true }),
  },
);

export const accounts = pgTable(
  "accounts",
  {
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    type: text("type").$type<"oidc" | "oauth" | "email">().notNull(),
    provider: text("provider").notNull(),
    providerAccountId: text("provider_account_id").notNull(),
    refresh_token: text("refresh_token"),
    access_token: text("access_token"),
    expires_at: integer("expires_at"),
    token_type: text("token_type"),
    scope: text("scope"),
    id_token: text("id_token"),
    session_state: text("session_state"),
  },
  (account) => [
    primaryKey({
      columns: [account.provider, account.providerAccountId],
    }),
    index("accounts_user_id_idx").on(account.userId),
  ],
);

export const sessions = pgTable(
  "sessions",
  {
    sessionToken: text("session_token").primaryKey(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    expires: timestamp("expires", { mode: "date", withTimezone: true }).notNull(),
  },
  (session) => [index("sessions_user_id_idx").on(session.userId)],
);

export const verificationTokens = pgTable(
  "verification_tokens",
  {
    identifier: text("identifier").notNull(),
    token: text("token").notNull(),
    expires: timestamp("expires", { withTimezone: true }).notNull(),
  },
  (vt) => [primaryKey({ columns: [vt.identifier, vt.token] })],
);

export const projects = pgTable(
  "projects",
  {
    id: uuid("id")
      .primaryKey()
      .$defaultFn(() => uuidv7()),
    name: text("name").notNull(),
    emoji: text("emoji"),
    color: text("color"),
    ownerId: uuid("owner_id")
      .notNull()
      .references(() => users.id),
    isPersonal: boolean("is_personal").notNull().default(false),
    archivedAt: timestamp("archived_at", { withTimezone: true }),
    position: text("position").notNull().default("a0"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
    deletedAt: timestamp("deleted_at", { withTimezone: true }),
  },
  (p) => [
    index("projects_owner_id_idx").on(p.ownerId),
    index("projects_position_idx").on(p.position),
  ],
);

export const memberships = pgTable(
  "memberships",
  {
    id: uuid("id")
      .primaryKey()
      .$defaultFn(() => uuidv7()),
    projectId: uuid("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    role: projectRole("role").notNull(),
    joinedAt: timestamp("joined_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    invitedBy: uuid("invited_by").references(() => users.id, {
      onDelete: "set null",
    }),
  },
  (m) => [
    uniqueIndex("memberships_project_user_uq").on(m.projectId, m.userId),
    index("memberships_user_id_idx").on(m.userId),
  ],
);

export const usersRelations = relations(users, ({ many }) => ({
  accounts: many(accounts),
  sessions: many(sessions),
  memberships: many(memberships),
  ownedProjects: many(projects),
}));

export const projectsRelations = relations(projects, ({ one, many }) => ({
  owner: one(users, { fields: [projects.ownerId], references: [users.id] }),
  memberships: many(memberships),
}));

export const membershipsRelations = relations(memberships, ({ one }) => ({
  project: one(projects, {
    fields: [memberships.projectId],
    references: [projects.id],
  }),
  user: one(users, { fields: [memberships.userId], references: [users.id] }),
}));

export type User = typeof users.$inferSelect;
export type Project = typeof projects.$inferSelect;
export type Membership = typeof memberships.$inferSelect;
export type ProjectRole = (typeof projectRole.enumValues)[number];
export type Theme = (typeof projectTheme.enumValues)[number];
export type BoardKind = (typeof boardKind.enumValues)[number];

export const boardKind = pgEnum("board_kind", ["todo", "ideas", "work"]);

export const boards = pgTable(
  "boards",
  {
    id: uuid("id")
      .primaryKey()
      .$defaultFn(() => uuidv7()),
    projectId: uuid("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    kind: boardKind("kind").notNull(),
    name: text("name").notNull(),
    position: text("position").notNull().default("a0"),
  },
  (b) => [uniqueIndex("boards_project_kind_uq").on(b.projectId, b.kind)],
);

export const columns = pgTable(
  "columns",
  {
    id: uuid("id")
      .primaryKey()
      .$defaultFn(() => uuidv7()),
    boardId: uuid("board_id")
      .notNull()
      .references(() => boards.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    color: text("color"),
    position: text("position").notNull().default("a0"),
    wipLimit: integer("wip_limit"),
    isCollapsed: boolean("is_collapsed").notNull().default(false),
    isDone: boolean("is_done").notNull().default(false),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    deletedAt: timestamp("deleted_at", { withTimezone: true }),
  },
  (c) => [index("columns_board_position_idx").on(c.boardId, c.position)],
);

export const cards = pgTable(
  "cards",
  {
    id: uuid("id")
      .primaryKey()
      .$defaultFn(() => uuidv7()),
    columnId: uuid("column_id")
      .notNull()
      .references(() => columns.id, { onDelete: "cascade" }),
    boardId: uuid("board_id").notNull(),
    projectId: uuid("project_id").notNull(),
    title: text("title").notNull(),
    description: text("description"),
    position: text("position").notNull(),
    dueAt: timestamp("due_at", { withTimezone: true }),
    isAllDay: boolean("is_all_day").notNull().default(false),
    completedAt: timestamp("completed_at", { withTimezone: true }),
    impact: smallint("impact"),
    effort: smallint("effort"),
    coverColor: text("cover_color"),
    focusedOn: date("focused_on"),
    createdBy: uuid("created_by").references(() => users.id, {
      onDelete: "set null",
    }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
    deletedAt: timestamp("deleted_at", { withTimezone: true }),
  },
  (c) => [
    index("cards_board_position_idx").on(c.boardId, c.position),
    index("cards_column_position_idx").on(c.columnId, c.position),
    index("cards_project_due_idx").on(c.projectId, c.dueAt),
    index("cards_focused_idx").on(c.focusedOn),
  ],
);

export const dayReviews = pgTable(
  "day_reviews",
  {
    id: uuid("id")
      .primaryKey()
      .$defaultFn(() => uuidv7()),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    date: date("date").notNull(),
    note: text("note"),
    closed: boolean("closed").notNull().default(false),
    closedAt: timestamp("closed_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (dr) => [uniqueIndex("day_reviews_user_date_uq").on(dr.userId, dr.date)],
);

export const labels = pgTable(
  "labels",
  {
    id: uuid("id")
      .primaryKey()
      .$defaultFn(() => uuidv7()),
    projectId: uuid("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    color: text("color").notNull(),
  },
  (l) => [index("labels_project_idx").on(l.projectId)],
);

export const cardLabels = pgTable(
  "card_labels",
  {
    cardId: uuid("card_id")
      .notNull()
      .references(() => cards.id, { onDelete: "cascade" }),
    labelId: uuid("label_id")
      .notNull()
      .references(() => labels.id, { onDelete: "cascade" }),
  },
  (cl) => [primaryKey({ columns: [cl.cardId, cl.labelId] })],
);

export const cardAssignees = pgTable(
  "card_assignees",
  {
    cardId: uuid("card_id")
      .notNull()
      .references(() => cards.id, { onDelete: "cascade" }),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
  },
  (ca) => [primaryKey({ columns: [ca.cardId, ca.userId] })],
);

export const checklistItems = pgTable(
  "checklist_items",
  {
    id: uuid("id")
      .primaryKey()
      .$defaultFn(() => uuidv7()),
    cardId: uuid("card_id")
      .notNull()
      .references(() => cards.id, { onDelete: "cascade" }),
    text: text("text").notNull(),
    isDone: boolean("is_done").notNull().default(false),
    position: text("position").notNull().default("a0"),
  },
  (ci) => [index("checklist_card_position_idx").on(ci.cardId, ci.position)],
);

export const comments = pgTable(
  "comments",
  {
    id: uuid("id")
      .primaryKey()
      .$defaultFn(() => uuidv7()),
    cardId: uuid("card_id")
      .notNull()
      .references(() => cards.id, { onDelete: "cascade" }),
    authorId: uuid("author_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    body: text("body").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
    deletedAt: timestamp("deleted_at", { withTimezone: true }),
  },
  (cm) => [index("comments_card_created_idx").on(cm.cardId, cm.createdAt)],
);

export const attachments = pgTable(
  "attachments",
  {
    id: uuid("id")
      .primaryKey()
      .$defaultFn(() => uuidv7()),
    cardId: uuid("card_id").references(() => cards.id, { onDelete: "cascade" }),
    expenseId: uuid("expense_id"),
    learningItemId: uuid("learning_item_id"),
    cloudinaryPublicId: text("cloudinary_public_id").notNull(),
    url: text("url").notNull(),
    mime: text("mime").notNull(),
    bytes: integer("bytes").notNull(),
    width: integer("width"),
    height: integer("height"),
    uploadedBy: uuid("uploaded_by").references(() => users.id, {
      onDelete: "set null",
    }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (a) => [index("attachments_uploaded_by_idx").on(a.uploadedBy)],
);

export const activities = pgTable(
  "activities",
  {
    id: uuid("id")
      .primaryKey()
      .$defaultFn(() => uuidv7()),
    projectId: uuid("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    actorId: uuid("actor_id").references(() => users.id, {
      onDelete: "set null",
    }),
    entityType: text("entity_type").notNull(),
    entityId: uuid("entity_id").notNull(),
    verb: text("verb").notNull(),
    meta: jsonb("meta"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (ac) => [
    index("activities_project_created_idx").on(ac.projectId, ac.createdAt),
    index("activities_entity_created_idx").on(
      ac.entityType,
      ac.entityId,
      ac.createdAt,
    ),
  ],
);

export const invites = pgTable(
  "invites",
  {
    id: uuid("id")
      .primaryKey()
      .$defaultFn(() => uuidv7()),
    projectId: uuid("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    tokenHash: text("token_hash").notNull().unique(),
    role: projectRole("role").notNull().default("member"),
    createdBy: uuid("created_by")
      .notNull()
      .references(() => users.id),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    maxUses: integer("max_uses").notNull().default(10),
    usedCount: integer("used_count").notNull().default(0),
    revokedAt: timestamp("revoked_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (i) => [index("invites_project_idx").on(i.projectId)],
);

export const inviteRedemptions = pgTable(
  "invite_redemptions",
  {
    inviteId: uuid("invite_id")
      .notNull()
      .references(() => invites.id, { onDelete: "cascade" }),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    redeemedAt: timestamp("redeemed_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (ir) => [primaryKey({ columns: [ir.inviteId, ir.userId] })],
);

export const rateLimits = pgTable("rate_limits", {
  key: text("key").primaryKey(),
  count: integer("count").notNull().default(0),
  windowStart: timestamp("window_start", { withTimezone: true }).notNull(),
});

export const expenseCategories = pgTable(
  "expense_categories",
  {
    id: uuid("id")
      .primaryKey()
      .$defaultFn(() => uuidv7()),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    emoji: text("emoji"),
    color: text("color"),
    isArchived: boolean("is_archived").notNull().default(false),
    position: text("position").notNull().default("a0"),
  },
  (ec) => [index("expense_categories_user_idx").on(ec.userId, ec.position)],
);

export const expenses = pgTable(
  "expenses",
  {
    id: uuid("id")
      .primaryKey()
      .$defaultFn(() => uuidv7()),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    projectId: uuid("project_id").references(() => projects.id, {
      onDelete: "set null",
    }),
    categoryId: uuid("category_id")
      .notNull()
      .references(() => expenseCategories.id),
    amountMinor: bigint("amount_minor", { mode: "number" }).notNull(),
    currency: char("currency", { length: 3 }).notNull().default("USD"),
    spentOn: date("spent_on").notNull(),
    note: text("note"),
    paymentMethod: text("payment_method"),
    receiptPublicId: text("receipt_public_id"),
    receiptUrl: text("receipt_url"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
    deletedAt: timestamp("deleted_at", { withTimezone: true }),
  },
  (e) => [
    index("expenses_user_spent_idx").on(e.userId, e.spentOn),
    index("expenses_user_category_spent_idx").on(
      e.userId,
      e.categoryId,
      e.spentOn,
    ),
  ],
);

export const learningType = pgEnum("learning_type", [
  "course",
  "book",
  "video",
  "article",
  "skill",
  "other",
]);

export const learningStatus = pgEnum("learning_status", [
  "want",
  "learning",
  "learned",
]);

export const learningItems = pgTable(
  "learning_items",
  {
    id: uuid("id")
      .primaryKey()
      .$defaultFn(() => uuidv7()),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    title: text("title").notNull(),
    type: learningType("type").notNull().default("other"),
    status: learningStatus("status").notNull().default("want"),
    sourceUrl: text("source_url"),
    whyNote: text("why_note"),
    targetDate: date("target_date"),
    progressPct: smallint("progress_pct").notNull().default(0),
    hoursLogged: numeric("hours_logged", { precision: 6, scale: 2 })
      .notNull()
      .default("0"),
    completedAt: timestamp("completed_at", { withTimezone: true }),
    position: text("position").notNull().default("a0"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
    deletedAt: timestamp("deleted_at", { withTimezone: true }),
  },
  (li) => [
    index("learning_items_user_status_idx").on(li.userId, li.status, li.position),
  ],
);

export const learningMilestones = pgTable(
  "learning_milestones",
  {
    id: uuid("id")
      .primaryKey()
      .$defaultFn(() => uuidv7()),
    itemId: uuid("item_id")
      .notNull()
      .references(() => learningItems.id, { onDelete: "cascade" }),
    text: text("text").notNull(),
    isDone: boolean("is_done").notNull().default(false),
    position: text("position").notNull().default("a0"),
  },
  (lm) => [index("learning_milestones_item_idx").on(lm.itemId, lm.position)],
);

export const learningSessions = pgTable(
  "learning_sessions",
  {
    id: uuid("id")
      .primaryKey()
      .$defaultFn(() => uuidv7()),
    itemId: uuid("item_id")
      .notNull()
      .references(() => learningItems.id, { onDelete: "cascade" }),
    happenedOn: date("happened_on").notNull(),
    minutes: integer("minutes").notNull(),
    note: text("note"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (ls) => [index("learning_sessions_item_idx").on(ls.itemId, ls.happenedOn)],
);

export const learningResources = pgTable(
  "learning_resources",
  {
    id: uuid("id")
      .primaryKey()
      .$defaultFn(() => uuidv7()),
    itemId: uuid("item_id")
      .notNull()
      .references(() => learningItems.id, { onDelete: "cascade" }),
    url: text("url").notNull(),
    title: text("title"),
    note: text("note"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (lr) => [index("learning_resources_item_idx").on(lr.itemId)],
);

export const learningNotes = pgTable(
  "learning_notes",
  {
    id: uuid("id")
      .primaryKey()
      .$defaultFn(() => uuidv7()),
    itemId: uuid("item_id")
      .notNull()
      .references(() => learningItems.id, { onDelete: "cascade" }),
    body: text("body").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (ln) => [index("learning_notes_item_idx").on(ln.itemId, ln.createdAt)],
);

export const cardLinks = pgTable(
  "card_links",
  {
    id: uuid("id")
      .primaryKey()
      .$defaultFn(() => uuidv7()),
    cardId: uuid("card_id")
      .notNull()
      .references(() => cards.id, { onDelete: "cascade" }),
    learningItemId: uuid("learning_item_id")
      .notNull()
      .references(() => learningItems.id, { onDelete: "cascade" }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (cl) => [uniqueIndex("card_links_uq").on(cl.cardId, cl.learningItemId)],
);

export type LearningItem = typeof learningItems.$inferSelect;
export type ExpenseCategory = typeof expenseCategories.$inferSelect;
export type Expense = typeof expenses.$inferSelect;
export type DayReview = typeof dayReviews.$inferSelect;


export type Board = typeof boards.$inferSelect;
export type Column = typeof columns.$inferSelect;
export type Card = typeof cards.$inferSelect;
export type Invite = typeof invites.$inferSelect;
