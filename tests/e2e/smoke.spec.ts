import { expect, test } from "@playwright/test";

test("protected routes redirect anonymous visitors to signin", async ({
  page,
}) => {
  await page.goto("/today");
  await expect(page).toHaveURL(/\/signin\?callbackUrl=%2Ftoday/);
});

test("signin offers both OAuth providers", async ({ page }) => {
  await page.goto("/signin");
  await expect(
    page.getByRole("button", { name: /continue with google/i }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: /continue with github/i }),
  ).toBeVisible();
});

test("landing page renders the product pitch", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { name: /wrangle it all/i })).toBeVisible();
  await expect(page.getByRole("link", { name: /get started/i })).toHaveAttribute(
    "href",
    "/signin",
  );
});
