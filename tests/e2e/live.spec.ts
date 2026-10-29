import path from "node:path";
import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";

// The server runs with YOUCAM_MODE=replay (playwright.config.ts): the access gate reports replay_only and an uploaded
// photo is answered with the recorded p2b analysis. No YouCam unit is ever spent here. The out-of-credits and own-key
// screens are driven by routing the status call, so they need no key and no units either.
const RESERVED = "Live analysis needs your own YouCam API key or an access code here. Try a demo face.";
const OUT_OF_CREDITS = "Our live credits are used up for now. Use your own YouCam API key to continue, or try a demo face.";
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
  // The own-key and access-code fields sit in a collapsed disclosure: live is open, so most visitors never need them.
  await expect(page.getByLabel(/Access code/)).toBeHidden();
  await page.getByText("Have a YouCam API key? Use your own").click();
  await expect(page.getByLabel(/YouCam API key/)).toBeVisible();
  await expect(page.getByLabel(/Access code/)).toBeVisible();
  await expectNoAxeViolations(page);
  await page.getByRole("checkbox", { name: /I am 18 or over/ }).check();
  await page.getByRole("button", { name: "Use my photo" }).click();
  await expect(page).toHaveURL(/\/try\/live$/);

  // /try already asked for the 18+ confirmation, so this page goes straight to the capture flow, with the consent text.
  await expect(page.getByRole("heading", { name: "Before you add a photo" })).toHaveCount(0);
  await expect(page.getByText(/We ask YouCam to delete your photo and its results when you leave this page. We don.t store your photo/).first()).toBeVisible({ timeout: 30_000 });

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
  await expect(page.getByRole("slider", { name: /Step back/ })).toBeVisible({ timeout: 60_000 });
  await expect(page.locator('[data-counter="pore"]')).toContainText(/your pores are out of sight/);
  // The same tabs as a demo face, with the rows following the slider.
  await expect(page.getByRole("tablist").getByRole("tab")).toHaveText(["What they see", "Tomorrow", "The lightest touch", "Worth it?", "Share"]);

  // An own photo never goes on a share card.
  await page.getByRole("tab", { name: "Share" }).click();
  await expect(page.locator("#share")).toContainText(/never put on a card/);
  await expect(page.locator("#share").getByLabel("Include the synthetic face")).toHaveCount(0);

  // Worth it? fills in from the background simulations.
  await page.getByRole("tab", { name: "Worth it?" }).click();
  const worth = page.locator("#worth-it");
  await expect(worth.getByRole("radio").first()).toBeVisible({ timeout: 90_000 });

  // The lightest touch runs only on request.
  await page.getByRole("tab", { name: "The lightest touch" }).click();
  const cover = page.locator("#make-it-disappear");
  await expect(cover.getByRole("button", { name: "Find the lightest touch" })).toBeVisible();
  await cover.getByRole("button", { name: "Find the lightest touch" }).click();
  // "Checked on a virtual try-on" is also the section's eyebrow, so wait on the search's own result instead.
  await expect(cover.getByText(/Most of the effect comes at|layer is enough|Already out of sight|Makeup didn't change/).first()).toBeVisible({ timeout: 120_000 });
  await expect(cover.getByText(/Honest answer|Checked on a virtual try-on/).first()).toBeVisible();
  await expect(cover.getByRole("img", { name: /Virtual try-on\.$/ }).first()).toBeVisible({ timeout: 60_000 });
  await expectNoAxeViolations(page);
});

test("when uploads are turned away, the camera step is replaced by a calm card before any prompt", async ({ page }) => {
  await page.route("**/api/youcam/status", (route) => route.fulfill({ json: { live: false, reason: "replay_only", uploadsAllowed: false } }));
  await page.goto("/try/live");
  await expect(page.locator("p[role=alert]")).toHaveText(RESERVED);
  await expect(page.getByLabel("YouCam API key")).toBeVisible();
  await expect(page.getByLabel("Access code")).toBeVisible();
  await expect(page.getByRole("link", { name: /Synthetic face [A-D]/ })).toHaveCount(4);
  await expect(page.getByLabel("I'm 18 or older")).toHaveCount(0);
  await expect(page.locator('input[type="file"]')).toHaveCount(0);
  await expectNoAxeViolations(page);
});

test("out of live credits, the card offers the visitor's own YouCam key first, and a key that works opens the camera step", async ({ page }) => {
  const KEY = "e2e-not-a-real-key-123";
  const sent: (string | undefined)[] = [];
  await page.route("**/api/youcam/status", (route) => {
    const key = route.request().headers()["x-youcam-key"];
    sent.push(key);
    return route.fulfill({
      json: key
        ? { live: true, byok: true, keyOk: true, uploadsAllowed: true }
        : { live: false, reason: "budget_floor", open: true, uploadsAllowed: false },
    });
  });
  await page.goto("/try/live");
  await expect(page.locator("p[role=alert]")).toHaveText(OUT_OF_CREDITS);
  await expect(page.getByRole("link", { name: /Synthetic face [A-D]/ })).toHaveCount(4);
  await expect(page.locator('input[type="file"]')).toHaveCount(0);
  const fields = page.locator("form input[type=password]");
  await expect(fields).toHaveCount(2);
  await expect(fields.first()).toHaveAccessibleName("YouCam API key"); // the key comes first, the code second
  await expect(fields.last()).toHaveAccessibleName("Access code");
  await expectNoAxeViolations(page);

  await fields.first().fill(KEY);
  await page.getByRole("button", { name: "Use my key" }).click();
  await expect(page.getByRole("heading", { name: "Before you add a photo" })).toBeVisible({ timeout: 30_000 });
  expect(sent[sent.length - 1]).toBe(KEY);
  expect(await page.evaluate(() => window.sessionStorage.getItem("arms-length:youcam-key"))).toBe(KEY);
  await expect(page.locator("p[role=alert]")).toHaveCount(0);
});

test("opened directly, the live page asks for the 18+ confirmation before any camera prompt", async ({ page }) => {
  await page.goto("/try/live");
  await expect(page.getByRole("heading", { name: "Before you add a photo" })).toBeVisible({ timeout: 30_000 });
  await expect(page.getByText(/We ask YouCam to delete your photo and its results when you leave this page. We don.t store your photo/).first()).toBeVisible();
  await expect(page.getByText(/One exception: YouCam can.t delete the Skin Simulation picture early/).first()).toBeVisible();
  await expect(page.locator('input[type="file"]')).toHaveCount(0);
  await expectNoAxeViolations(page);
  await page.getByLabel("I'm 18 or older").check();
  await expect(page.getByRole("heading", { name: /Add a photo/ })).toBeVisible({ timeout: 30_000 });
  await expect(page.locator('input[type="file"]')).toHaveCount(1);
  await expectNoAxeViolations(page);
});
