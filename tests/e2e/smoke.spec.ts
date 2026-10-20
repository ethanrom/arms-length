import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";

test("home loads with the heading and no axe violations", async ({ page }) => {
  await page.goto("/");
  await expect(
    page.getByRole("heading", { level: 1, name: "Arm's Length" }),
  ).toBeVisible();

  const { violations } = await new AxeBuilder({ page }).analyze();
  expect(violations).toEqual([]);
});
