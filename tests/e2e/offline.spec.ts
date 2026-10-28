// ROADMAP-V2 S8 "done when" (docs/OFFLINE-OUTBOX.md §8): complete, add and
// move cards offline, go online, and every change lands once, in order; a
// conflicting edit (card deleted elsewhere meanwhile) is dropped, not
// resurrected. Drives the List view of demo@wrangle.local's To-Do board.
// DB-gated and chromium-only (the demo account is shared, like view-switch).
import { expect, hasDatabase, openPool, test } from "./fixtures/auth";
import type { Pool } from "@neondatabase/serverless";
import { generateKeyBetween } from "fractional-indexing";

const PREFIX = `e2e-offline-${Date.now()}`;

type Seed = { boardId: string; todoColumnId: string; otherColumnId: string; cardIds: string[] };

async function seed(pool: Pool, projectId: string, userId: string, titles: string[]): Promise<Seed> {
  const board = (await pool.query(`SELECT id FROM boards WHERE project_id = $1 AND kind = 'todo' LIMIT 1`, [projectId])).rows[0];
  const cols = (
    await pool.query(`SELECT id FROM columns WHERE board_id = $1 AND deleted_at IS NULL ORDER BY position ASC LIMIT 2`, [board.id])
  ).rows;
  if (cols.length < 2) throw new Error("need two live columns on the demo To-Do board");
  const cardIds: string[] = [];
  // Append after the column's last live card with real fractional keys —
  // the inline add computes the next key from what's on screen.
  let last: string | null =
    (await pool.query(`SELECT max(position) AS p FROM cards WHERE column_id = $1 AND deleted_at IS NULL`, [cols[0].id]))
      .rows[0]?.p ?? null;
  for (const title of titles) {
    // `cards.id` is app-generated (lib/uuid.ts), no DB default.
    const id = crypto.randomUUID();
    last = generateKeyBetween(last, null);
    await pool.query(
      `INSERT INTO cards (id, column_id, board_id, project_id, title, position, created_by)
       VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      [id, cols[0].id, board.id, projectId, title, last, userId],
    );
    cardIds.push(id);
  }
  return { boardId: board.id, todoColumnId: cols[0].id, otherColumnId: cols[1].id, cardIds };
}

async function cleanup(pool: Pool) {
  await pool.query(`DELETE FROM activities WHERE entity_id IN (SELECT id FROM cards WHERE title LIKE $1)`, [`${PREFIX}%`]).catch(() => {});
  await pool.query(`DELETE FROM cards WHERE title LIKE $1`, [`${PREFIX}%`]).catch(() => {});
}

test.describe("offline outbox", () => {
  // Both tests seed into the same demo column; keep them off each other.
  test.describe.configure({ mode: "serial" });
  test.beforeEach(({}, testInfo) => {
    test.skip(testInfo.project.name !== "chromium", "shared demo account; runs once");
    test.skip(!hasDatabase, "DATABASE_URL not set");
  });

  test("5 changes made offline land once, in order, after reconnecting", async ({ page, context, demoSession }) => {
    test.setTimeout(120_000);
    test.skip(!demoSession.projectId, "demo@wrangle.local has no personal project");
    const pool = openPool();
    try {
      const s = await seed(pool, demoSession.projectId!, demoSession.userId, [`${PREFIX} done-1`, `${PREFIX} done-2`, `${PREFIX} move-1`]);
      await page.setViewportSize({ width: 1440, height: 900 });
      await page.goto(`/p/${demoSession.projectId}/b/todo?view=list`);
      await expect(page.getByRole("tablist", { name: "Board switcher" })).toBeVisible();
      await expect(page.getByText(`${PREFIX} done-1`)).toBeVisible();

      await context.setOffline(true);
      const banner = page.getByTestId("outbox-banner");
      await expect(banner).toContainText("Offline");

      // Complete two seeded cards.
      await page.getByRole("button", { name: `Mark ${PREFIX} done-1 done` }).click();
      await page.getByRole("button", { name: `Mark ${PREFIX} done-2 done` }).click();
      // List view hides completed rows by default (showCompleted off), so the
      // overlay's effect is that they vanish — from IndexedDB, not the server.
      await expect(page.getByText(`${PREFIX} done-1`)).toBeHidden();
      await expect(page.getByText(`${PREFIX} done-2`)).toBeHidden();
      await expect(banner).toContainText("2 changes will sync");

      // Add two cards into the first column's group (one inline-add per group).
      const firstGroup = page.locator("main section").filter({ has: page.getByText(`${PREFIX} move-1`) }).first();
      await firstGroup.getByRole("button", { name: "Add task" }).click();
      const input = firstGroup.getByLabel("New task title");
      await input.fill(`${PREFIX} new-1`);
      await input.press("Enter");
      await expect(firstGroup.getByText(`${PREFIX} new-1`)).toBeVisible();
      await input.fill(`${PREFIX} new-2`);
      await input.press("Enter");
      await expect(firstGroup.getByText(`${PREFIX} new-2`)).toBeVisible();
      await input.press("Escape");

      // Move one seeded card into the second group by dragging its handle.
      const handle = page.getByRole("button", { name: `Reorder ${PREFIX} move-1` });
      const secondGroup = page.locator(`[data-group-id="${s.otherColumnId}"]`);
      const from = (await handle.boundingBox())!;
      const to = (await secondGroup.boundingBox())!;
      await page.mouse.move(from.x + from.width / 2, from.y + from.height / 2);
      await page.mouse.down();
      for (let i = 1; i <= 12; i++) {
        await page.mouse.move(
          from.x + from.width / 2 + ((to.x + 40 - from.x - from.width / 2) * i) / 12,
          from.y + from.height / 2 + ((to.y + 12 - from.y - from.height / 2) * i) / 12,
        );
      }
      await page.mouse.up();
      await expect(secondGroup.getByText(`${PREFIX} move-1`)).toBeVisible();

      await expect(banner).toContainText("5 changes will sync");
      // The two completed rows are hidden; the two new and the moved card show the pending dot.
      expect(await page.locator('[data-sync="pending"]').count()).toBeGreaterThanOrEqual(3);
      // Nothing reached the server yet.
      expect((await pool.query(`SELECT count(*)::int AS n FROM cards WHERE title LIKE $1`, [`${PREFIX} new-%`])).rows[0].n).toBe(0);

      await context.setOffline(false);
      await expect(banner).toBeHidden({ timeout: 30_000 });
      // The client's full cycle: applied → router.refresh() → settle, after
      // which no row carries a sync dot any more. (A hidden banner alone
      // doesn't prove that — "Syncing…" only shows after 1 s of draining.)
      await expect(page.locator("[data-sync]")).toHaveCount(0, { timeout: 30_000 });
      await expect.poll(async () => (await pool.query(`SELECT count(*)::int AS n FROM cards WHERE title LIKE $1`, [`${PREFIX} new-%`])).rows[0].n, { timeout: 30_000 }).toBe(2);

      await page.reload();
      await expect(page.getByRole("tablist", { name: "Board switcher" })).toBeVisible();
      await expect(page.getByText(`${PREFIX} new-1`)).toHaveCount(1);
      await expect(page.getByText(`${PREFIX} new-2`)).toHaveCount(1);
      await expect(page.locator("[data-sync]")).toHaveCount(0, { timeout: 15_000 });

      const rows = (
        await pool.query(
          `SELECT title, column_id, position, completed_at FROM cards WHERE title LIKE $1 AND deleted_at IS NULL ORDER BY title`,
          [`${PREFIX}%`],
        )
      ).rows as Array<{ title: string; column_id: string; position: string; completed_at: string | null }>;
      expect(rows.map((r) => r.title)).toEqual([
        `${PREFIX} done-1`,
        `${PREFIX} done-2`,
        `${PREFIX} move-1`,
        `${PREFIX} new-1`,
        `${PREFIX} new-2`,
      ]);
      expect(rows[0].completed_at).not.toBeNull();
      expect(rows[1].completed_at).not.toBeNull();
      expect(rows[2].column_id).toBe(s.otherColumnId);
      expect(rows[3].column_id).toBe(s.todoColumnId);
      expect(rows[4].column_id).toBe(s.todoColumnId);
      // Offline order kept: new-1 sorts before new-2 (and after the seeded cards).
      expect(rows[3].position < rows[4].position).toBe(true);
    } finally {
      await cleanup(pool);
      await pool.end();
    }
  });

  test("a card deleted on another device while offline: the change is dropped, not resurrected", async ({ page, context, demoSession }) => {
    test.setTimeout(90_000);
    test.skip(!demoSession.projectId, "demo@wrangle.local has no personal project");
    const pool = openPool();
    try {
      const s = await seed(pool, demoSession.projectId!, demoSession.userId, [`${PREFIX} conflict`]);
      await page.setViewportSize({ width: 1440, height: 900 });
      await page.goto(`/p/${demoSession.projectId}/b/todo?view=list`);
      await expect(page.getByText(`${PREFIX} conflict`)).toBeVisible();

      await context.setOffline(true);
      await page.getByRole("button", { name: `Mark ${PREFIX} conflict done` }).click();
      await expect(page.getByTestId("outbox-banner")).toContainText("1 change will sync");

      // "Another device" trashes the card meanwhile.
      await pool.query(`UPDATE cards SET deleted_at = now() WHERE id = $1`, [s.cardIds[0]]);

      await context.setOffline(false);
      await expect(page.getByText(`“${PREFIX} conflict” was deleted on another device`)).toBeVisible({ timeout: 30_000 });
      await expect(page.getByTestId("outbox-banner")).toBeHidden({ timeout: 30_000 });

      const [row] = (await pool.query(`SELECT deleted_at, completed_at FROM cards WHERE id = $1`, [s.cardIds[0]])).rows;
      expect(row.deleted_at).not.toBeNull();
      expect(row.completed_at).toBeNull();
      await page.reload();
      await expect(page.getByText(`${PREFIX} conflict`)).toHaveCount(0);
    } finally {
      await cleanup(pool);
      await pool.end();
    }
  });
});
