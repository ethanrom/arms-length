import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";

async function expectNoAxeViolations(page: Page) {
  const { violations } = await new AxeBuilder({ page }).analyze();
  const summary = violations.map((v) => ({ id: v.id, impact: v.impact, nodes: v.nodes.slice(0, 3).map((n) => n.html.slice(0, 160)) }));
  expect(summary).toEqual([]);
}

// Deterministic: no autoplay, no fades mid-scan.
test.use({ reducedMotion: "reduce" });

const PERSONAS = ["p2b", "p3a", "p1a", "p5a"];

/** The seam only exists once the real renders are ready, so it marks "the hero has finished loading". */
async function ready(page: Page) {
  await expect(page.getByRole("slider", { name: /Step back/ })).toBeVisible({ timeout: 30_000 });
  await expect(page.getByTestId("seam")).toBeVisible({ timeout: 60_000 });
}

for (const persona of PERSONAS) {
  test(`/try/${persona} shows a real reading and has no axe violations`, async ({ page }) => {
    await page.goto(`/try/${persona}`);
    await ready(page);
    await expect(page.getByRole("heading", { level: 1 })).toContainText(/What others see/);
    // Labelled synthetic, with the recorded-analysis provenance.
    await expect(page.getByText(/Synthetic face [A-D]/).first()).toBeVisible();
    await expect(page.getByText(/recorded YouCam HD Skin Analysis of a synthetic face/)).toBeVisible();
    await expect(page.getByRole("heading", { name: "What others see", exact: true, level: 2 })).toBeVisible();

    // Words and distances; no "illustrative" disclaimer, no N/100 score line, the estimate line is up under the face.
    const cards = page.locator("button[aria-expanded]").filter({ hasText: /\d+(\.\d)? (m|cm)|out of sight|picked out/ });
    await expect(cards.first()).toBeVisible();
    await expect(page.getByText(/illustrative|placeholder|mock/i)).toHaveCount(0);
    await expect(page.getByText(/YouCam rates yours/)).toHaveCount(0);
    await expect(page.getByText(/An estimate from one photo, not a guarantee/)).toBeVisible();
    await expect(page.getByText(/Synthetic \(AI-generated\) face/).first()).toBeVisible();
    await expectNoAxeViolations(page);
  });
}

for (const viewport of [
  { width: 1440, height: 900 },
  { width: 390, height: 844 },
]) {
  test(`the face and the Step back slider are the first thing at ${viewport.width}x${viewport.height}`, async ({ page }) => {
    await page.setViewportSize(viewport);
    await page.goto("/try/p2b");
    const stage = page.getByTestId("step-back-stage");
    await expect(stage).toBeVisible();
    const face = (await stage.boundingBox())!;
    expect(face.y + face.height).toBeLessThanOrEqual(viewport.height);

    // The slider sits above the fold with the face, and the named stops are next to it.
    const slider = (await page.getByRole("slider", { name: /Step back/ }).boundingBox())!;
    expect(slider.y + slider.height).toBeLessThanOrEqual(viewport.height + 1);
    await expect(page.getByRole("button", { name: "Across a table", exact: true })).toBeInViewport();

    // The title, the description and the YouCam detections come after it.
    const title = (await page.getByRole("heading", { level: 1 }).boundingBox())!;
    expect(title.y).toBeGreaterThan(face.y + face.height);
    const detected = page.getByRole("button", { name: "Show what YouCam detected" });
    await expect(detected).toHaveAttribute("aria-expanded", "false");
    expect((await detected.boundingBox())!.y).toBeGreaterThan(face.y + face.height);
    await expect(page.getByRole("img", { name: /Synthetic portrait/ })).toHaveCount(1);
  });
}

test("the YouCam strip says what it is built on, what a session costs and that this reading is a recording", async ({ page }) => {
  await page.goto("/try/p3a");
  const strip = page.getByRole("region", { name: "Built on YouCam" });
  await expect(strip).toContainText("HD Skin Analysis · Skin Simulation · Makeup VTO");
  await expect(strip).toContainText("16 + 6 + up to 4 units per session");
  await expect(strip).toContainText("Recorded analysis (demo, 0 units)");
  await expect(strip).toContainText("YouCam's AI finds it. Vision science measures it.");
  const badge = page.getByRole("link", { name: "Checked against a published eye study: ModelFest, 16 observers, 0.69 dB error" });
  await expect(badge).toHaveAttribute("href", "/how-it-works#validation");
});

test("named-distance buttons move the Step back slider and change the readout", async ({ page }) => {
  await page.goto("/try/p2b");
  await ready(page);
  const slider = page.getByRole("slider", { name: /Step back/ });
  const readout = page.getByTestId("readout");

  await page.getByRole("button", { name: "Across a room", exact: true }).click();
  await expect(readout).toHaveText(/^4\s*m$/);
  await expect(slider).toHaveAttribute("aria-valuetext", /4 metres, across a room/i);
  await expect(page.getByRole("button", { name: "Across a room", exact: true })).toHaveAttribute("aria-pressed", "true");
  await expect(page.locator('[data-counter="pore"]')).toHaveText(/out of sight from here$/);

  await page.getByRole("button", { name: "Mirror", exact: true }).click();
  await expect(readout).toHaveText(/^25\s*cm$/);
  await expect(slider).toHaveAttribute("aria-valuetext", /25 centimetres, mirror/i);
  await expect(page.getByRole("button", { name: "Across a room", exact: true })).toHaveAttribute("aria-pressed", "false");
});

test("the You | Them seam works from the keyboard", async ({ page }) => {
  await page.goto("/try/p2b");
  await ready(page);
  const seam = page.getByRole("slider", { name: /Compare the mirror view/ });
  await expect(seam).toHaveAttribute("aria-valuenow", "50");
  await seam.focus();
  await seam.press("ArrowRight");
  await seam.press("ArrowRight");
  await expect(seam).toHaveAttribute("aria-valuenow", "54");
  await seam.press("ArrowLeft");
  await expect(seam).toHaveAttribute("aria-valuenow", "52");
  await seam.press("End");
  await expect(seam).toHaveAttribute("aria-valuenow", "100");
  await seam.press("Home");
  await expect(seam).toHaveAttribute("aria-valuenow", "0");
  // It is separate from the distance slider.
  await expect(page.getByRole("slider", { name: /Step back/ })).toHaveAttribute("aria-valuetext", /1 metre, conversation/i);
});

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

test("when the softened view cannot be drawn, the photo, a message and the whole readout stay usable", async ({ page }) => {
  // No 2D canvas: the real renderer cannot decode the photo, which is the failure the old page dead-ended on.
  await page.addInitScript(() => {
    HTMLCanvasElement.prototype.getContext = () => null;
  });
  await page.goto("/try/p2b");
  const failed = page.getByTestId("render-failed");
  await expect(failed).toBeVisible({ timeout: 30_000 });
  await expect(failed).toContainText(/couldn.t be drawn/);
  await expect(page.getByRole("img", { name: /Synthetic portrait/ })).toBeVisible();

  const slider = page.getByRole("slider", { name: /Step back/ });
  await slider.focus();
  await slider.press("End");
  await expect(slider).toHaveAttribute("aria-valuetext", /6 metres/);
  await expect(page.locator('[data-counter="pore"]')).toHaveText("All of your pores are out of sight from here");
  await page.getByRole("button", { name: "Conversation", exact: true }).click();
  await expect(page.getByTestId("readout")).toHaveText(/^1\s*m$/);
  await expectNoAxeViolations(page);
});

test("the explorer opens on good news, never the worst, and a card keeps its mark-safety line", async ({ page }) => {
  await page.goto("/try/p2b");
  await ready(page);
  const open = page.locator("h4 button[aria-expanded='true']");
  await expect(open).toHaveCount(1);
  await expect(open).toContainText(/pores/i);
  await expect(page.locator("h4 button[aria-expanded]").filter({ hasText: /under-eye shadows/i })).toHaveAttribute("aria-expanded", "false");
  // The dark-spots card carries the line without being opened, and a data table sits behind the chart.
  await expect(page.getByText(/ask a doctor or pharmacist/).first()).toBeVisible();
  await page.getByText("Show the data").first().click();
  await expect(page.getByRole("table").first()).toBeVisible();
  // No raw counts of marks on the main surface.
  await expect(page.locator("#what-others-see")).not.toContainText(/\b\d+ of (your )?\d+\b/);
});

test("a receipt shows both thresholds, where the size comes from, and the safety line for marks", async ({ page }) => {
  await page.goto("/try/p2b");
  await expect(page.getByRole("slider", { name: /Step back/ })).toBeVisible({ timeout: 30_000 });

  const card = page.locator("h4 button[aria-expanded]").filter({ hasText: /pores/i }).first();
  await expect(card).toHaveAttribute("aria-expanded", "true");
  await card.click();
  await expect(card).toHaveAttribute("aria-expanded", "false");
  await card.click();
  await expect(page.getByText("What this number means").first()).toBeVisible();

  await page.getByRole("button", { name: /How we know\s*:\s*Pores/ }).click();
  const dialog = page.getByRole("dialog");
  await expect(dialog).toBeVisible();
  await expect(dialog.getByText("YouCam found it here.")).toBeVisible();
  await expect(dialog.getByText(/with the iris as the ruler/)).toBeVisible();
  await expect(dialog.getByText(/arcmin/).first()).toBeVisible();
  // A pore's mask is a fixed-size marker: its drawing size is never presented as a measurement.
  await expect(dialog.getByText(/fixed-size marker/)).toBeVisible();
  await expect(dialog.getByText(/Measured in the photo|Assumed size/)).toBeVisible();
  await expect(dialog.getByText("Measured from the mask outline")).toHaveCount(0);
  // Both observers, with their thresholds and the exact counts.
  await expect(dialog.getByText("Needed by a typical sharp-eyed person")).toBeVisible();
  await expect(dialog.getByText("Needed by even perfect eyes")).toBeVisible();
  await expect(dialog.getByText(/a typical sharp-eyed person needs about [\d.]+% contrast to see it, and even perfect eyes need about [\d.]+%/)).toBeVisible();
  await expect(dialog.getByText(/for a typical sharp-eyed person looking right at them;/).first()).toBeVisible();
  await expect(dialog.getByText(/It has [\d.]+%/)).toBeVisible();
  // The outline has a text equivalent.
  await expect(dialog.getByRole("img", { name: /close-up of the photo around the area YouCam found, .* of the photo/i })).toBeVisible();

  // Past the bound (p2b's most visible pore stops at about 4.2 m) the verdict flips.
  await dialog.getByText("6 m", { exact: true }).click();
  await expect(dialog.getByText(/even perfect eyes couldn't pick it out from 6 m/)).toBeVisible();
  await expectNoAxeViolations(page);
  await page.keyboard.press("Escape");
  await expect(dialog).toBeHidden();

  // Dark spots: a size drawn by YouCam from the outline, and the safety line on the receipt.
  await page.getByRole("button", { name: /How we know\s*:\s*Dark spots/ }).click();
  await expect(dialog.getByText("Measured from the mask outline")).toBeVisible();
  await expect(dialog.getByText(/ask a doctor or pharmacist/)).toBeVisible();
});

test("Worth it? and The lightest touch show local crops with the label burned in, never a whole-face after", async ({ page }) => {
  await page.goto("/try/p2b");
  await ready(page);

  const worth = page.locator("#worth-it");
  await expect(worth.getByRole("heading", { level: 2 })).toContainText("Worth it?");
  await expect(worth.getByRole("radio")).toHaveCount(6);
  await expect(worth.getByRole("img", { name: /Simulation\.$/ })).toBeVisible();
  await expect(worth.locator("img")).toHaveCount(0);
  await expect(worth).not.toContainText(/half strength/i);

  const cover = page.locator("#make-it-disappear");
  await expect(cover.getByRole("radiogroup", { name: "Concern" }).getByRole("radio")).toHaveCount(3);
  await expect(cover.getByText(/Honest answer|Checked on a virtual try-on/).first()).toBeVisible();
  await expect(cover.getByRole("img", { name: /Virtual try-on\.$/ })).toBeVisible();
  await expect(cover.locator("img")).toHaveCount(0);
});

test("a face with no recorded try-ons has no lightest touch and no hook pointing at it", async ({ page }) => {
  await page.goto("/try/p5a");
  await ready(page);
  await expect(page.locator("#make-it-disappear")).toHaveCount(0);
  await expect(page.getByText(/See the lightest touch/)).toHaveCount(0);
  await expect(page.getByRole("navigation", { name: "On this page" })).not.toContainText("lightest touch");
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

  const card = page.locator("h4 button[aria-expanded]").filter({ hasText: /dark spots/i }).first();
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

  test("the results page focuses in, glides to conversation distance and keeps the controls usable throughout", async ({ page }) => {
    await page.goto("/try/p3a");
    await expect(page.getByRole("slider", { name: /Step back/ })).toBeVisible();
    await expect(page.getByRole("status").first()).toBeAttached();
    await expect(page.getByTestId("seam")).toBeVisible({ timeout: 60_000 });
    await expect(page.getByTestId("readout")).toHaveText(/^1\s*m$/, { timeout: 15_000 });
  });
});
