import { describe, expect, it, vi } from "vitest";
import { inArray } from "drizzle-orm";

// The action calls requireUser() (→ @/auth, which doesn't load under vitest)
// and refresh() (needs a request scope); stub both and drive it against the
// real DB, DB-gated like tests/unit/outbox-apply.test.ts.
const h = vi.hoisted(() => ({ userId: "" }));
vi.mock("@/auth", () => ({ auth: async () => null }));
vi.mock("@/lib/authz", () => ({ requireUser: async () => h.userId }));
vi.mock("next/cache", () => ({ refresh: () => {} }));

import { db } from "@/db";
import { activities, boards, cards, columns, memberships, projects, users } from "@/db/schema";
import { rescheduleOverdueToNextWeek } from "@/lib/actions/weekly";
import { weekWindow } from "@/lib/weekly/stats";
import { uuidv7 } from "@/lib/uuid";

describe.skipIf(!process.env.DATABASE_URL)("rescheduleOverdueToNextWeek (integration)", () => {
  it(
    "skips cards in projects where the caller is a viewer or the project is trashed",
    { timeout: 60_000 },
    async () => {
      const suffix = Date.now();
      const owner = uuidv7();
      const caller = uuidv7();
      const shared = uuidv7(); // caller is a viewer
      const own = uuidv7(); // caller is the owner
      const trashed = uuidv7(); // caller is the owner, project in Trash
      const projectIds = [shared, own, trashed];
      const boardIds = projectIds.map(() => uuidv7());
      const columnIds = projectIds.map(() => uuidv7());
      const cardIds = projectIds.map(() => uuidv7());
      // Overdue and inside this week's window (UTC users).
      const due = new Date(Math.max(weekWindow(new Date(), "UTC").start.getTime(), Date.now() - 60_000));

      try {
        await db.insert(users).values([
          { id: owner, name: "Weekly Owner", email: `weekly-owner-${suffix}@example.com`, emailVerified: new Date() },
          { id: caller, name: "Weekly Caller", email: `weekly-caller-${suffix}@example.com`, emailVerified: new Date() },
        ]);
        await db.insert(projects).values([
          { id: shared, name: "__weekly_shared", ownerId: owner },
          { id: own, name: "__weekly_own", ownerId: caller },
          { id: trashed, name: "__weekly_trashed", ownerId: caller, deletedAt: new Date() },
        ]);
        await db.insert(memberships).values([
          { projectId: shared, userId: owner, role: "owner", position: "a0" },
          { projectId: shared, userId: caller, role: "viewer", position: "a0" },
          { projectId: own, userId: caller, role: "owner", position: "a1" },
          { projectId: trashed, userId: caller, role: "owner", position: "a2" },
        ]);
        await db.insert(boards).values(
          projectIds.map((projectId, i) => ({ id: boardIds[i], projectId, kind: "todo" as const, name: "To-Do" })),
        );
        await db.insert(columns).values(
          projectIds.map((_, i) => ({ id: columnIds[i], boardId: boardIds[i], name: "Backlog", position: "a0" })),
        );
        await db.insert(cards).values(
          projectIds.map((projectId, i) => ({
            id: cardIds[i],
            columnId: columnIds[i],
            boardId: boardIds[i],
            projectId,
            title: "Overdue",
            position: "a0",
            createdBy: owner,
            dueAt: due,
          })),
        );

        h.userId = caller;
        const result = await rescheduleOverdueToNextWeek();
        expect(result).toEqual({ ok: true, data: { count: 1 } });

        const after = await db
          .select({ id: cards.id, dueAt: cards.dueAt })
          .from(cards)
          .where(inArray(cards.id, cardIds));
        const dueOf = (id: string) => after.find((c) => c.id === id)?.dueAt?.getTime();
        expect(dueOf(cardIds[0])).toBe(due.getTime()); // viewer: untouched
        expect(dueOf(cardIds[1])).toBeGreaterThan(due.getTime()); // own: moved
        expect(dueOf(cardIds[2])).toBe(due.getTime()); // trashed: untouched
      } finally {
        await db.delete(activities).where(inArray(activities.projectId, projectIds));
        await db.delete(cards).where(inArray(cards.id, cardIds));
        await db.delete(columns).where(inArray(columns.id, columnIds));
        await db.delete(boards).where(inArray(boards.id, boardIds));
        await db.delete(memberships).where(inArray(memberships.projectId, projectIds));
        await db.delete(projects).where(inArray(projects.id, projectIds));
        await db.delete(users).where(inArray(users.id, [owner, caller]));
      }
    },
  );
});
