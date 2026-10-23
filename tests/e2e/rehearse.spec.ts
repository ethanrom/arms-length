import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page, type Route } from "@playwright/test";
import { EXAMPLE_DAYS, type RehearseRequest } from "../../lib/contracts/rehearse";
import { FALLBACK_PLAN, FOLLOW_UP_PLAN, STEP_LABELS, VERIFIED_PLAN, WORKDAY, errorBody, ndjson } from "./fixtures/rehearse/plans";
import { gatedRehearse } from "./fixtures/rehearse/gated";

// Deterministic: no autoplay, no fades or draw-ins mid-scan. The tests that need motion say so.
test.use({ reducedMotion: "reduce" });

const FACE = "/try/p1a";
const NDJSON = "application/x-ndjson";

async function expectNoAxeViolations(page: Page, include = "#rehearse") {
  const { violations } = await new AxeBuilder({ page }).include(include).analyze();
  const summary = violations.map((v) => ({ id: v.id, impact: v.impact, nodes: v.nodes.slice(0, 3).map((n) => n.html.slice(0, 160)) }));
  expect(summary).toEqual([]);
}

/** Serves one NDJSON body per request (the last repeats) and returns the request bodies it saw, in order. */
async function serve(page: Page, ...bodies: string[]): Promise<RehearseRequest[]> {
  const seen: RehearseRequest[] = [];
  await page.route("**/api/rehearse", (route: Route) => {
    seen.push(route.request().postDataJSON() as RehearseRequest);
    return route.fulfill({ status: 200, contentType: NDJSON, body: bodies[Math.min(seen.length - 1, bodies.length - 1)] });
  });
  return seen;
}

async function openFace(page: Page) {
  await page.goto(FACE);
  await page.locator("#rehearse").scrollIntoViewIfNeeded();
}

const dialog = (page: Page) => page.getByRole("dialog");

async function openDialog(page: Page) {
  await page.getByRole("button", { name: "Rehearse my day" }).click();
  await expect(dialog(page)).toBeVisible();
}

/** Opens the experience, picks the first example and sends it. */
async function askWorkday(page: Page) {
  await openDialog(page);
  await dialog(page).getByRole("button", { name: /Video standup, client lunch, dinner date/ }).click();
  await dialog(page).getByRole("button", { name: "Show me tomorrow" }).click();
}

async function reachDay(page: Page) {
  await openFace(page);
  await askWorkday(page);
  await expect(page.getByTestId("rehearse-day")).toBeVisible();
}

const stage = (page: Page) => page.getByTestId("day-stage");
const title = (page: Page) => page.getByTestId("moment-title");

// ---------------------------------------------------------------------------------------------------------------
// The teaser
// ---------------------------------------------------------------------------------------------------------------

test("the results page teases the day with three scenes and one button", async ({ page }) => {
  await openFace(page);
  const section = page.locator("#rehearse");
  await expect(section.getByRole("heading", { level: 2, name: "Tomorrow, from their side" })).toBeVisible();
  await expect(page.getByRole("navigation", { name: "On this page" }).getByRole("link", { name: "Tomorrow, from their side" })).toBeVisible();
  await expect(section.getByRole("img")).toHaveCount(3);
  await expect(section.getByRole("img").first()).toHaveAccessibleName(/laptop call/i);
  await expect(section.getByRole("button")).toHaveCount(1);
  await expect(section.getByRole("button", { name: "Rehearse my day" })).toBeVisible();
  await expect(section).toContainText("About 15 seconds");
  await expect(section).toContainText("not your photo");
  await expectNoAxeViolations(page);
});

// ---------------------------------------------------------------------------------------------------------------
// The dialog
// ---------------------------------------------------------------------------------------------------------------

test("the button opens a full-screen dialog that holds focus, locks the page and gives it back", async ({ page }) => {
  await openFace(page);
  const opener = page.getByRole("button", { name: "Rehearse my day" });
  await opener.click();

  const box = dialog(page);
  await expect(box).toBeVisible();
  await expect(box).toHaveAttribute("aria-modal", "true");
  await expect(box).toHaveAccessibleName("Tomorrow, from their side");
  const size = await box.evaluate((el) => ({ w: el.getBoundingClientRect().width, h: el.getBoundingClientRect().height, vw: innerWidth, vh: innerHeight }));
  expect(size.w).toBeGreaterThanOrEqual(size.vw - 1);
  expect(size.h).toBeGreaterThanOrEqual(size.vh - 1);
  await expect(page.getByRole("heading", { name: "What’s tomorrow?" })).toBeVisible();
  await expect(box.getByLabel("What’s tomorrow?")).toBeFocused();
  expect(await page.evaluate(() => document.documentElement.style.overflow)).toBe("hidden");

  // Tab loops inside: from the first control back to the last, and on again.
  const close = box.getByRole("button", { name: "Close" });
  await close.focus();
  await page.keyboard.press("Shift+Tab");
  await expect(box.getByRole("button", { name: "Show me tomorrow" })).toBeFocused();
  await page.keyboard.press("Tab");
  await expect(close).toBeFocused();

  // Esc closes it, the page scrolls again, and focus is back on the button.
  await page.keyboard.press("Escape");
  await expect(box).toHaveCount(0);
  await expect(opener).toBeFocused();
  expect(await page.evaluate(() => document.documentElement.style.overflow)).toBe("");

  // The cross does the same.
  await opener.click();
  await dialog(page).getByRole("button", { name: "Close" }).click();
  await expect(dialog(page)).toHaveCount(0);
  await expect(opener).toBeFocused();
});

test("the ask: examples fill the day, preferences travel with it, and an empty day is not sent", async ({ page }) => {
  const seen = await serve(page, ndjson(VERIFIED_PLAN));
  await openFace(page);
  await openDialog(page);
  const box = dialog(page);
  const day = box.getByLabel("What’s tomorrow?");

  await box.getByRole("button", { name: "Show me tomorrow" }).click();
  await expect(box.getByRole("alert").filter({ hasText: "Add a line about your day" })).toBeVisible();
  await expect(day).toBeFocused();
  expect(seen).toHaveLength(0);

  const examples = box.getByRole("group", { name: "Examples to start from" }).getByRole("button");
  await expect(examples).toHaveText(EXAMPLE_DAYS.map((e) => e.chip));
  for (const ex of EXAMPLE_DAYS) {
    await box.getByRole("button", { name: ex.chip }).click();
    await expect(day).toHaveValue(ex.day);
  }

  await day.fill("A video call at ten, then a long lunch");
  await box.getByText("Phone", { exact: true }).click();
  await box.getByLabel(/rather not wear makeup/).check({ force: true });
  await box.getByRole("button", { name: "Show me tomorrow" }).click();
  await expect(page.getByTestId("rehearse-day")).toBeVisible();
  expect(seen).toEqual([{ face: { demoId: "p1a" }, day: "A video call at ten, then a long lunch", prefs: { callDevice: "phone", noMakeup: true } }]);
});

// ---------------------------------------------------------------------------------------------------------------
// Building
// ---------------------------------------------------------------------------------------------------------------

test("while the agent works, each moment it finds sketches itself in; the faces arrive with the plan", async ({ page }) => {
  // Lines: 1 found, 2 call, 3 lunch, 4 dinner, 5 fix, 6 check, 7 plan.
  const gate = await gatedRehearse(page, ndjson(VERIFIED_PLAN), [1, 4]);
  await openFace(page);
  await askWorkday(page);

  const status = page.getByTestId("rehearse-status");
  await expect(status).toHaveAttribute("aria-live", "polite");
  await expect(page.getByTestId("rehearse-building")).toBeVisible();
  await expect(status).toHaveText(STEP_LABELS[0]);
  // The second line is cut in the middle: nothing of it shows until it is whole.
  await expect(page.getByTestId("sketch")).toHaveCount(0);

  await gate.next();
  await expect(page.getByTestId("sketch")).toHaveCount(3);
  await expect(page.getByTestId("sketch").first()).toContainText("Video standup");
  await expect(page.getByTestId("sketch").nth(2)).toContainText("Dinner date");
  await expect(page.getByTestId("sketch").first()).toHaveAttribute("data-landed", "false");
  await expect(status).toHaveText(STEP_LABELS[3]);
  await expect(page.getByTestId("rehearse-day")).toHaveCount(0);

  await gate.next();
  await expect(page.getByTestId("rehearse-day")).toBeVisible();
  await expect(page.getByTestId("rehearse-building")).toHaveCount(0);
});

// ---------------------------------------------------------------------------------------------------------------
// The day
// ---------------------------------------------------------------------------------------------------------------

test("a moment is a picture, a headline, one chip and a quiet line about cover", async ({ page }) => {
  await serve(page, ndjson(VERIFIED_PLAN));
  await reachDay(page);

  await expect(title(page)).toHaveText("Video standup");
  await expect(page.getByTestId("moment-headline")).toHaveText(VERIFIED_PLAN.moments[0].headline!.text);
  await expect(page.getByTestId("moment-headline")).toBeFocused();
  await expect(stage(page)).toHaveAttribute("data-distance-m", "1.9");
  await expect(stage(page).getByRole("img")).toHaveAccessibleName(/Video standup/);
  await expect(page.getByTestId("no-need")).toHaveText(/^No need to cover here: .+\.$/);

  // One small tip: the chip reveals the sentence, and hides it again.
  const chip = page.getByTestId("moment-chip");
  await expect(chip).toHaveText("One small tip");
  await expect(chip).toHaveAttribute("aria-expanded", "false");
  await expect(page.getByTestId("moment-claim")).toBeHidden();
  await chip.click();
  await expect(chip).toHaveAttribute("aria-expanded", "true");
  await expect(page.getByTestId("moment-claim")).toHaveText(/Move the laptop back to about 80 cm/);
  await chip.click();
  await expect(page.getByTestId("moment-claim")).toBeHidden();

  // The other two kinds of advice.
  await page.getByTestId("next").click();
  await expect(title(page)).toHaveText("Client lunch by the window");
  await expect(page.getByTestId("moment-chip")).toHaveText("Nothing to do");
  await expect(page.getByTestId("moment-chip")).not.toHaveAttribute("aria-expanded", /.*/);
  await page.getByTestId("next").click();
  await expect(page.getByTestId("moment-chip")).toHaveText("If you’d like");
  await page.getByTestId("moment-chip").click();
  await expect(page.getByTestId("moment-claim")).toContainText("60% foundation coverage");
});

test("plans without a headline get a kind line written from the numbers", async ({ page }) => {
  await serve(page, ndjson(FALLBACK_PLAN));
  await reachDay(page);
  const headline = page.getByTestId("moment-headline");
  await expect(headline).toHaveText(/can still be picked out|stays soft|stay soft/);
  await expect(headline).not.toHaveText(/\d/);
  await page.getByTestId("next").click();
  await expect(headline).toHaveText(/stays soft|can still be picked out/);
});

test("the day moves with the arrows, the keys, the ribbon and a swipe", async ({ page }) => {
  await serve(page, ndjson(VERIFIED_PLAN));
  await reachDay(page);
  const markers = page.getByTestId("ribbon-marker");
  await expect(markers).toHaveCount(3);
  await expect(markers.nth(0)).toHaveAttribute("aria-current", "step");
  await expect(markers.nth(0)).toHaveAttribute("data-kind", "tip");
  await expect(markers.nth(1)).toHaveAttribute("data-kind", "none");
  await expect(markers.nth(0)).toHaveAccessibleName(/Moment 1 of 3: Video standup, 9am\. One small tip\./);
  await expect(page.getByTestId("prev")).toBeDisabled();

  await page.getByTestId("next").click();
  await expect(title(page)).toHaveText("Client lunch by the window");
  await expect(markers.nth(1)).toHaveAttribute("aria-current", "step");

  await page.keyboard.press("ArrowRight");
  await expect(title(page)).toHaveText("Dinner date");
  await page.keyboard.press("ArrowLeft");
  await expect(title(page)).toHaveText("Client lunch by the window");

  await markers.nth(0).click();
  await expect(title(page)).toHaveText("Video standup");

  // Swipe left on the stage for the next moment, right for the one before.
  const box = (await page.getByTestId("rehearse-stage").boundingBox())!;
  const y = box.y + box.height / 2;
  await page.mouse.move(box.x + box.width * 0.7, y);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width * 0.3, y, { steps: 6 });
  await page.mouse.up();
  await expect(title(page)).toHaveText("Client lunch by the window");
  await page.mouse.move(box.x + box.width * 0.3, y);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width * 0.7, y, { steps: 6 });
  await page.mouse.up();
  await expect(title(page)).toHaveText("Video standup");

  // Markers sit at their times: 9am before 12:30 before 7pm, in a line.
  const xs = await markers.evaluateAll((els) => els.map((el) => el.getBoundingClientRect().x));
  expect(xs[0]).toBeLessThan(xs[1]);
  expect(xs[1]).toBeLessThan(xs[2]);
});

test("holding the button shows your mirror, with the mouse and with the keyboard", async ({ page }) => {
  await serve(page, ndjson(VERIFIED_PLAN));
  await reachDay(page);
  const hold = page.getByRole("button", { name: "Hold to see your mirror" });
  const frame = page.getByTestId("rehearse-stage");
  await expect(frame).toHaveAttribute("data-mode", "theirs");
  await expect(hold).toHaveAttribute("aria-pressed", "false");

  const box = (await hold.boundingBox())!;
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await expect(frame).toHaveAttribute("data-mode", "mirror");
  await expect(hold).toHaveAttribute("aria-pressed", "true");
  await expect(page.getByTestId("mirror-status")).toHaveText(/Showing your mirror/);
  // Moving away while held keeps it; letting go anywhere ends it.
  await page.mouse.move(box.x + box.width / 2, box.y - 200);
  await expect(frame).toHaveAttribute("data-mode", "mirror");
  await page.mouse.up();
  await expect(frame).toHaveAttribute("data-mode", "theirs");

  await hold.focus();
  await page.keyboard.down("Space");
  await expect(frame).toHaveAttribute("data-mode", "mirror");
  await page.keyboard.up("Space");
  await expect(frame).toHaveAttribute("data-mode", "theirs");
  await page.keyboard.down("Enter");
  await expect(frame).toHaveAttribute("data-mode", "mirror");
  await page.keyboard.up("Enter");
  await expect(frame).toHaveAttribute("data-mode", "theirs");
});

test("beside the stage, the same face as they see it up close; held against your mirror it stays on their view", async ({ page }) => {
  await serve(page, ndjson(VERIFIED_PLAN));
  await reachDay(page);
  const inset = page.getByTestId("closer-inset");
  await expect(inset).toBeVisible();
  await expect(inset).toContainText("As they see it, up close");
  await expect(inset.getByRole("img")).toHaveAccessibleName(/Video standup: as they see it, up close/);
  const frame = (await stage(page).boundingBox())!;
  const small = (await inset.boundingBox())!;
  // About a third of the stage, in its lower right corner.
  expect(small.width / frame.width).toBeGreaterThan(0.26);
  expect(small.width / frame.width).toBeLessThan(0.34);
  expect(small.x + small.width).toBeLessThanOrEqual(frame.x + frame.width);
  expect(small.y + small.height).toBeLessThanOrEqual(frame.y + frame.height);

  const hold = page.getByRole("button", { name: "Hold to see your mirror" });
  const box = (await hold.boundingBox())!;
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await expect(page.getByTestId("rehearse-stage")).toHaveAttribute("data-mode", "mirror");
  await expect(inset).toBeVisible();
  await expect(inset.getByRole("img")).toHaveAccessibleName(/as they see it, up close/);
  await page.mouse.up();
  await expect(page.getByTestId("rehearse-stage")).toHaveAttribute("data-mode", "theirs");
});

test("a moment with a tip can be seen as is and with the tip", async ({ page }) => {
  await serve(page, ndjson(VERIFIED_PLAN));
  await reachDay(page);
  await expect(stage(page)).toHaveAttribute("data-tip", "false");
  await expect(stage(page)).toHaveAttribute("data-camera-cm", "55");
  await expect(stage(page)).toHaveAttribute("data-distance-m", "1.9");

  await page.getByRole("radio", { name: "With the tip" }).check({ force: true });
  await expect(stage(page)).toHaveAttribute("data-tip", "true");
  await expect(stage(page)).toHaveAttribute("data-camera-cm", "80");
  await expect(stage(page)).toHaveAttribute("data-distance-m", "2.6");

  await page.getByRole("radio", { name: "As is" }).check({ force: true });
  await expect(stage(page)).toHaveAttribute("data-camera-cm", "55");

  // Only moments with a free fix have the toggle.
  await page.getByTestId("next").click();
  await expect(page.getByRole("radio", { name: "With the tip" })).toHaveCount(0);
});

test("How we know opens a drawer with the claims, the receipts and the picture's assumption", async ({ page }) => {
  await serve(page, ndjson(VERIFIED_PLAN));
  await reachDay(page);
  await page.getByTestId("next").click();
  const know = dialog(page).getByRole("button", { name: "How we know", exact: true });
  await know.click();

  const drawer = page.getByTestId("rehearse-drawer");
  await expect(drawer).toBeVisible();
  await expect(drawer.getByRole("heading", { name: "How we know" })).toBeFocused();
  await expect(drawer).toContainText("Dark spots: about 45% (29 of 64) could be picked out across the table.");
  await expect(drawer).toContainText("Lunch is at a table for two, about 1.5 m across.");
  await expect(drawer.locator("dt", { hasText: "Size on the face" }).locator("xpath=following-sibling::dd[1]")).toHaveText("1.1 mm");
  await expect(drawer.locator("dt", { hasText: "Contrast needed, typical viewer" }).locator("xpath=following-sibling::dd[1]")).toHaveText("6.4%");
  await expect(drawer).toContainText("40° window onto the room");
  await expect(drawer).toContainText("project assumption");
  await expectNoAxeViolations(page, "[data-testid='rehearse-drawer']");

  // The day behind it is out of reach: Tab stays in the drawer.
  for (let i = 0; i < 6; i++) await page.keyboard.press("Tab");
  expect(await page.evaluate(() => !!document.activeElement?.closest("[data-testid='rehearse-drawer']"))).toBe(true);

  // Esc closes the drawer, not the dialog, and focus returns to where it came from.
  await page.keyboard.press("Escape");
  await expect(drawer).toHaveCount(0);
  await expect(dialog(page)).toBeVisible();
  await expect(know).toBeFocused();

  // A video call says what its scene is instead.
  await page.getByTestId("prev").click();
  await know.click();
  await expect(page.getByTestId("rehearse-drawer")).toContainText("the other person's laptop screen");
  await page.getByTestId("rehearse-drawer").getByRole("button", { name: "Close" }).click();
  await expect(page.getByTestId("rehearse-drawer")).toHaveCount(0);
});

// ---------------------------------------------------------------------------------------------------------------
// The end of the day
// ---------------------------------------------------------------------------------------------------------------

test("the end of the day: the whole ribbon, the summary, what needs no cover and the checked badge", async ({ page }) => {
  await serve(page, ndjson(VERIFIED_PLAN));
  await reachDay(page);
  for (let i = 0; i < 3; i++) await page.getByTestId("next").click();

  const end = page.getByTestId("rehearse-end");
  await expect(end).toBeVisible();
  await expect(end.getByRole("heading", { name: "The whole day" })).toBeFocused();
  await expect(end.getByTestId("rehearse-summary")).toHaveText(VERIFIED_PLAN.summary.text);
  await expect(end.getByTestId("rehearse-badge")).toHaveText("Every number checked against the model");
  await expect(end.getByTestId("rehearse-badge")).toHaveAttribute("data-verified", "true");
  await expect(end.getByTestId("rehearse-cover")).toContainText("No need to cover tomorrow");
  await expect(end.getByTestId("rehearse-cover").getByRole("listitem").first()).toContainText(/all day|at /);
  await expect(end.getByTestId("ribbon-marker")).toHaveCount(3);
  await expect(end.getByTestId("ribbon")).toContainText("Dinner date");
  await expectNoAxeViolations(page, "[data-testid='rehearse-dialog']");

  // A marker goes back to its moment.
  await end.getByTestId("ribbon-marker").nth(1).click();
  await expect(title(page)).toHaveText("Client lunch by the window");
});

test("the fallback plan says it was built directly from the model", async ({ page }) => {
  await serve(page, ndjson(FALLBACK_PLAN));
  await reachDay(page);
  for (let i = 0; i < 3; i++) await page.getByTestId("next").click();
  const badge = page.getByTestId("rehearse-badge");
  await expect(badge).toHaveText("Built directly from the model");
  await expect(badge).toHaveAttribute("data-verified", "false");
  await expect(page.getByText("Every number checked against the model")).toHaveCount(0);
  await expect(dialog(page)).not.toContainText(/fail|error|wrong/i);
});

test("What if…? sends the question with the plan, and the answer replaces it", async ({ page }) => {
  const seen = await serve(page, ndjson(VERIFIED_PLAN), ndjson(FOLLOW_UP_PLAN));
  await reachDay(page);
  for (let i = 0; i < 3; i++) await page.getByTestId("next").click();

  await page.getByLabel("What if…?").fill("What if lunch is outdoors?");
  await page.getByRole("button", { name: "Ask again" }).click();
  await expect(page.getByTestId("rehearse-day")).toBeVisible();
  expect(seen).toHaveLength(2);
  expect(seen[1].followUp?.question).toBe("What if lunch is outdoors?");
  expect(seen[1].followUp?.previous.day).toBe(WORKDAY);
  expect(seen[1].followUp?.previous.moments.map((m) => m.title)).toEqual(["Video standup", "Client lunch by the window", "Dinner date"]);
  expect(seen[1].face).toEqual({ demoId: "p1a" });

  // The new plan starts again at its first moment, and its summary is at the end.
  await expect(title(page)).toHaveText("Video standup");
  for (let i = 0; i < 3; i++) await page.getByTestId("next").click();
  await expect(page.getByTestId("rehearse-summary")).toHaveText(FOLLOW_UP_PLAN.summary.text);
});

test("a question that fails keeps the plan, on the last page, with a kind line", async ({ page }) => {
  await serve(page, ndjson(VERIFIED_PLAN), errorBody("timeout"));
  await reachDay(page);
  for (let i = 0; i < 3; i++) await page.getByTestId("next").click();
  await page.getByLabel("What if…?").fill("What if I am on my phone?");
  await page.getByRole("button", { name: "Ask again" }).click();
  await expect(page.getByTestId("rehearse-end")).toBeVisible();
  await expect(page.getByTestId("rehearse-end").getByRole("alert")).toContainText("That took longer than expected");
  await expect(page.getByTestId("rehearse-summary")).toHaveText(VERIFIED_PLAN.summary.text);
});

test("Start over returns to the ask with the day filled in, and Close ends the experience", async ({ page }) => {
  await serve(page, ndjson(VERIFIED_PLAN));
  await reachDay(page);
  for (let i = 0; i < 3; i++) await page.getByTestId("next").click();
  await page.getByRole("button", { name: "Start over" }).click();
  await expect(page.getByRole("heading", { name: "What’s tomorrow?" })).toBeVisible();
  await expect(dialog(page).getByLabel("What’s tomorrow?")).toHaveValue(WORKDAY);

  await dialog(page).getByRole("button", { name: "Close" }).click();
  await expect(dialog(page)).toHaveCount(0);
  await page.getByRole("button", { name: "Rehearse my day" }).click();
  await expect(dialog(page).getByLabel("What’s tomorrow?")).toHaveValue(WORKDAY);
});

// ---------------------------------------------------------------------------------------------------------------
// Errors
// ---------------------------------------------------------------------------------------------------------------

test("an error reply is a kind sentence, and the day you typed is still there", async ({ page }) => {
  await serve(page, errorBody("rate_limited"));
  await openFace(page);
  await openDialog(page);
  await dialog(page).getByLabel("What’s tomorrow?").fill(WORKDAY);
  await dialog(page).getByRole("button", { name: "Show me tomorrow" }).click();
  await expect(page.getByTestId("rehearse-error")).toContainText("That is a lot of rehearsals for now");
  await expect(dialog(page).getByLabel("What’s tomorrow?")).toHaveValue(WORKDAY);
  await expect(page.getByTestId("rehearse-day")).toHaveCount(0);
  await expectNoAxeViolations(page, "[data-testid='rehearse-dialog']");
});

test("a dropped connection ends the run with a message, not a spinner", async ({ page }) => {
  await page.route("**/api/rehearse", (route) => route.abort("connectionreset"));
  await openFace(page);
  await openDialog(page);
  await dialog(page).getByLabel("What’s tomorrow?").fill(WORKDAY);
  await dialog(page).getByRole("button", { name: "Show me tomorrow" }).click();
  await expect(page.getByTestId("rehearse-error")).toContainText("couldn't be reached");
  await expect(page.getByTestId("rehearse-building")).toHaveCount(0);
});

// ---------------------------------------------------------------------------------------------------------------
// The real route, in replay
// ---------------------------------------------------------------------------------------------------------------

test("the recorded demo day plays through the real route", async ({ page }) => {
  await openFace(page);
  await askWorkday(page);
  await expect(page.getByTestId("rehearse-day")).toBeVisible({ timeout: 30_000 });
  await expect(page.getByTestId("ribbon-marker")).toHaveCount(3);
  await expect(page.getByTestId("moment-headline")).not.toBeEmpty();
  await expect(title(page)).not.toBeEmpty();
  for (let i = 0; i < 3; i++) await page.getByTestId("next").click();
  await expect(page.getByTestId("rehearse-end")).toBeVisible();
  await expectNoAxeViolations(page, "[data-testid='rehearse-dialog']");
});

// ---------------------------------------------------------------------------------------------------------------
// Accessibility and small screens
// ---------------------------------------------------------------------------------------------------------------

test("the experience has no axe violations in the ask, the day and the end", async ({ page }) => {
  await serve(page, ndjson(VERIFIED_PLAN));
  await openFace(page);
  await openDialog(page);
  await expectNoAxeViolations(page, "[data-testid='rehearse-dialog']");
  await dialog(page).getByRole("button", { name: /Video standup, client lunch, dinner date/ }).click();
  await dialog(page).getByRole("button", { name: "Show me tomorrow" }).click();
  await expect(page.getByTestId("rehearse-day")).toBeVisible();
  await expectNoAxeViolations(page, "[data-testid='rehearse-dialog']");
  await page.getByTestId("moment-chip").click();
  await expectNoAxeViolations(page, "[data-testid='rehearse-dialog']");
  for (let i = 0; i < 3; i++) await page.getByTestId("next").click();
  await expectNoAxeViolations(page, "[data-testid='rehearse-dialog']");
});

test("the whole results page still has no axe violations with the section in", async ({ page }) => {
  await openFace(page);
  await expectNoAxeViolations(page, "main");
});

test.describe("phone", () => {
  test.use({ viewport: { width: 390, height: 844 }, hasTouch: true });

  test("the teaser scrolls sideways, the stage is full width and nothing runs off the screen", async ({ page }) => {
    await serve(page, ndjson(VERIFIED_PLAN));
    await openFace(page);
    const scenes = page.locator("#rehearse").getByRole("group", { name: "Three moments from a day" });
    await expect(scenes).toBeVisible();
    await expect(page.getByRole("button", { name: "Rehearse my day" })).toBeInViewport();

    await askWorkday(page);
    await expect(page.getByTestId("rehearse-day")).toBeVisible();
    const frame = (await stage(page).boundingBox())!;
    expect(frame.x).toBeLessThanOrEqual(0.5);
    expect(frame.width).toBeGreaterThanOrEqual(389);
    // The up-close inset sits under the stage on a phone, not over the face.
    const inset = (await page.getByTestId("closer-inset").boundingBox())!;
    expect(inset.y).toBeGreaterThanOrEqual(frame.y + frame.height - 1);

    // What is drawn inside a stage is clipped by it (a scene may be wider than the frame), so only the page around the stages counts.
    const farthest = await page.evaluate(() =>
      Math.max(...Array.from(document.querySelectorAll("dialog *")).filter((el) => !el.closest(".stage")).map((el) => el.getBoundingClientRect().right)),
    );
    expect(farthest).toBeLessThanOrEqual(390.5);
    for (const name of ["Hold to see your mirror", "How we know", "Previous moment", "Next moment"]) {
      const box = (await dialog(page).getByRole("button", { name, exact: true }).boundingBox())!;
      expect(box.height).toBeGreaterThanOrEqual(40);
    }
    await expectNoAxeViolations(page, "[data-testid='rehearse-dialog']");

    // A swipe across the stage moves on.
    const y = frame.y + frame.height / 2;
    await page.mouse.move(340, y);
    await page.mouse.down();
    await page.mouse.move(60, y, { steps: 6 });
    await page.mouse.up();
    await expect(title(page)).toHaveText("Client lunch by the window");
  });
});

// ---------------------------------------------------------------------------------------------------------------
// With motion
// ---------------------------------------------------------------------------------------------------------------

test.describe("with motion", () => {
  test.use({ reducedMotion: "no-preference" });

  test("Play moves through the day and stops when you touch anything", async ({ page }) => {
    await serve(page, ndjson(VERIFIED_PLAN));
    await openFace(page);
    await askWorkday(page);
    await expect(page.getByTestId("rehearse-day")).toBeVisible({ timeout: 15_000 });
    await expect(title(page)).toHaveText("Video standup");

    await page.getByRole("button", { name: "Play the day" }).click();
    await expect(page.getByRole("button", { name: "Pause" })).toHaveAttribute("aria-pressed", "true");
    await expect(title(page)).toHaveText("Client lunch by the window", { timeout: 8000 });

    await page.getByTestId("rehearse-stage").click();
    await expect(page.getByRole("button", { name: "Play the day" })).toBeVisible();
    await page.waitForTimeout(4600);
    await expect(title(page)).toHaveText("Client lunch by the window");
  });
});

test("people who ask for less motion get no Play button and instant changes", async ({ page }) => {
  await serve(page, ndjson(VERIFIED_PLAN));
  await reachDay(page);
  await expect(page.getByTestId("play")).toHaveCount(0);
  await page.getByTestId("next").click();
  await expect(title(page)).toHaveText("Client lunch by the window");
});
