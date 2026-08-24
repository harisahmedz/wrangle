import { expect, test } from "@playwright/test";

test("project and trash routes redirect anonymous visitors", async ({
  page,
}) => {
  await page.goto("/p/00000000-0000-0000-0000-000000000000");
  await expect(page).toHaveURL(/\/signin\?callbackUrl=/);

  await page.goto("/trash");
  await expect(page).toHaveURL(/\/signin\?callbackUrl=%2Ftrash/);
});
