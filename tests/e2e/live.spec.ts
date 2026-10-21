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
  expect(await res.json()).toEqual({ live: false, reason: "replay_only", uploadsAllowed: true });
});

test("Use my photo: gate, upload, results from a replayed analysis, then the lightest touch", async ({ page }) => {
  test.setTimeout(180_000);
  await page.goto("/try");
  await expect(page.getByLabel(/Access code/)).toBeVisible();
  await page.getByRole("checkbox", { name: /I am 18 or over/ }).check();
  await page.getByRole("button", { name: "Use my photo" }).click();
  await expect(page).toHaveURL(/\/try\/live$/);

  // The capture flow, with the optional photo upload.
  await expect(page.getByRole("heading", { name: /Add a photo/ })).toBeVisible({ timeout: 30_000 });
  await expect(page.getByText(/deleted from YouCam when you leave this page. We don.t store your photo/).first()).toBeVisible();
  await expectNoAxeViolations(page);
  await page.locator('input[type="file"]').setInputFiles(PHOTO);
  const use = page.getByRole("button", { name: "Use this photo" });
  await expect(use).toBeVisible({ timeout: 60_000 });
  await use.click();

  // Analysis (replayed), measured in the worker, then the same results experience as a demo face.
  await expect(page.getByRole("heading", { level: 1 })).toContainText(/What others see/, { timeout: 90_000 });
  await expect(page.getByText(/Replay mode/).first()).toBeVisible();
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
  await expectNoAxeViolations(page);
});
