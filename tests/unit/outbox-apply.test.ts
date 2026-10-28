import { describe, expect, it, vi } from "vitest";
import { and, eq, inArray } from "drizzle-orm";

// lib/outbox/apply.ts → lib/authz.ts → @/auth (next-auth), which doesn't
// load under vitest; the apply layer never calls `auth()` itself (it takes
// a trusted userId), so a stub is enough — same trick as authz.test.ts.
vi.mock("@/auth", () => ({ auth: async () => null }));

import { db } from "@/db";
import {
  activities,
  boards,
  cards,
  checklistItems,
  columns,
  expenseCategories,
  expenses,
  learningItems,
  memberships,
  projects,
  users,
} from "@/db/schema";
import { applyMutation } from "@/lib/outbox/apply";
import type { Mutation } from "@/lib/outbox/types";
import { uuidv7 } from "@/lib/uuid";

// docs/OFFLINE-OUTBOX.md §8 integration row: the apply layer against a real
// DB. DB-gated like tests/unit/seed-boards.test.ts; cleans up by hand (the
// apply functions commit their own transactions).
describe.skipIf(!process.env.DATABASE_URL)("outbox apply layer (integration)", () => {
  it(
    "is idempotent, scopes ids per tenant, nudges positions, and applies the conflict rules",
    { timeout: 120_000 },
    async () => {
      const suffix = Date.now();
      const userA = uuidv7();
      const userB = uuidv7();
      const projectA = uuidv7();
      const projectB = uuidv7();
      const boardA = uuidv7();
      const boardB = uuidv7();
      const todoA = uuidv7();
      const doneA = uuidv7();
      const todoB = uuidv7();
      const existingCard = uuidv7();
      const seededCard = uuidv7();
      const checklistId = uuidv7();
      const learningId = uuidv7();
      const categoryId = uuidv7();
      const newCard = uuidv7();
      const newExpense = uuidv7();
      const apply = (userId: string, mutation: Mutation, createdAt = Date.now()) =>
        applyMutation(userId, { id: uuidv7(), createdAt, mutation });
      // Seeded cards are an hour old so an offline tick a minute ago isn't
      // clamped up to the card's own createdAt (review L3).
      const cardCreatedAt = new Date(Date.now() - 3_600_000);

      try {
        await db.insert(users).values([
          { id: userA, name: "Apply A", email: `apply-a-${suffix}@example.com`, emailVerified: new Date() },
          { id: userB, name: "Apply B", email: `apply-b-${suffix}@example.com`, emailVerified: new Date() },
        ]);
        await db.insert(projects).values([
          { id: projectA, name: "__apply_a", ownerId: userA },
          { id: projectB, name: "__apply_b", ownerId: userB },
        ]);
        await db.insert(memberships).values([
          { projectId: projectA, userId: userA, role: "owner", position: "a0" },
          { projectId: projectB, userId: userB, role: "owner", position: "a0" },
        ]);
        await db.insert(boards).values([
          { id: boardA, projectId: projectA, kind: "todo", name: "To-Do" },
          { id: boardB, projectId: projectB, kind: "todo", name: "To-Do" },
        ]);
        await db.insert(columns).values([
          { id: todoA, boardId: boardA, name: "Backlog", position: "a0" },
          { id: doneA, boardId: boardA, name: "Done", position: "a1", isDone: true },
          { id: todoB, boardId: boardB, name: "Backlog", position: "a0" },
        ]);
        await db.insert(cards).values([
          { id: existingCard, columnId: todoA, boardId: boardA, projectId: projectA, title: "Existing", position: "a0", createdBy: userA, createdAt: cardCreatedAt },
          { id: seededCard, columnId: todoA, boardId: boardA, projectId: projectA, title: "Seeded", position: "a1", createdBy: userA, createdAt: cardCreatedAt },
        ]);
        await db.insert(checklistItems).values({ id: checklistId, cardId: existingCard, text: "step", position: "a0" });
        await db.insert(learningItems).values({ id: learningId, userId: userA, title: "Rust", type: "book", position: "a0" });
        await db.insert(expenseCategories).values({ id: categoryId, userId: userA, name: "Food", position: "a0" });

        // card.create with a colliding client position → nudged, and a
        // replay of the same id is a no-op that still reports applied.
        const create: Mutation = { kind: "card.create", id: newCard, target: { columnId: todoA }, title: "New", position: "a0" };
        const first = await apply(userA, create);
        expect(first.status).toBe("applied");
        expect(first).toMatchObject({ patch: { position: expect.any(String) } });
        const nudged = (first as { patch: { position: string } }).patch.position;
        expect(nudged > "a0" && nudged < "a1").toBe(true);
        expect(await apply(userA, create)).toMatchObject({ status: "applied" });
        const inA = await db.select({ id: cards.id, title: cards.title }).from(cards).where(eq(cards.projectId, projectA));
        expect(inA.filter((c) => c.id === newCard)).toHaveLength(1);

        // Same id from another tenant → failed, nothing leaked or changed.
        const cross = await apply(userB, { kind: "card.create", id: newCard, target: { columnId: todoB }, title: "Steal", position: "a0" });
        expect(cross.status).toBe("failed");
        expect((await db.select({ projectId: cards.projectId }).from(cards).where(eq(cards.id, newCard)))[0].projectId).toBe(projectA);

        // Non-member → failed with the access reason.
        expect(await apply(userB, { kind: "card.complete", cardId: existingCard, completed: true })).toMatchObject({
          status: "failed",
          reason: expect.stringContaining("access"),
        });

        // card.complete uses the offline tick time (§5.3) and replays as a no-op.
        const tickedAt = Date.now() - 60_000;
        expect(await apply(userA, { kind: "card.complete", cardId: existingCard, completed: true }, tickedAt)).toEqual({ status: "applied" });
        expect(await apply(userA, { kind: "card.complete", cardId: existingCard, completed: true }, tickedAt)).toEqual({ status: "applied" });
        const [completed] = await db.select({ completedAt: cards.completedAt }).from(cards).where(eq(cards.id, existingCard));
        expect(completed.completedAt?.getTime()).toBe(tickedAt);
        // A device clock earlier than the card's creation is clamped to createdAt (L3).
        expect(await apply(userA, { kind: "card.complete", cardId: existingCard, completed: false })).toEqual({ status: "applied" });
        expect(
          await apply(userA, { kind: "card.complete", cardId: existingCard, completed: true }, cardCreatedAt.getTime() - 86_400_000),
        ).toEqual({ status: "applied" });
        const [clamped] = await db.select({ completedAt: cards.completedAt }).from(cards).where(eq(cards.id, existingCard));
        expect(clamped.completedAt?.getTime()).toBe(cardCreatedAt.getTime());
        // Priority rides along on card.update (S9, wired through the outbox).
        expect(await apply(userA, { kind: "card.update", cardId: existingCard, patch: { priority: 2 } })).toEqual({ status: "applied" });
        expect((await db.select({ priority: cards.priority }).from(cards).where(eq(cards.id, existingCard)))[0].priority).toBe(2);

        // card.update: patch wins per field, other fields untouched.
        expect(await apply(userA, { kind: "card.update", cardId: seededCard, patch: { title: "Renamed" } })).toEqual({ status: "applied" });
        const [renamed] = await db.select({ title: cards.title, position: cards.position }).from(cards).where(eq(cards.id, seededCard));
        expect(renamed).toEqual({ title: "Renamed", position: "a1" });

        // card.move into the Done column auto-completes; to another project's column → dropped.
        expect(await apply(userA, { kind: "card.move", cardId: seededCard, toColumnId: doneA, position: "a0" })).toEqual({ status: "applied" });
        const [moved] = await db.select({ columnId: cards.columnId, completedAt: cards.completedAt }).from(cards).where(eq(cards.id, seededCard));
        expect(moved.columnId).toBe(doneA);
        expect(moved.completedAt).not.toBeNull();
        expect(await apply(userA, { kind: "card.move", cardId: seededCard, toColumnId: todoB, position: "a0" })).toMatchObject({ status: "dropped" });

        // checklist.set is a set; learning.setStatus repositions into the target status.
        expect(await apply(userA, { kind: "checklist.set", itemId: checklistId, cardId: existingCard, isDone: true })).toEqual({ status: "applied" });
        expect(await apply(userA, { kind: "checklist.set", itemId: checklistId, cardId: existingCard, isDone: true })).toEqual({ status: "applied" });
        expect((await db.select({ isDone: checklistItems.isDone }).from(checklistItems).where(eq(checklistItems.id, checklistId)))[0].isDone).toBe(true);
        expect(await apply(userA, { kind: "learning.setStatus", itemId: learningId, status: "learned" })).toEqual({ status: "applied" });
        expect(await apply(userB, { kind: "learning.setStatus", itemId: learningId, status: "want" })).toMatchObject({ status: "dropped" });
        const [learned] = await db.select({ status: learningItems.status, completedAt: learningItems.completedAt }).from(learningItems).where(eq(learningItems.id, learningId));
        expect(learned.status).toBe("learned");
        expect(learned.completedAt).not.toBeNull();

        // expense.create twice → one row; someone else's category → failed.
        const expense: Mutation = { kind: "expense.create", id: newExpense, categoryId, amountMinor: 1250, spentOn: "2026-10-28", note: "lunch" };
        expect(await apply(userA, expense)).toEqual({ status: "applied" });
        expect(await apply(userA, expense)).toEqual({ status: "applied" });
        expect(await db.select({ id: expenses.id }).from(expenses).where(eq(expenses.id, newExpense))).toHaveLength(1);
        expect(await apply(userB, { ...expense, id: uuidv7() })).toMatchObject({ status: "failed" });

        // Deleted wins: a soft-deleted card drops the change with its title.
        await db.update(cards).set({ deletedAt: new Date() }).where(eq(cards.id, existingCard));
        expect(await apply(userA, { kind: "card.complete", cardId: existingCard, completed: false })).toMatchObject({
          status: "dropped",
          reason: expect.stringContaining("Existing"),
        });
      } finally {
        await db.delete(activities).where(inArray(activities.projectId, [projectA, projectB]));
        await db.delete(checklistItems).where(eq(checklistItems.id, checklistId));
        await db.delete(cards).where(inArray(cards.projectId, [projectA, projectB]));
        await db.delete(columns).where(inArray(columns.id, [todoA, doneA, todoB]));
        await db.delete(boards).where(inArray(boards.id, [boardA, boardB]));
        await db.delete(memberships).where(inArray(memberships.projectId, [projectA, projectB]));
        await db.delete(projects).where(inArray(projects.id, [projectA, projectB]));
        await db.delete(expenses).where(and(eq(expenses.userId, userA)));
        await db.delete(expenseCategories).where(eq(expenseCategories.id, categoryId));
        await db.delete(learningItems).where(eq(learningItems.id, learningId));
        await db.delete(users).where(inArray(users.id, [userA, userB]));
      }
    },
  );
});
