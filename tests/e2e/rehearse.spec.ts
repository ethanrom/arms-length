import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page, type Route } from "@playwright/test";
import type { RehearseRequest } from "../../lib/contracts/rehearse";
import { FALLBACK_PLAN, FOLLOW_UP_PLAN, STEP_LABELS, VERIFIED_PLAN, WORKDAY, errorBody, ndjson } from "./fixtures/rehearse/plans";

// Deterministic: no autoplay, no fades mid-scan, no intro glide on the Step back slider.
test.use({ reducedMotion: "reduce" });

const FACE = "/try/p1a";
const NDJSON = "application/x-ndjson";

async function expectNoAxeViolations(page: Page, include = "#rehearse") {
  const { violations } = await new AxeBuilder({ page }).include(include).analyze();
  const summary = violations.map((v) => ({ id: v.id, impact: v.impact, nodes: v.nodes.slice(0, 3).map((n) => n.html.slice(0, 160)) }));
  expect(summary).toEqual([]);
}

/** Serves `body` for POST /api/rehearse and returns the request bodies it saw, in order. */
async function serve(page: Page, ...bodies: string[]): Promise<RehearseRequest[]> {
  const seen: RehearseRequest[] = [];
  await page.route("**/api/rehearse", (route: Route) => {
    seen.push(route.request().postDataJSON() as RehearseRequest);
    const body = bodies[Math.min(seen.length - 1, bodies.length - 1)];
    return route.fulfill({ status: 200, contentType: NDJSON, body });
  });
  return seen;
}

/** Opens the face page and waits for the Step back slider, so a card click has something to move. */
async function openFace(page: Page) {
  await page.goto(FACE);
  await expect(page.getByTestId("seam")).toBeVisible({ timeout: 60_000 });
  await page.locator("#rehearse").scrollIntoViewIfNeeded();
}

/** Picks the first example and submits it. */
async function rehearseWorkday(page: Page) {
  await page.getByRole("button", { name: /Video standup, client lunch, dinner date/ }).click();
  await page.getByRole("button", { name: "Rehearse my day" }).click();
  await expect(page.getByTestId("rehearse-plan")).toBeVisible();
}

test("a chip fills the day and submit lays out the timeline, in order, with the checked badge", async ({ page }) => {
  const seen = await serve(page, ndjson(VERIFIED_PLAN));
  await openFace(page);

  await expect(page.getByRole("heading", { level: 2, name: "Rehearse your day" })).toBeVisible();
  await expect(page.getByRole("navigation", { name: "On this page" }).getByRole("link", { name: "Rehearse your day" })).toBeVisible();
  const day = page.getByLabel("Tell me about tomorrow");
  await expect(day).toHaveValue("");
  await page.getByRole("button", { name: /Video standup, client lunch, dinner date/ }).click();
  await expect(day).toHaveValue(WORKDAY);

  await page.getByRole("button", { name: "Rehearse my day" }).click();
  const cards = page.getByTestId("moment-card");
  await expect(cards).toHaveCount(3);
  await expect(cards.locator("h4")).toHaveText(["Video standup", "Client lunch by the window", "Dinner date"]);
  await expect(page.getByTestId("rehearse-summary")).toHaveText(VERIFIED_PLAN.summary.text);
  await expect(page.getByTestId("rehearse-badge")).toHaveText("Every number checked against the model");
  await expect(page.getByTestId("rehearse-badge")).toHaveAttribute("data-verified", "true");

  // Each card: time, scene chips, their view, what they'd notice, what is out of sight, and what to do.
  const first = cards.first();
  await expect(first).toContainText("9am");
  await expect(first.getByRole("list", { name: "The scene" }).getByRole("listitem")).toHaveText(["Video call", "1.9 m", "Screen glow", "Typical eyes"]);
  await expect(first.getByRole("heading", { name: /They.d notice/ })).toBeVisible();
  await expect(first.getByRole("heading", { name: "Out of sight" })).toBeVisible();
  await expect(first.getByRole("heading", { name: "Do this" })).toBeVisible();
  await expect(first).toContainText("Move the laptop back to about 80 cm");
  await expect(first).toContainText("Dark spots: about 30% (19 of 64)");

  // What was sent: the demo face by id, the text as typed, the default preferences, and no follow-up.
  expect(seen).toHaveLength(1);
  expect(seen[0]).toEqual({ face: { demoId: "p1a" }, day: WORKDAY, prefs: { callDevice: "laptop", noMakeup: false } });
});

test("the preferences are sent with the day", async ({ page }) => {
  const seen = await serve(page, ndjson(VERIFIED_PLAN));
  await openFace(page);
  await page.getByLabel("Tell me about tomorrow").fill("A video call at ten, then a long lunch");
  await page.locator("#rehearse").getByText("Phone", { exact: true }).click();
  await page.getByLabel(/rather not wear makeup/).check({ force: true });
  await page.getByRole("button", { name: "Rehearse my day" }).click();
  await expect(page.getByTestId("rehearse-plan")).toBeVisible();
  expect(seen[0].prefs).toEqual({ callDevice: "phone", noMakeup: true });
  expect(seen[0].day).toBe("A video call at ten, then a long lunch");
});

test("an empty day asks for a line instead of sending", async ({ page }) => {
  const seen = await serve(page, ndjson(VERIFIED_PLAN));
  await openFace(page);
  await page.getByRole("button", { name: "Rehearse my day" }).click();
  await expect(page.getByRole("alert").filter({ hasText: "Add a line about your day" })).toBeVisible();
  await expect(page.getByLabel("Tell me about tomorrow")).toBeFocused();
  expect(seen).toHaveLength(0);
});

test("progress steps show as they arrive, even when lines are split across chunks", async ({ page }) => {
  // A fetch stand-in that streams the run in three bursts, cutting lines (and a multi-byte character) at awkward places.
  await page.addInitScript(
    ({ body }) => {
      const real = window.fetch.bind(window);
      const w = window as unknown as { __next: () => void };
      const gates: (() => void)[] = [];
      w.__next = () => gates.shift()?.();
      window.fetch = (input, init) => {
        const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
        if (!url.endsWith("/api/rehearse")) return real(input, init);
        const bytes = new TextEncoder().encode(body);
        const newline = (n: number) => {
          let at = -1;
          for (let i = 0; i < n; i++) at = bytes.indexOf(10, at + 1);
          return at + 1;
        };
        // 1: the first step and a piece of the second. 2: the rest of the steps. 3: the plan line.
        const bursts = [bytes.slice(0, newline(1) + 12), bytes.slice(newline(1) + 12, newline(4)), bytes.slice(newline(4))];
        const stream = new ReadableStream<Uint8Array>({
          async start(controller) {
            for (let b = 0; b < bursts.length; b++) {
              if (b > 0) await new Promise<void>((resolve) => gates.push(resolve));
              const burst = bursts[b];
              for (let at = 0; at < burst.length; at += 61) controller.enqueue(burst.slice(at, at + 61));
            }
            controller.close();
          },
        });
        return Promise.resolve(new Response(stream, { status: 200, headers: { "content-type": "application/x-ndjson" } }));
      };
    },
    { body: ndjson(VERIFIED_PLAN) },
  );
  await openFace(page);
  const next = () => page.evaluate(() => (window as unknown as { __next: () => void }).__next());

  await page.getByLabel("Tell me about tomorrow").fill(WORKDAY);
  await page.getByRole("button", { name: "Rehearse my day" }).click();

  const steps = page.getByTestId("rehearse-steps");
  await expect(steps).toHaveAttribute("aria-live", "polite");
  await expect(steps.getByRole("listitem")).toHaveText(["Reading your day", STEP_LABELS[0] + " (in progress)"]);
  await expect(page.getByRole("button", { name: "Rehearse my day" }).or(page.getByRole("button", { name: "Rehearsing" }))).toHaveAttribute("aria-disabled", "true");
  await expect(page.getByTestId("rehearse-plan")).toHaveCount(0);

  await next();
  await expect(steps.getByRole("listitem")).toHaveText(["Reading your day", ...STEP_LABELS.slice(0, 3), STEP_LABELS[3] + " (in progress)"]);
  await expect(page.getByTestId("rehearse-plan")).toHaveCount(0);

  await next();
  await expect(page.getByTestId("moment-card")).toHaveCount(3);
  await expect(steps).toHaveCount(0);

  // The steps stay available under "How this was put together".
  await page.getByText("How this was put together").click();
  await expect(page.getByTestId("rehearse-plan").getByRole("listitem").filter({ hasText: STEP_LABELS[2] })).toBeVisible();
});

test("the fallback plan says it was built directly from the model", async ({ page }) => {
  await serve(page, ndjson(FALLBACK_PLAN));
  await openFace(page);
  await rehearseWorkday(page);
  const badge = page.getByTestId("rehearse-badge");
  await expect(badge).toHaveText("Built directly from the model");
  await expect(badge).toHaveAttribute("data-verified", "false");
  await expect(page.getByText("Every number checked against the model")).toHaveCount(0);
  // Nothing in the plan reads as a failure.
  await expect(page.getByTestId("rehearse-plan")).not.toContainText(/fail|error|couldn.t|wrong/i);
  await expect(page.getByTestId("moment-card")).toHaveCount(3);
  await expectNoAxeViolations(page);
});

test("each card draws their view of the face at that moment", async ({ page }) => {
  await serve(page, ndjson(VERIFIED_PLAN));
  await openFace(page);
  await rehearseWorkday(page);
  const views = page.getByTestId("their-view");
  await expect(views).toHaveCount(3);
  for (let i = 0; i < 3; i++) await expect(views.nth(i)).toHaveAttribute("data-state", "ready", { timeout: 60_000 });
  await expect(views.nth(1)).toHaveAccessibleName(/from 1\.5 metres, in window light/);
  // The canvas holds a rendered frame, not an empty one.
  const painted = await views.nth(1).locator("canvas").evaluate((c: HTMLCanvasElement) => {
    const { data } = c.getContext("2d")!.getImageData(0, 0, c.width, c.height);
    return c.width > 1 && data.some((v, i) => i % 4 !== 3 && v > 0);
  });
  expect(painted).toBe(true);
});

test("choosing a card moves the Step back slider and scrolls to it", async ({ page }) => {
  await serve(page, ndjson(VERIFIED_PLAN));
  await openFace(page);
  await rehearseWorkday(page);
  const slider = page.getByRole("slider", { name: /Step back/ });
  await expect(slider).toHaveAttribute("aria-valuetext", /^1 metre/);

  const scrolledTo = async () => page.evaluate(() => window.scrollY);
  const down = await scrolledTo();
  expect(down).toBeGreaterThan(800);

  // A click on the card itself.
  await page.getByRole("heading", { name: "Client lunch by the window" }).click();
  await expect(slider).toHaveAttribute("aria-valuetext", /^1\.5 metres/);
  await expect(page.locator("#step-back")).toBeInViewport();
  expect(await scrolledTo()).toBeLessThan(down);
  await expect(page.getByTestId("readout")).toHaveText(/^1\.5\s*m$/);

  // The keyboard has a button for it, and the second choice moves it again.
  await page.locator("#rehearse").scrollIntoViewIfNeeded();
  const dinner = page.getByRole("button", { name: "Step back to 90 cm" });
  await dinner.focus();
  await page.keyboard.press("Enter");
  await expect(slider).toHaveAttribute("aria-valuetext", /^90 centimetres/);
  await expect(page.locator("#step-back")).toBeInViewport();

  // Opening "How we know" is the disclosure's own click: it does not move the slider.
  await page.locator("#rehearse").scrollIntoViewIfNeeded();
  await page.locator("#rehearse").getByText("How we know").first().click();
  await expect(slider).toHaveAttribute("aria-valuetext", /^90 centimetres/);
  await expect(page.locator("#rehearse")).toBeInViewport();
});

test("How we know lists the assumptions and the receipt numbers behind a card", async ({ page }) => {
  await serve(page, ndjson(VERIFIED_PLAN));
  await openFace(page);
  await rehearseWorkday(page);
  const lunch = page.getByTestId("moment-card").nth(1);
  await lunch.getByText("How we know").click();
  await expect(lunch.getByText("Lunch is at a table for two, about 1.5 m across.")).toBeVisible();
  await expect(lunch.getByText("A table for two puts you about 1.5 m apart.")).toBeVisible();
  const receipt = lunch.getByRole("heading", { name: /One mark in detail: dark spots/i }).locator("xpath=..");
  for (const [label, value] of [
    ["Size on the face", "1.1 mm"],
    ["Contrast with the skin around it", "9.2%"],
    ["Size to the eye", "2.5 arcmin"],
    ["Contrast needed, sharpest eyes", "3.1%"],
    ["Contrast needed, typical viewer", "6.4%"],
  ]) {
    await expect(receipt.locator("dt", { hasText: label })).toBeVisible();
    await expect(receipt.locator("dt", { hasText: label }).locator("xpath=following-sibling::dd[1]")).toHaveText(value);
  }
  await expect(receipt).toContainText("A typical viewer could pick it out from here.");

  const call = page.getByTestId("moment-card").first();
  await call.getByText("How we know").click();
  await expect(call.getByText("Laptop webcam about 55 cm from your face, with a 70 degree field of view.")).toBeVisible();
});

test("a follow-up sends the question with the previous plan and replaces the plan", async ({ page }) => {
  const seen = await serve(page, ndjson(VERIFIED_PLAN), ndjson(FOLLOW_UP_PLAN));
  await openFace(page);
  await rehearseWorkday(page);

  await page.getByLabel("What if…?").fill("What if lunch is outdoors?");
  await page.getByRole("button", { name: "Ask again" }).click();
  await expect(page.getByTestId("rehearse-summary")).toHaveText(FOLLOW_UP_PLAN.summary.text);
  await expect(page.getByTestId("moment-card")).toHaveCount(3);

  expect(seen).toHaveLength(2);
  const body = seen[1];
  expect(body.followUp?.question).toBe("What if lunch is outdoors?");
  expect(body.followUp?.previous.day).toBe(WORKDAY);
  expect(body.followUp?.previous.moments.map((m) => m.title)).toEqual(["Video standup", "Client lunch by the window", "Dinner date"]);
  expect(body.followUp?.previous.verified).toBe(true);
  expect(body.face).toEqual({ demoId: "p1a" });
  // The new plan starts with a clean question box.
  await expect(page.getByLabel("What if…?")).toHaveValue("");
});

test("an error reply is a kind sentence, and an earlier plan stays", async ({ page }) => {
  await serve(page, errorBody("rate_limited"));
  await openFace(page);
  await page.getByLabel("Tell me about tomorrow").fill(WORKDAY);
  await page.getByRole("button", { name: "Rehearse my day" }).click();
  const alert = page.getByTestId("rehearse-error");
  await expect(alert).toContainText("That is a lot of rehearsals for now");
  await expect(page.getByTestId("rehearse-plan")).toHaveCount(0);
  await expectNoAxeViolations(page);
});

test("a follow-up that fails keeps the plan and says so kindly", async ({ page }) => {
  await serve(page, ndjson(VERIFIED_PLAN), errorBody("timeout"));
  await openFace(page);
  await rehearseWorkday(page);
  await page.getByLabel("What if…?").fill("What if I am on my phone?");
  await page.getByRole("button", { name: "Ask again" }).click();
  await expect(page.getByTestId("rehearse-plan").getByRole("alert")).toContainText("That took longer than expected");
  await expect(page.getByTestId("moment-card")).toHaveCount(3);
});

test("a dropped connection ends the run with a message, not a spinner", async ({ page }) => {
  await page.route("**/api/rehearse", (route) => route.abort("connectionreset"));
  await openFace(page);
  await page.getByLabel("Tell me about tomorrow").fill(WORKDAY);
  await page.getByRole("button", { name: "Rehearse my day" }).click();
  await expect(page.getByTestId("rehearse-error")).toContainText("couldn't be reached");
  await expect(page.getByTestId("rehearse-steps")).toHaveCount(0);
});

test("the section has no axe violations, asking or with a plan (disclosures open)", async ({ page }) => {
  await serve(page, ndjson(VERIFIED_PLAN));
  await openFace(page);
  await expectNoAxeViolations(page);
  await rehearseWorkday(page);
  for (const summary of await page.locator("#rehearse summary").all()) await summary.click();
  await expectNoAxeViolations(page);
});

test("the whole results page still has no axe violations with the section in", async ({ page }) => {
  await serve(page, ndjson(VERIFIED_PLAN));
  await openFace(page);
  await rehearseWorkday(page);
  await expectNoAxeViolations(page, "main");
});

test("keyboard: the examples, toggles and button are all reachable, and focus is visible", async ({ page }) => {
  await serve(page, ndjson(VERIFIED_PLAN));
  await openFace(page);
  const order = [
    page.getByLabel("Tell me about tomorrow"),
    page.getByRole("button", { name: /Video standup, client lunch, dinner date/ }),
    page.getByRole("button", { name: "Presenting at work" }),
    page.getByRole("button", { name: "Wedding guest" }),
    page.getByRole("radio", { name: "Laptop" }),
    page.getByLabel(/rather not wear makeup/),
    page.getByRole("button", { name: "Rehearse my day" }),
  ];
  await order[0].focus();
  for (const stop of order.slice(1)) {
    await page.keyboard.press("Tab");
    await expect(stop).toBeFocused();
  }
  await page.keyboard.press("Enter");
  // Empty day: the nudge, not a request.
  await expect(page.getByRole("alert").filter({ hasText: "Add a line" })).toBeVisible();
});

test("a chip edit re-runs the moment and marks it as edited (once the page is wired to the model)", async ({ page }) => {
  await serve(page, ndjson(VERIFIED_PLAN));
  await openFace(page);
  await rehearseWorkday(page);
  const lunch = page.getByTestId("moment-card").nth(1);
  const edit = lunch.getByText("Change the light, the eyes or the distance");
  test.skip((await edit.count()) === 0, "The page passes no `rerun` yet, so moments are not editable.");

  await edit.click();
  await lunch.getByText("Daylight", { exact: true }).click();
  await expect(lunch.getByTestId("edited-note")).toContainText("Numbers from the model, wording by template");
  await expect(lunch.getByRole("heading", { name: "Do this" })).toHaveCount(0);
  await lunch.getByRole("button", { name: "Back to the plan" }).click();
  await expect(lunch.getByTestId("edited-note")).toHaveCount(0);
  await expect(lunch.getByRole("heading", { name: "Do this" })).toBeVisible();
});

for (const viewport of [
  { width: 1440, height: 900 },
  { width: 390, height: 844 },
]) {
  test(`the section fits ${viewport.width}x${viewport.height}: no sideways scroll, targets big enough`, async ({ page }) => {
    await page.setViewportSize(viewport);
    await serve(page, ndjson(VERIFIED_PLAN));
    await openFace(page);
    await rehearseWorkday(page);
    await expect(page.getByTestId("moment-card")).toHaveCount(3);

    // Nothing in the section pokes past the screen (the page's own tape labels can, by a pixel, so the page width is not the test).
    const farthest = await page.evaluate(() =>
      Math.max(...Array.from(document.querySelectorAll("#rehearse *")).map((el) => el.getBoundingClientRect().right)),
    );
    expect(farthest).toBeLessThanOrEqual(viewport.width + 0.5);

    for (const name of ["Rehearse my day", "Step back to 1.9 m", "Ask again"]) {
      const box = (await page.getByRole("button", { name }).first().boundingBox())!;
      expect(box.height).toBeGreaterThanOrEqual(40);
      expect(box.x + box.width).toBeLessThanOrEqual(viewport.width);
    }
    const card = (await page.getByTestId("moment-card").first().boundingBox())!;
    expect(card.x).toBeGreaterThanOrEqual(0);
    expect(card.x + card.width).toBeLessThanOrEqual(viewport.width);
    await expectNoAxeViolations(page);
  });
}
