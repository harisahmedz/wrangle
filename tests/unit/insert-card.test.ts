import { describe, expect, it } from "vitest";
import { eq, inArray } from "drizzle-orm";

import { db } from "@/db";
import { boards, cards, columns, projects, users } from "@/db/schema";
import { insertCard } from "@/lib/kanban/insert-card";
import { uuidv7 } from "@/lib/uuid";

// insertCard (lib/kanban/insert-card.ts, V2 S5) talks to `db` directly rather
// than an injected transaction, so a wrap-in-a-transaction-and-roll-back
// (as tests/unit/seed-boards.test.ts does) wouldn't actually undo its
// writes — clean up the rows by hand instead.
describe.skipIf(!process.env.DATABASE_URL)(
  "insertCard replay scoping (integration)",
  () => {
    it(
      "a replayed id returns the caller's own card; a colliding id from another project/user returns null",
      { timeout: 60_000 },
      async () => {
        const suffix = Date.now();
        const userAId = uuidv7();
        const userBId = uuidv7();
        const projectAId = uuidv7();
        const projectBId = uuidv7();
        const boardAId = uuidv7();
        const boardBId = uuidv7();
        const columnAId = uuidv7();
        const columnBId = uuidv7();
        const cardId = uuidv7();

        try {
          await db.insert(users).values([
            { id: userAId, name: "Insert Test A", email: `insert-test-a-${suffix}@example.com`, emailVerified: new Date() },
            { id: userBId, name: "Insert Test B", email: `insert-test-b-${suffix}@example.com`, emailVerified: new Date() },
          ]);
          await db.insert(projects).values([
            { id: projectAId, name: "__insert_test_a", ownerId: userAId },
            { id: projectBId, name: "__insert_test_b", ownerId: userBId },
          ]);
          await db.insert(boards).values([
            { id: boardAId, projectId: projectAId, kind: "todo", name: "To-Do" },
            { id: boardBId, projectId: projectBId, kind: "todo", name: "To-Do" },
          ]);
          await db.insert(columns).values([
            { id: columnAId, boardId: boardAId, name: "Backlog" },
            { id: columnBId, boardId: boardBId, name: "Backlog" },
          ]);

          // (a) Same id, same user+project, called twice: the second call is
          // a replay and must return the first call's row, not a duplicate
          // or an error.
          const first = await insertCard({
            id: cardId,
            columnId: columnAId,
            boardId: boardAId,
            projectId: projectAId,
            title: "First",
            userId: userAId,
          });
          expect(first).not.toBeNull();
          expect(first?.cardId).toBe(cardId);

          const replay = await insertCard({
            id: cardId,
            columnId: columnAId,
            boardId: boardAId,
            projectId: projectAId,
            title: "First (replayed)",
            userId: userAId,
          });
          expect(replay).toEqual(first);

          // ON CONFLICT DO NOTHING means the replay's title never landed —
          // confirms it was skipped, not applied as an update.
          const projectACards = await db
            .select({ id: cards.id, title: cards.title })
            .from(cards)
            .where(eq(cards.projectId, projectAId));
          expect(projectACards).toHaveLength(1);
          expect(projectACards[0].title).toBe("First");

          // (b) Same id, a different user in a different project: ownReplay
          // requires matching id AND projectId AND createdBy, so this must
          // not find/leak project A's row — it returns null (clean failure),
          // not another tenant's card id/position.
          const crossTenant = await insertCard({
            id: cardId,
            columnId: columnBId,
            boardId: boardBId,
            projectId: projectBId,
            title: "Should not land",
            userId: userBId,
          });
          expect(crossTenant).toBeNull();
        } finally {
          await db.delete(columns).where(inArray(columns.id, [columnAId, columnBId]));
          await db.delete(boards).where(inArray(boards.id, [boardAId, boardBId]));
          await db.delete(projects).where(inArray(projects.id, [projectAId, projectBId]));
          await db.delete(users).where(inArray(users.id, [userAId, userBId]));
        }
      },
    );
  },
);
