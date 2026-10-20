import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";

test.use({ reducedMotion: "reduce" });

test("home loads with the headline and no axe violations", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { level: 1 })).toContainText("25");
  await expect(page.getByRole("link", { name: "Arm's Length, home" })).toBeVisible();

  const { violations } = await new AxeBuilder({ page }).analyze();
  expect(violations).toEqual([]);
});
