// ROADMAP-V2 S3 "done when": every route is reachable by pointer at every
// width, and the sidebar collapse/overlay behave. Viewports are set per test,
// so these run once (desktop project) rather than per device project.
import { expect, hasDatabase, test } from "./fixtures/auth";

test.beforeEach(({ demoSession }, testInfo) => {
  test.skip(!hasDatabase, "DATABASE_URL not set");
  test.skip(testInfo.project.name !== "chromium", "viewport is set per test");
  test.skip(!demoSession.userId, "demo@wrangle.local not seeded");
});

const isCollapsed = (page: import("@playwright/test").Page) =>
  page.evaluate(() => document.documentElement.classList.contains("sidebar-collapsed"));

test("desktop: pinned sidebar collapses, persists across reload, [ toggles back", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/today");
  const sidebar = page.locator("#app-sidebar");
  await expect(sidebar).toBeVisible();

  await page.getByRole("button", { name: "Collapse sidebar" }).click();
  await expect(sidebar).toBeHidden();
  expect(await isCollapsed(page)).toBe(true);

  await page.reload();
  expect(await isCollapsed(page)).toBe(true);
  await expect(sidebar).toBeHidden();

  // Focus stays on <body> after reload, so the global hotkey listener gets it.
  await page.keyboard.press("[");
  await expect(sidebar).toBeVisible();
  expect(await isCollapsed(page)).toBe(false);
});

test("desktop: sidebar nav reaches Upcoming and Money; Add task opens quick add", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/today");
  const sidebar = page.locator("#app-sidebar");

  await sidebar.getByRole("link", { name: "Upcoming" }).click();
  await page.waitForURL("**/upcoming");
  await sidebar.getByRole("link", { name: "Money" }).click();
  await page.waitForURL("**/money");

  await sidebar.getByRole("button", { name: /Add task/ }).click();
  await expect(page.getByRole("dialog")).toBeVisible();
});

test("tablet portrait: overlay opens from the top bar and closes after navigating", async ({ page }) => {
  await page.setViewportSize({ width: 820, height: 1180 });
  await page.goto("/today");
  await expect(page.locator("#app-sidebar")).toBeHidden();

  await page.getByRole("button", { name: "Open sidebar" }).click();
  const overlay = page.getByRole("dialog");
  await expect(overlay).toBeVisible();

  await overlay.getByRole("link", { name: "Learn" }).click();
  await page.waitForURL("**/learn");
  await expect(page.getByRole("dialog")).toBeHidden();
});
