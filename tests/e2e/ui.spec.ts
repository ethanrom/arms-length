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

const PERSONAS = ["p2b", "p3a", "p1a", "p5a"];

for (const persona of PERSONAS) {
  test(`/try/${persona} shows a real reading and has no axe violations`, async ({ page }) => {
    await page.goto(`/try/${persona}`);
    await expect(page.getByRole("heading", { level: 1 })).toContainText(/What others see/);
    // Labelled synthetic, with the recorded-analysis provenance.
    await expect(page.getByText(/Synthetic face [A-D]/).first()).toBeVisible();
    await expect(page.getByText(/recorded YouCam HD Skin Analysis of a synthetic face/)).toBeVisible();
    // The slider only becomes available once the distance renders are ready.
    const slider = page.getByRole("slider", { name: /Step back/ });
    await expect(slider).toBeVisible({ timeout: 30_000 });
    await expect(page.getByRole("heading", { name: "What others see", exact: true, level: 2 })).toBeVisible();

    // Real numbers in words and distances; no "illustrative" disclaimer, no N/100 score line, the estimate line is up.
    const cards = page.locator("button[aria-expanded]").filter({ hasText: /\d+ (m|cm)/ });
    await expect(cards.first()).toContainText(/\d+(\.\d)? (m|cm)/);
    await expect(page.getByText(/illustrative/i)).toHaveCount(0);
    await expect(page.getByText(/YouCam rates yours/)).toHaveCount(0);
    await expect(page.getByText(/An estimate from one photo, not a guarantee/)).toBeVisible();
    await expect(page.getByText(/Synthetic \(AI-generated\) face/).first()).toBeVisible();
    await expectNoAxeViolations(page);
  });
}

test("the Step back slider changes the live counter and speaks its value", async ({ page }) => {
  await page.goto("/try/p2b");
  const slider = page.getByRole("slider", { name: /Step back/ });
  await expect(slider).toBeVisible({ timeout: 30_000 });
  const pores = page.locator('[data-counter="pore"]');

  await slider.focus();
  await slider.press("Home");
  await expect(slider).toHaveAttribute("aria-valuetext", /25 centimetres, mirror/i);
  const near = await pores.textContent();
  expect(near).toMatch(/your pores are out of sight (from here|yet)$/);

  await slider.press("End");
  await expect(slider).toHaveAttribute("aria-valuetext", /6 metres/);
  await expect(pores).toHaveText("All of your pores are out of sight from here");
  expect(near).not.toBe("All of your pores are out of sight from here");

  await slider.press("PageUp");
  await expect(slider).toHaveAttribute("aria-valuetext", /metres/);
});

test("a concern card expands and its receipt opens as a sheet that follows the model", async ({ page }) => {
  await page.goto("/try/p2b");
  await expect(page.getByRole("slider", { name: /Step back/ })).toBeVisible({ timeout: 30_000 });

  const card = page.locator("button[aria-expanded]").filter({ hasText: /pores/i }).first();
  await expect(card).toHaveAttribute("aria-expanded", "false");
  await card.click();
  await expect(card).toHaveAttribute("aria-expanded", "true");
  await expect(page.getByText("What this number means").first()).toBeVisible();

  await page.getByRole("button", { name: /How we know\s*:\s*Pores/ }).click();
  const dialog = page.getByRole("dialog");
  await expect(dialog).toBeVisible();
  await expect(dialog.getByText("YouCam found it here.")).toBeVisible();
  await expect(dialog.getByText(/with the iris as the ruler/)).toBeVisible();
  await expect(dialog.getByText(/arcmin/).first()).toBeVisible();
  // Both observers are shown, with their thresholds and the exact counts.
  await expect(dialog.getByText("Needed by a typical sharp-eyed person")).toBeVisible();
  await expect(dialog.getByText("Needed by even perfect eyes")).toBeVisible();
  await expect(dialog.getByText(/for a typical sharp-eyed person looking right at them;/).first()).toBeVisible();
  await expect(dialog.getByText(/It has [\d.]+%/)).toBeVisible();

  // Past the bound (p2b's most visible pore stops at about 4.2 m) the verdict flips.
  await dialog.getByText("6 m", { exact: true }).click();
  await expect(dialog.getByText(/even perfect eyes couldn't pick it out from 6 m/)).toBeVisible();
  await expectNoAxeViolations(page);
  await page.keyboard.press("Escape");
  await expect(dialog).toBeHidden();
});

test("Worth it? lists each concern with the half-strength credit, and Make it disappear shows a verified try-on", async ({ page }) => {
  await page.goto("/try/p2b");
  await expect(page.getByRole("slider", { name: /Step back/ })).toBeVisible({ timeout: 30_000 });

  const worth = page.locator("#worth-it");
  await expect(worth.getByRole("heading", { level: 2 })).toContainText("Worth it?");
  await expect(worth.getByText(/YouCam Skin Simulation, half strength/).first()).toBeVisible();
  await expect(worth.getByRole("radio")).toHaveCount(6);

  const cover = page.locator("#make-it-disappear");
  await expect(cover.getByRole("radio")).toHaveCount(3);
  await expect(cover.getByText(/Honest answer|Checked on a virtual try-on/).first()).toBeVisible();
});

test("keyboard only: skip link, a persona card, a concern card and the receipt sheet", async ({ page }) => {
  await page.goto("/try");
  await page.keyboard.press("Tab");
  await expect(page.getByRole("link", { name: "Skip to content" })).toBeFocused();

  // Reach the first demo face and open it.
  await page.getByRole("link", { name: /Synthetic face A/ }).focus();
  await page.keyboard.press("Enter");
  await expect(page).toHaveURL(/\/try\/p2b$/);
  await expect(page.getByRole("slider", { name: /Step back/ })).toBeVisible({ timeout: 30_000 });

  const card = page.locator("button[aria-expanded]").filter({ hasText: /dark spots/i }).first();
  await card.focus();
  await page.keyboard.press("Enter");
  await expect(card).toHaveAttribute("aria-expanded", "true");

  const how = page.getByRole("button", { name: /How we know\s*:\s*Dark spots/ });
  await how.focus();
  await page.keyboard.press("Enter");
  const dialog = page.getByRole("dialog");
  await expect(dialog).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(dialog).toBeHidden();
  await expect(how).toBeFocused();
});

test("an unknown persona shows the not-found page", async ({ page }) => {
  await page.goto("/try/not-a-face");
  await expect(page.getByRole("heading", { level: 1 })).toContainText(/out of focus/i);
  await expectNoAxeViolations(page);
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
