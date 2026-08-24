import { describe, expect, it } from "vitest";
import { eq, inArray } from "drizzle-orm";

import { db } from "@/db";
import { boards, columns, memberships, projects, users } from "@/db/schema";
import { seedProjectBoards } from "@/lib/kanban/seed";
import { uuidv7 } from "@/lib/uuid";

describe.skipIf(!process.env.DATABASE_URL)(
  "seedProjectBoards (integration)",
  () => {
    it("creates todo/ideas/work boards with default columns, rolling back cleanly", { timeout: 60_000 }, async () => {
      await expect(
        db.transaction(async (tx) => {
          const userId = uuidv7();
          await tx.insert(users).values({
            id: userId,
            name: "Seed Test",
            email: `seed-test-${Date.now()}@example.com`,
            emailVerified: new Date(),
          });

          const [project] = await tx
            .insert(projects)
            .values({ name: "__seed_test", ownerId: userId })
            .returning({ id: projects.id });

          await tx
            .insert(memberships)
            .values({ projectId: project.id, userId, role: "owner" });

          await seedProjectBoards(tx, project.id);

          const seeded = await tx
            .select()
            .from(boards)
            .where(eq(boards.projectId, project.id));

          expect(seeded).toHaveLength(3);
          expect(new Set(seeded.map((b) => b.kind))).toEqual(
            new Set(["todo", "ideas", "work"]),
          );

          const allCols = await tx
            .select({ boardId: columns.boardId })
            .from(columns)
            .where(
              inArray(
                columns.boardId,
                seeded.map((b) => b.id),
              ),
            );

          expect(allCols.filter((c) => c.boardId === seeded[0].id)).toHaveLength(3);
          expect(allCols.filter((c) => c.boardId === seeded[1].id)).toHaveLength(3);
          expect(allCols.filter((c) => c.boardId === seeded[2].id)).toHaveLength(4);

          throw new Error("__ROLLBACK__");
        }),
      ).rejects.toThrow("__ROLLBACK__");
    });
  },
);
