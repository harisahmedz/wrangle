// ROADMAP-V3 S0 "done when": the OpenRouter key never appears in a request to
// our origin. Pastes a canary key in Settings → AI, exercises the one server
// round trip the panel makes (saving the mode), reloads, and checks every
// request to the app origin for the canary. No request leaves for
// openrouter.ai here (the Test button isn't pressed).
import { expect, hasDatabase, test } from "./fixtures/auth";

test.beforeEach(({ demoSession }, testInfo) => {
  test.skip(!hasDatabase, "DATABASE_URL not set");
  test.skip(testInfo.project.name !== "chromium", "runs once");
  test.skip(!demoSession.userId, "demo@wrangle.local not seeded");
});

test("a pasted OpenRouter key stays on the device and never reaches our origin", async ({ page, baseURL }) => {
  const canary = `sk-or-v1-e2e-canary-${Date.now()}`;
  const leaks: string[] = [];
  page.on("request", (req) => {
    if (!req.url().startsWith(baseURL!)) return;
    const hay = [req.url(), req.postData() ?? "", JSON.stringify(req.headers())].join("\n");
    if (hay.includes(canary)) leaks.push(`${req.method()} ${req.url()}`);
  });

  await page.goto("/settings");
  const panel = page.getByRole("heading", { name: "AI" }).locator("..");
  await expect(panel.getByText("Not connected.")).toBeVisible();

  await panel.getByRole("button", { name: "Paste a key instead" }).click();
  await panel.getByLabel("OpenRouter API key").fill(canary);
  await panel.getByRole("button", { name: "Save key" }).click();
  await expect(panel.getByText(/Connected with a pasted key/)).toBeVisible();

  // The mode is the only thing that syncs; it goes through a Server Action.
  await panel.getByText("On-device, then OpenRouter").click();
  await expect(panel.getByText("Saved")).toBeVisible();

  await page.reload();
  const again = page.getByRole("heading", { name: "AI" }).locator("..");
  await expect(again.getByText(/Connected with a pasted key/)).toBeVisible();
  await expect(again.getByRole("radio", { name: "On-device, then OpenRouter" })).toBeChecked();

  expect(leaks).toEqual([]);

  // Leave the shared demo user as we found it.
  await again.getByRole("button", { name: "Revoke" }).click();
  await expect(again.getByText("Not connected.")).toBeVisible();
  await again.getByText("Off", { exact: true }).click();
  await expect(again.getByText("Saved")).toBeVisible();
  expect(leaks).toEqual([]);
});
