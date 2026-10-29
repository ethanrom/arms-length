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

const tab = (page: Page, name: string | RegExp) => page.getByRole("tab", { name });
/** The row for a concern in "What they see". */
const row = (page: Page, name: string) => page.getByTestId("concern-rows").getByRole("button", { name: new RegExp(`^${name}`) });

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
    // The first tab is open, with a row of words per concern.
    await expect(tab(page, "What they see")).toHaveAttribute("aria-selected", "true");
    await expect(page.getByRole("heading", { name: "At this distance", level: 2 })).toBeVisible();

    // Words and distances; no "illustrative" disclaimer, no N/100 score line, the estimate line is up under the face.
    const rows = page.getByTestId("concern-rows").getByRole("button");
    await expect(rows.first()).toBeVisible();
    await expect(rows.first()).toContainText(/out of sight|picked out/);
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

    // The title sits beside the face on a wide screen and above it on a phone; the tabs follow it.
    const title = (await page.getByRole("heading", { level: 1 }).boundingBox())!;
    if (viewport.width >= 1024) {
      expect(title.x).toBeGreaterThan(face.x + face.width - 1);
      // Every feature is one tap away, in the first screen: "Tomorrow" is not nine screens down.
      await expect(tab(page, "Tomorrow")).toBeInViewport();
      await expect(tab(page, "Share")).toBeInViewport();
    } else {
      expect(title.y).toBeLessThan(face.y);
    }

    // The YouCam detections come after the rows.
    const lastRow = (await page.getByTestId("concern-rows").getByRole("button").last().boundingBox())!;
    const detected = page.getByRole("button", { name: "Show what YouCam detected" });
    await expect(detected).toHaveAttribute("aria-expanded", "false");
    expect((await detected.boundingBox())!.y).toBeGreaterThan(lastRow.y);
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

test("the magnified area can be dragged and nudged with the arrow keys, and stays inside the photo", async ({ page }) => {
  await page.goto("/try/p1a");
  await ready(page);
  const patch = page.getByRole("button", { name: /Move the magnified area/ });
  const read = async () => ({ x: Number(await patch.getAttribute("x")), y: Number(await patch.getAttribute("y")) });
  const [frameW, frameH] = (await patch.locator("xpath=..").getAttribute("viewBox"))!.split(" ").slice(2).map(Number);
  const w = Number(await patch.getAttribute("width"));
  const h = Number(await patch.getAttribute("height"));
  const inside = ({ x, y }: { x: number; y: number }) => x >= 0 && y >= 0 && x + w <= frameW + 1e-6 && y + h <= frameH + 1e-6;
  const dragBy = async (dx: number, dy: number) => {
    const box = (await patch.boundingBox())!;
    const cx = box.x + box.width / 2;
    const cy = box.y + box.height / 2;
    await page.mouse.move(cx, cy);
    await page.mouse.down();
    await page.mouse.move(cx + dx, cy + dy, { steps: 8 });
    await page.mouse.up();
  };

  // About 120 px right and 60 px down moves it right and down.
  const before = await read();
  expect(inside(before)).toBe(true);
  await dragBy(120, 60);
  await expect.poll(async () => (await read()).x).toBeGreaterThan(before.x);
  const dragged = await read();
  expect(dragged.y).toBeGreaterThan(before.y);
  expect(inside(dragged)).toBe(true);

  // A drag far past the corner parks it against the frame instead of leaving it.
  await dragBy(4000, 4000);
  await expect.poll(async () => (await read()).x).toBeCloseTo(frameW - w, 3);
  const corner = await read();
  expect(corner.y).toBeCloseTo(frameH - h, 3);

  // The arrow keys nudge it.
  await patch.focus();
  await patch.press("ArrowLeft");
  await expect.poll(async () => (await read()).x).toBeLessThan(corner.x);
  await patch.press("Shift+ArrowUp");
  await expect.poll(async () => (await read()).y).toBeLessThan(corner.y - 1);
  expect(inside(await read())).toBe(true);
  await expectNoAxeViolations(page);
});

test("the Step back slider changes the live counter and speaks its value", async ({ page }) => {
  await page.goto("/try/p2b");
  await ready(page); // the seam only shows once the page has hydrated and the renders are in
  const slider = page.getByRole("slider", { name: /Step back/ });
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

test("the rows lead with good news; a pressed row marks the face and offers its details, which keep the mark-safety line", async ({ page }) => {
  await page.goto("/try/p2b");
  await ready(page);
  const rows = page.getByTestId("concern-rows");

  // The rows that move with the slider lead and the large soft areas, which carry far on every face, come last. (No demo face
  // has a concern that is mostly out of sight by the page's rule, so the relief group's order is a unit test: derive.test.ts.)
  await expect(rows.getByRole("heading", { level: 3 })).toHaveText(["These carry further"]);
  await expect(rows.getByRole("button").first()).toContainText(/^Dark spots/);
  await expect(rows.getByRole("button").nth(-2)).toContainText(/^Under-eye shadows/);
  await expect(rows.getByRole("button").last()).toContainText(/^Under-eye puffiness/);
  await expect(page.getByTestId("concern-marks")).toHaveCount(0);
  await expect(page.getByRole("button", { name: /^Details/ })).toHaveCount(0);

  // Press a row: its marks are drawn over the Step back face, and "Details" appears. Press it again to clear.
  const spots = row(page, "Dark spots");
  await expect(spots).toHaveAttribute("aria-pressed", "false");
  await spots.click();
  await expect(spots).toHaveAttribute("aria-pressed", "true");
  await expect(page.getByTestId("concern-marks")).toHaveAttribute("data-concern", "age_spot");
  await row(page, "Fine lines").click();
  await expect(spots).toHaveAttribute("aria-pressed", "false");
  await expect(page.getByTestId("concern-marks")).toHaveAttribute("data-concern", "wrinkle");
  await row(page, "Fine lines").click();
  await expect(page.getByTestId("concern-marks")).toHaveCount(0);

  // The rows follow the slider.
  const counter = page.locator('[data-counter="age_spot"]');
  await expect(counter).toHaveText(/out of sight/);
  const before = await counter.textContent();
  const slider = page.getByRole("slider", { name: /Step back/ });
  await slider.focus();
  await slider.press("End");
  await expect(counter).not.toHaveText(before!);
  await expect(counter).toHaveText(/^(Most|Nearly all) of your dark spots are out of sight from here$/);

  // The details open in a sheet: the sentences, the mark-safety line, the chart with its data, and what the number means.
  await spots.click();
  await page.getByRole("button", { name: /^Details/ }).click();
  const sheet = page.getByRole("dialog", { name: "Dark spots", exact: true });
  await expect(sheet).toBeVisible();
  await expect(sheet.getByText(/ask a doctor or pharmacist/)).toBeVisible();
  await expect(sheet.getByText("What this number means")).toBeVisible();
  await expect(sheet.getByText("How sure we are")).toBeVisible();
  await sheet.getByText("Show the data").first().click();
  await expect(sheet.getByRole("table").first()).toBeVisible();
  await expectNoAxeViolations(page);
  await page.keyboard.press("Escape");
  await expect(sheet).toBeHidden();
  // Beside the rows, the page itself carries the mark-safety line, and no raw counts of marks.
  await expect(page.locator("#what-others-see").getByText(/ask a doctor or pharmacist/)).toBeVisible();
  await expect(page.locator("#what-others-see")).not.toContainText(/\b\d+ of (your )?\d+\b/);
});

test("a receipt shows both thresholds, where the size comes from, and the safety line for marks", async ({ page }) => {
  await page.goto("/try/p2b");
  await ready(page);

  await row(page, "Pores").click();
  await page.getByRole("button", { name: /^Details/ }).click();
  await expect(page.getByRole("dialog", { name: "Pores", exact: true }).getByText("What this number means")).toBeVisible();

  await page.getByRole("button", { name: /How we know\s*:\s*Pores/ }).click();
  const dialog = page.getByRole("dialog", { name: /^Pores, at / });
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
  // The sheet it was opened from is still there; closing it leaves the page as it was.
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog", { name: "Pores", exact: true })).toBeHidden();

  // Dark spots: a size drawn by YouCam from the outline, and the safety line on the receipt.
  await row(page, "Dark spots").click();
  await page.getByRole("button", { name: /^Details/ }).click();
  await page.getByRole("button", { name: /How we know\s*:\s*Dark spots/ }).click();
  const spots = page.getByRole("dialog", { name: /^Dark spots, at / });
  await expect(spots.getByText("Measured from the mask outline")).toBeVisible();
  await expect(spots.getByText(/ask a doctor or pharmacist/)).toBeVisible();
});

test("Worth it? and The lightest touch show local crops with the label burned in, never a whole-face after", async ({ page }) => {
  await page.goto("/try/p2b");
  await ready(page);

  await tab(page, "Worth it?").click();
  const worth = page.locator("#worth-it");
  await expect(worth.getByRole("heading", { level: 2 })).toContainText("Worth it?");
  await expect(worth.getByRole("radio")).toHaveCount(6);
  await expect(worth.getByRole("img", { name: /Simulation\.$/ })).toBeVisible();
  await expect(worth.locator("img")).toHaveCount(0);
  await expect(worth).not.toContainText(/half strength/i);

  await tab(page, "The lightest touch").click();
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
  await expect(tab(page, /lightest touch/)).toHaveCount(0);
  await expect(page.getByRole("tab")).toHaveText(["What they see", "Tomorrow", "Worth it?", "Share"]);
  await row(page, "Dark spots").click();
  await page.getByRole("button", { name: /^Details/ }).click();
  const sheet = page.getByRole("dialog", { name: "Dark spots", exact: true });
  await expect(sheet.getByText("What this number means")).toBeVisible();
  await expect(sheet.getByText(/See the lightest touch/)).toHaveCount(0);
});

test("where a try-on was recorded, the details point to the lightest touch and following the hook opens that tab", async ({ page }) => {
  await page.goto("/try/p2b");
  await ready(page);
  await row(page, "Dark spots").click();
  await page.getByRole("button", { name: /^Details/ }).click();
  const sheet = page.getByRole("dialog", { name: "Dark spots", exact: true });
  await sheet.getByRole("link", { name: /See the lightest touch/ }).click();
  await expect(sheet).toBeHidden();
  await expect(tab(page, "The lightest touch")).toHaveAttribute("aria-selected", "true");
  await expect(tab(page, "The lightest touch")).toBeFocused();
  await expect(page.locator("#make-it-disappear")).toBeVisible();
  await expect(page).toHaveURL(/#make-it-disappear$/);
});

test("keyboard only: skip link, a persona card, a concern row, its details and the receipt sheet", async ({ page }) => {
  await page.goto("/try");
  await page.keyboard.press("Tab");
  await expect(page.getByRole("link", { name: "Skip to content" })).toBeFocused();

  // Reach the first demo face and open it.
  await page.getByRole("link", { name: /Deep brown skin, about 42/ }).focus();
  await page.keyboard.press("Enter");
  await expect(page).toHaveURL(/\/try\/p2b$/);
  await ready(page);

  const spots = row(page, "Dark spots");
  await spots.focus();
  await page.keyboard.press("Enter");
  await expect(spots).toHaveAttribute("aria-pressed", "true");

  const details = page.getByRole("button", { name: /^Details/ });
  await page.keyboard.press("Tab");
  await expect(details).toBeFocused();
  await page.keyboard.press("Enter");
  const sheet = page.getByRole("dialog", { name: "Dark spots", exact: true });
  await expect(sheet).toBeVisible();

  const how = page.getByRole("button", { name: /How we know\s*:\s*Dark spots/ });
  await how.focus();
  await page.keyboard.press("Enter");
  const receipt = page.getByRole("dialog", { name: /^Dark spots, at / });
  await expect(receipt).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(receipt).toBeHidden();
  await expect(how).toBeFocused();
  await page.keyboard.press("Escape");
  await expect(sheet).toBeHidden();
  await expect(details).toBeFocused();
});

test("an unknown persona shows the not-found page", async ({ page }) => {
  await page.goto("/try/not-a-face");
  await expect(page.getByRole("heading", { level: 1 })).toContainText(/out of focus/i);
  await expectNoAxeViolations(page);
});

// ---------------------------------------------------------------------------------------------------------------
// The tabs
// ---------------------------------------------------------------------------------------------------------------

const TAB_IDS = ["what-others-see", "rehearse", "make-it-disappear", "worth-it", "share"];

test("the tabs are a WAI-ARIA tablist with arrow-key navigation, a roving tabindex and a panel each", async ({ page }) => {
  await page.goto("/try/p1a");
  await ready(page);
  const list = page.getByRole("tablist");
  await expect(list).toBeVisible();
  const tabs = list.getByRole("tab");
  await expect(tabs).toHaveText(["What they see", "Tomorrow", "The lightest touch", "Worth it?", "Share"]);

  // The first is open; only it is in the tab order.
  await expect(tabs.nth(0)).toHaveAttribute("aria-selected", "true");
  await expect(tabs.nth(0)).toHaveAttribute("tabindex", "0");
  for (const i of [1, 2, 3, 4]) {
    await expect(tabs.nth(i)).toHaveAttribute("aria-selected", "false");
    await expect(tabs.nth(i)).toHaveAttribute("tabindex", "-1");
  }
  // Each tab names its panel, and the panel names the tab.
  for (let i = 0; i < TAB_IDS.length; i++) {
    await expect(tabs.nth(i)).toHaveAttribute("aria-controls", TAB_IDS[i]);
    await expect(page.locator(`#${TAB_IDS[i]}`)).toHaveAttribute("role", "tabpanel");
    await expect(page.locator(`#${TAB_IDS[i]}`)).toHaveAttribute("aria-labelledby", `tab-${TAB_IDS[i]}`);
  }
  await expect(page.locator("#what-others-see")).toBeVisible();
  await expect(page.locator("#rehearse")).toBeHidden();

  // Arrow keys move and open; the ends wrap; Home and End jump.
  await tabs.nth(0).focus();
  await page.keyboard.press("ArrowRight");
  await expect(tabs.nth(1)).toBeFocused();
  await expect(tabs.nth(1)).toHaveAttribute("aria-selected", "true");
  await expect(tabs.nth(1)).toHaveAttribute("tabindex", "0");
  await expect(tabs.nth(0)).toHaveAttribute("tabindex", "-1");
  await expect(page.locator("#rehearse")).toBeVisible();
  await expect(page.locator("#what-others-see")).toBeHidden();
  await page.keyboard.press("End");
  await expect(tabs.nth(4)).toBeFocused();
  await expect(page.locator("#share")).toBeVisible();
  await page.keyboard.press("ArrowRight");
  await expect(tabs.nth(0)).toBeFocused();
  await page.keyboard.press("ArrowLeft");
  await expect(tabs.nth(4)).toBeFocused();
  await page.keyboard.press("Home");
  await expect(tabs.nth(0)).toBeFocused();
  await expect(tabs.nth(0)).toHaveAttribute("aria-selected", "true");

  // Tab leaves the tablist for the open panel instead of stepping through the other tabs.
  await page.keyboard.press("Tab");
  await expect(tabs.nth(1)).not.toBeFocused();
  expect(await page.evaluate(() => !!document.activeElement?.closest("#what-others-see"))).toBe(true);
});

test("a link with a section's hash opens its tab, and choosing a tab writes the hash back", async ({ page }) => {
  await page.goto("/try/p1a#worth-it");
  await ready(page);
  await expect(tab(page, "Worth it?")).toHaveAttribute("aria-selected", "true");
  await expect(page.locator("#worth-it")).toBeVisible();
  await expect(page.locator("#worth-it").getByRole("radio").first()).toBeAttached();
  await expect(page.locator("#what-others-see")).toBeHidden();

  await tab(page, "Share").click();
  await expect(page).toHaveURL(/#share$/);
  await expect(page.locator("#share")).toBeVisible();
  // A hash that is not a tab is ignored: the open tab stays open.
  await page.evaluate(() => {
    window.location.hash = "#nothing-here";
  });
  await expect(tab(page, "Share")).toHaveAttribute("aria-selected", "true");
  // A hash change inside the page (an old link, the browser's address bar) opens the tab too.
  await page.evaluate(() => {
    window.location.hash = "#make-it-disappear";
  });
  await expect(tab(page, "The lightest touch")).toHaveAttribute("aria-selected", "true");
  await expect(page.locator("#make-it-disappear")).toBeVisible();
  // A face that does not offer the section has no such tab: its hash falls back to the first.
  await page.goto("/try/p5a#make-it-disappear");
  await expect(tab(page, "What they see")).toHaveAttribute("aria-selected", "true");
});

test("on a wide screen the face stays in view as the page scrolls and as the tabs change", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/try/p1a");
  await ready(page);
  const stage = page.getByTestId("step-back-stage");
  const slider = page.getByRole("slider", { name: /Step back/ });
  const inView = async () => {
    const box = (await stage.boundingBox())!;
    expect(box.y).toBeGreaterThanOrEqual(0);
    expect(box.y + box.height).toBeLessThanOrEqual(900);
    const s = (await slider.boundingBox())!;
    expect(s.y).toBeGreaterThanOrEqual(0);
    expect(s.y + s.height).toBeLessThanOrEqual(900);
  };

  // Down the long first tab the face stays where it is, with its controls.
  await inView();
  const top = (await stage.boundingBox())!;
  await page.mouse.wheel(0, 400);
  await page.waitForTimeout(200);
  expect(await page.evaluate(() => window.scrollY)).toBeGreaterThan(300);
  await inView();
  const pinned = (await stage.boundingBox())!;
  expect(pinned.height).toBeCloseTo(top.height, 0);
  expect(pinned.y).toBeLessThanOrEqual(top.y);

  // Switching tabs from down the page starts the new tab at the top, face and all.
  for (const name of ["Tomorrow", "The lightest touch", "Worth it?", "Share", "What they see"]) {
    await tab(page, name).click();
    await expect(tab(page, name)).toHaveAttribute("aria-selected", "true");
    await inView();
    expect(await page.evaluate(() => window.scrollY)).toBeLessThan(5);
    await page.mouse.wheel(0, 600);
    await page.waitForTimeout(100);
  }
  // The tab row is reachable from down the page: "Tomorrow" is one click away and its button is in the first screen.
  await tab(page, "Tomorrow").click();
  await expect(page.getByRole("button", { name: "Rehearse my day" })).toBeInViewport();
});

test("axe finds no violations on any tab", async ({ page }) => {
  await page.goto("/try/p1a");
  await ready(page);
  for (const name of ["What they see", "Tomorrow", "The lightest touch", "Worth it?", "Share"]) {
    await tab(page, name).click();
    await expect(tab(page, name)).toHaveAttribute("aria-selected", "true");
    await page.waitForTimeout(400);
    await expectNoAxeViolations(page);
  }
});

test.describe("phone", () => {
  test.use({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });

  test("nothing overflows sideways on any tab, and the tab row sticks under the top edge", async ({ page }) => {
    await page.goto("/try/p1a");
    await ready(page);
    const overflow = () => page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    for (const name of ["What they see", "Tomorrow", "The lightest touch", "Worth it?", "Share"]) {
      await tab(page, name).click();
      await expect(tab(page, name)).toHaveAttribute("aria-selected", "true");
      expect(await overflow()).toBeLessThanOrEqual(0);
    }
    await tab(page, "What they see").click();
    await page.evaluate(() => window.scrollTo(0, 1500));
    await page.waitForTimeout(200);
    const row = (await page.getByRole("tablist").boundingBox())!;
    expect(row.y).toBeGreaterThanOrEqual(-1);
    expect(row.y).toBeLessThan(8);
    await tab(page, "Share").click();
    await expect(page.locator("#share")).toBeVisible();
    // The new tab starts under the tab row, not in the middle of a different, longer panel.
    const head = (await page.locator("#share").boundingBox())!;
    expect(head.y).toBeGreaterThanOrEqual(row.y);
    expect(head.y).toBeLessThan(200);
  });
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
