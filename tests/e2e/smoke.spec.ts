import { expect, test } from "@playwright/test";

test("renders the Chess Mentor heading in Microsoft Edge", async ({ page }) => {
  await page.goto("/");
  await expect(
    page.getByRole("heading", { level: 1, name: "Chess Mentor" }),
  ).toBeVisible();
});
