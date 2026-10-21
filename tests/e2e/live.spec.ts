import path from "node:path";
import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";

// The server runs with YOUCAM_MODE=replay (playwright.config.ts): the access gate reports replay_only and an uploaded
// photo is answered with the recorded p2b analysis. No YouCam unit is ever spent here.
test.use({ reducedMotion: "reduce" });

const PHOTO = path.join(process.cwd(), "fixtures", "youcam", "p2b", "input.jpg");

async function expectNoAxeViolations(page: Page) {
  const { violations } = await new AxeBuilder({ page }).analyze();
  expect(violations.map((v) => ({ id: v.id, nodes: v.nodes.slice(0, 2).map((n) => n.html.slice(0, 140)) }))).toEqual([]);
}

test("the status route says replay_only in replay mode", async ({ request }) => {
  const res = await request.get("/api/youcam/status");
  expect(await res.json()).toEqual({ live: false, reason: "replay_only" });
});

test("Check mine: gate, upload, results from a replayed analysis, then the lightest touch", async ({ page }) => {
  test.setTimeout(180_000);
  await page.goto("/try");
  await expect(page.getByLabel(/Access code/)).toBeVisible();
  await page.getByRole("button", { name: "Check mine" }).click();
  await expect(page).toHaveURL(/\/try\/live$/);

  // Before any camera prompt: the consent text, and one plain checkbox for age.
  await expect(page.getByRole("heading", { name: "Before you add a photo" })).toBeVisible({ timeout: 30_000 });
  await expect(page.getByText(/deleted from YouCam when you leave this page. We don.t store your photo. YouCam may keep the simulated picture for up to 24 hours/).first()).toBeVisible();
  await expect(page.locator('input[type="file"]')).toHaveCount(0);
  await expectNoAxeViolations(page);
  await page.getByLabel("I'm 18 or older").check();

  // The capture flow, with the optional photo upload.
  await expect(page.getByRole("heading", { name: /Add a photo/ })).toBeVisible({ timeout: 30_000 });
  await expectNoAxeViolations(page);
  await page.locator('input[type="file"]').setInputFiles(PHOTO);
  const use = page.getByRole("button", { name: "Use this photo" });
  await expect(use).toBeVisible({ timeout: 60_000 });
  await use.click();

  // Analysis (replayed), measured in the worker, then the same results experience as a demo face.
  await expect(page.getByRole("heading", { level: 1 })).toContainText(/What others see/, { timeout: 90_000 });
  await expect(page.getByText(/Replay mode/).first()).toBeVisible();
  await expect(page.getByRole("region", { name: "Built on YouCam" })).toContainText("Replay of a recording (0 units)");
  await expect(page.getByRole("img", { name: /synthetic stand-in portrait/i })).toBeVisible({ timeout: 60_000 });
  // An own photo never goes on a share card.
  await expect(page.locator("#share")).toContainText(/never put on a card/);
  await expect(page.locator("#share").getByLabel("Include the synthetic face")).toHaveCount(0);
  await expect(page.getByRole("slider", { name: /Step back/ })).toBeVisible({ timeout: 60_000 });
  await expect(page.locator('[data-counter="pore"]')).toContainText(/your pores are out of sight/);

  // Worth it? fills in from the background simulations.
  const worth = page.locator("#worth-it");
  await expect(worth.getByRole("radio").first()).toBeVisible({ timeout: 90_000 });

  // The lightest touch runs only on request.
  const cover = page.locator("#make-it-disappear");
  await expect(cover.getByRole("button", { name: "Find the lightest touch" })).toBeVisible();
  await cover.getByRole("button", { name: "Find the lightest touch" }).click();
  await expect(cover.getByText(/Honest answer|Checked on a virtual try-on/).first()).toBeVisible({ timeout: 120_000 });
  await expect(cover.getByText(/Most of the effect comes at|layer is enough|Already out of sight|Makeup didn't change/).first()).toBeVisible();
  await expect(cover.getByRole("img", { name: /Virtual try-on\.$/ }).first()).toBeVisible({ timeout: 60_000 });
  await expectNoAxeViolations(page);
});

test("when uploads are turned away, the camera step is replaced by a calm card before any prompt", async ({ page }) => {
  await page.route("**/api/youcam/status", (route) => route.fulfill({ json: { live: false, reason: "replay_only", uploadsAllowed: false } }));
  await page.goto("/try/live");
  await expect(page.locator("p[role=alert]")).toHaveText("Live analysis is reserved for judges with an access code. Try a demo face.");
  await expect(page.getByLabel("Access code")).toBeVisible();
  await expect(page.getByRole("link", { name: /Synthetic face [A-D]/ })).toHaveCount(4);
  await expect(page.getByLabel("I'm 18 or older")).toHaveCount(0);
  await expect(page.locator('input[type="file"]')).toHaveCount(0);
  await expectNoAxeViolations(page);
});
