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
  { path: "/self-test", heading: /Don.t trust us/ },
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

for (const persona of ["p2b", "p3a"]) {
  test(`/try/${persona} renders the results experience with no axe violations`, async ({ page }) => {
    await page.goto(`/try/${persona}`);
    await expect(page.getByRole("heading", { level: 1 })).toContainText(/What others see/);
    // The slider only becomes available once the distance renders are ready.
    const slider = page.getByRole("slider", { name: /Step back/ });
    await expect(slider).toBeVisible({ timeout: 30_000 });
    await expect(page.getByRole("heading", { name: "What others see", level: 2 })).toBeVisible();
    await expectNoAxeViolations(page);
  });
}

test("the Step back slider is keyboard operable and speaks its value", async ({ page }) => {
  await page.goto("/try/p2b");
  const slider = page.getByRole("slider", { name: /Step back/ });
  await expect(slider).toBeVisible({ timeout: 30_000 });
  await slider.focus();
  await slider.press("Home");
  await expect(slider).toHaveAttribute("aria-valuetext", /25 centimetres, mirror/i);
  await slider.press("End");
  await expect(slider).toHaveAttribute("aria-valuetext", /6 metres/);
  await slider.press("PageUp");
  await expect(slider).toHaveAttribute("aria-valuetext", /metres/);
});

test("a concern card expands and its receipt opens as a sheet", async ({ page }) => {
  await page.goto("/try/p2b");
  await expect(page.getByRole("slider", { name: /Step back/ })).toBeVisible({ timeout: 30_000 });

  const card = page.getByRole("button", { name: /Nobody sees your pores/ });
  await expect(card).toHaveAttribute("aria-expanded", "false");
  await card.click();
  await expect(card).toHaveAttribute("aria-expanded", "true");
  await expect(page.getByText("What this number means").first()).toBeVisible();

  await page.getByRole("button", { name: /How we know/ }).first().click();
  const dialog = page.getByRole("dialog");
  await expect(dialog).toBeVisible();
  await expect(dialog.getByText("YouCam found it here.")).toBeVisible();
  await expectNoAxeViolations(page);
  await page.keyboard.press("Escape");
  await expect(dialog).toBeHidden();
});

test("an unknown persona is a 404", async ({ page }) => {
  const res = await page.goto("/try/not-a-face");
  expect(res?.status()).toBe(404);
});

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

  test("the results page focuses in, then unlocks the controls", async ({ page }) => {
    await page.goto("/try/p3a");
    await expect(page.getByRole("status").first()).toBeAttached();
    await expect(page.getByRole("slider", { name: /Step back/ })).toBeVisible({ timeout: 30_000 });
  });
});
