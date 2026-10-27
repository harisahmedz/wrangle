// ROADMAP-V2 S4 "done when": the Board/List choice syncs across two
// browsers (here: across a reload, which round-trips through the DB the
// same way a second browser would). DB-gated like
// tests/unit/seed-boards.test.ts — skipped wherever DATABASE_URL isn't set.
//
// Note: this touches demo@wrangle.local's shared `users.prefs` row directly
// (reset before/after), so don't run it concurrently with another job that
// also mutates that account (platform-and-tooling.md §5: shared-DB jobs run
// one at a time).
import { expect, hasDatabase, openPool, test } from "./fixtures/auth";
import type { Pool } from "@neondatabase/serverless";

/**
 * The View menu persists via a fire-and-forget `setViewPref` call (the UI
 * updates immediately from local state, same as any other lib/mutations
 * call site) — so a reload right after clicking can race the write.
 * Poll the DB instead of guessing a sleep long enough to cover it.
 */
async function waitForSavedLayout(
  pool: Pool,
  userId: string,
  boardId: string,
  layout: "board" | "list",
) {
  await expect
    .poll(
      async () => {
        const row = await pool.query(`SELECT prefs FROM users WHERE id = $1`, [userId]);
        return row.rows[0]?.prefs?.views?.[boardId]?.layout;
      },
      { timeout: 5_000 },
    )
    .toBe(layout);
}

test("View menu: List choice persists per board across a reload", async ({ page, demoSession }, testInfo) => {
  // Both Playwright projects would run this in parallel against the same demo
  // user's users.prefs row (one's reset clobbers the other's poll), and the
  // viewport is forced to desktop below anyway, so run it once.
  test.skip(testInfo.project.name !== "chromium", "shared demo prefs row; viewport is set explicitly");
  // Three reloads + DB polls; the Pixel 7 project runs close to the 30s default.
  test.setTimeout(60_000);
  test.skip(!hasDatabase, "DATABASE_URL not set");
  test.skip(!demoSession.projectId, "demo@wrangle.local has no personal project to test against");

  const pool = openPool();
  const boardUrl = `/p/${demoSession.projectId}/b/todo`;

  try {
    const boardRow = await pool.query(
      `SELECT id FROM boards WHERE project_id = $1 AND kind = 'todo' LIMIT 1`,
      [demoSession.projectId],
    );
    const boardId: string | undefined = boardRow.rows[0]?.id;
    test.skip(!boardId, "demo@wrangle.local has no To-Do board to test against");
    if (!boardId) return;

    await pool.query(`UPDATE users SET prefs = NULL WHERE id = $1`, [demoSession.userId]);

    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto(boardUrl);
    await expect(page.getByRole("tablist", { name: "Board switcher" })).toBeVisible();

    await test.step("no saved pref: desktop default is Board", async () => {
      await expect(page.getByText("+ Add column")).toBeVisible();
    });

    await test.step("View -> List switches immediately, then persists", async () => {
      await page.locator("main").getByRole("button", { name: "View" }).first().click();
      await page.getByRole("button", { name: "list", exact: true }).click();
      await expect(page.locator("main").getByText("Add task").first()).toBeVisible();
      await waitForSavedLayout(pool, demoSession.userId, boardId, "list");
    });

    await test.step("the choice persisted (round-tripped through users.prefs)", async () => {
      await page.reload();
      await expect(page.getByRole("tablist", { name: "Board switcher" })).toBeVisible();
      await expect(page.locator("main").getByText("Add task").first()).toBeVisible();
    });

    await test.step("switching back to Board persists too", async () => {
      await page.locator("main").getByRole("button", { name: "View" }).first().click();
      await page.getByRole("button", { name: "board", exact: true }).click();
      await waitForSavedLayout(pool, demoSession.userId, boardId, "board");

      await page.reload();
      await expect(page.getByRole("tablist", { name: "Board switcher" })).toBeVisible();
      await expect(page.getByText("+ Add column")).toBeVisible();
    });
  } finally {
    await pool.query(`UPDATE users SET prefs = NULL WHERE id = $1`, [demoSession.userId]).catch(() => {});
    await pool.end();
  }
});
