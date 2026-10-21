import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";

async function expectNoAxeViolations(page: Page) {
  const { violations } = await new AxeBuilder({ page }).analyze();
  const summary = violations.map((v) => ({ id: v.id, impact: v.impact, nodes: v.nodes.slice(0, 3).map((n) => n.html.slice(0, 160)) }));
  expect(summary).toEqual([]);
}

// Deterministic: no autoplay, no fades mid-scan.
test.use({ reducedMotion: "reduce" });

const STATIC_PAGES: { path: string; heading: RegExp }[] = [
  { path: "/", heading: /25\s*cm/ },
  { path: "/try", heading: /Whose skin should/ },
  { path: "/self-test", heading: /your own eyes/ },
  { path: "/privacy", heading: /in plain words/ },
  { path: "/how-it-works", heading: /From a skin analysis/ },
  { path: "/for-brands", heading: /visibility layer/ },
];

for (const { path, heading } of STATIC_PAGES) {
  test(`${path} loads, has a heading and no axe violations`, async ({ page }) => {
    await page.goto(path);
    await expect(page.getByRole("heading", { level: 1 })).toContainText(heading);
    await expect(page.getByRole("main")).toBeVisible();
    await expectNoAxeViolations(page);
  });
}

test.describe("with motion", () => {
  test.use({ reducedMotion: "no-preference" });

  test("the landing visual hands the slider over after its pass", async ({ page }) => {
    await page.goto("/");
    const slider = page.getByRole("slider", { name: /Step back from the mirror/ });
    await expect(slider).toBeVisible();
    await slider.focus();
    await slider.press("End");
    await expect(slider).toHaveAttribute("aria-valuetext", /6 metres/);
  });
});
