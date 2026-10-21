import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";

// /science: the interactive explainer. Each widget runs production code in the browser, so these tests drive the controls
// and read the results back. E2E_BASE_URL lets a run point at a server on another port than the default config's.
if (process.env.E2E_BASE_URL) test.use({ baseURL: process.env.E2E_BASE_URL });
test.use({ reducedMotion: "reduce" });
test.setTimeout(90_000);

const AXE_TAGS = ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa", "best-practice"];

async function expectNoAxeViolations(page: Page) {
  const { violations } = await new AxeBuilder({ page }).withTags(AXE_TAGS).analyze();
  expect(violations.map((v) => ({ id: v.id, nodes: v.nodes.slice(0, 3).map((n) => n.html.slice(0, 160)) }))).toEqual([]);
}

/** Widgets mount as they near the viewport; scroll each chapter into view and wait for its figure. */
async function mountAll(page: Page) {
  for (const id of ["follow", "angle", "csf", "modelfest", "eyes", "survival", "worth-it"]) {
    await page.locator(`#${id}`).scrollIntoViewIfNeeded();
    await page.locator(`#${id}`).evaluate((el) => el.scrollIntoView());
    await expect(page.locator(`#${id} figure`).first()).toBeVisible();
  }
  await page.locator("#references").scrollIntoViewIfNeeded();
}

const number = (text: string | null) => Number.parseFloat((text ?? "").replace(/[^0-9.\-]/g, ""));

test("/science loads with its contents list, the evidence sections and the nav entry", async ({ page }) => {
  await page.goto("/science");
  await expect(page.getByRole("heading", { level: 1 })).toContainText("running in your browser");
  const toc = page.getByRole("navigation", { name: "On this page" });
  await expect(toc.locator("ol a")).toHaveCount(10);
  await expect(toc.locator("ol").getByRole("link", { name: /How we checked it/ })).toHaveAttribute("href", "#checks");
  await expect(toc.locator("ol").getByRole("link", { name: /References/ })).toHaveAttribute("href", "#references");
  await expect(page.getByRole("navigation", { name: "Main" }).first().getByRole("link", { name: "The science" })).toHaveAttribute("href", "/science");
});

test("angle: the sliders move the readouts, doubling both keeps the angle, and twice the size reaches twice as far", async ({ page }) => {
  await page.goto("/science");
  await page.locator("#angle").scrollIntoViewIfNeeded();
  const angle = page.getByTestId("angle-arcmin");
  await expect(angle).toContainText("arcmin");
  const doubling = page.getByTestId("angle-doubling");
  await expect(doubling).toContainText("×2.00");

  const before = number(await angle.innerText());
  const size = page.getByRole("slider", { name: "Disk diameter" });
  await size.focus();
  for (let i = 0; i < 10; i++) await size.press("ArrowRight");
  await expect(size).toHaveAttribute("aria-valuetext", /3\.0 millimetres/);
  expect(number(await angle.innerText())).toBeGreaterThan(before * 1.3);
  await expect(doubling).toContainText("×2.00");

  const distance = page.getByRole("slider", { name: "Distance" });
  const verdict = page.getByTestId("angle-verdict");
  const first = await verdict.innerText();
  await distance.focus();
  await distance.press("End");
  await expect(distance).toHaveAttribute("aria-valuetext", /10\.00 metres/);
  await expect(verdict).not.toHaveText(first);

  // Doubling both leaves the angle where it was.
  await size.fill("1.5");
  await distance.fill("2");
  const angleBefore = await angle.innerText();
  await page.getByRole("button", { name: "Double both" }).click();
  await expect(distance).toHaveAttribute("aria-valuetext", /4\.00 metres/);
  expect(number(await angle.innerText())).toBeCloseTo(number(angleBefore), 1);
});

test("csf: frequency, contrast and light change the readouts; the plot and patch are there", async ({ page }) => {
  await page.goto("/science");
  await page.locator("#csf").evaluate((el) => el.scrollIntoView());
  const figure = page.locator("#csf figure").first();
  await expect(figure.getByRole("img", { name: /Contrast sensitivity against spatial frequency/ })).toBeVisible();
  await expect(figure.getByRole("img", { name: /Gabor patch/ })).toBeVisible();
  const need = figure.getByText(/needed by a typical sharp-eyed person/);
  await expect(need).toContainText("cycles/degree");

  const freq = figure.getByRole("slider", { name: "Spatial frequency" });
  await freq.focus();
  await freq.press("End");
  await expect(freq).toHaveAttribute("aria-valuetext", /30\.0 cycles per degree/);
  const contrast = figure.getByRole("slider", { name: "Contrast" });
  await contrast.press("Home");
  await expect(figure.getByText("Out of sight, even for perfect eyes.")).toBeVisible();

  // Daylight lifts the sensitivity of fine detail: a larger luminance factor.
  const factor = figure.locator("dd", { hasText: /^×\d\.\d\d$/ }).first();
  const indoor = number(await factor.innerText());
  await figure.getByRole("radio", { name: /Daylight/ }).check({ force: true });
  expect(number(await factor.innerText())).toBeGreaterThan(indoor);
});

test("modelfest: 41 points, hover shows the stimulus and its error, the headline numbers are the file's, one stimulus re-runs", async ({ page }) => {
  await page.goto("/science");
  await page.locator("#modelfest").evaluate((el) => el.scrollIntoView());
  const points = page.getByTestId("mf-point");
  await expect(points).toHaveCount(41);
  const figure = page.locator("#modelfest figure").first();
  await expect(figure).toContainText("0.69");
  await expect(figure).toContainText("0.78 dB");
  await expect(figure).toContainText("1.03 dB");

  await points.nth(3).focus();
  await expect(figure.getByText(/^Stimulus \d+$/)).toBeVisible();
  await expect(figure.locator("dt", { hasText: "Error" })).toBeVisible();
  // Hovering the chart picks the nearest point, even inside the dense cluster.
  const target = points.nth(10);
  const id = await target.getAttribute("data-point");
  const box = (await target.boundingBox())!;
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await expect(figure.getByText(`Stimulus ${id}`, { exact: true })).toBeVisible();
  await expect(figure.locator("dl").last()).toContainText(/dB/);

  // Pick the 0.25 degree disk and recompute its threshold with the production detector in a worker.
  await figure.getByRole("button", { name: /Stimulus 40: Disk/ }).click();
  await figure.getByRole("button", { name: "Run it here" }).click();
  await expect(figure.getByText(/Recomputed in your browser: -32\.98 dB/)).toBeVisible({ timeout: 45_000 });
  await expectNoAxeViolations(page);
});

test("follow one mark: the outline is traced from the mask, the distance flips the verdict, another mark can be picked", async ({ page }) => {
  await page.goto("/science");
  await page.locator("#follow").evaluate((el) => el.scrollIntoView());
  const figure = page.locator("#follow figure").first();
  const caption = page.getByTestId("follow-caption");
  await expect(caption).toContainText(/dark spot \d+ of 89/);
  // Step 1 draws the traced polygon (a handful of corners even for a small spot), not the 4-corner fallback box.
  const outline = page.locator("#follow ol li").first().locator("svg path").last();
  await expect(outline).toHaveAttribute("d", /^M[\d. ]+(L[\d. ]+){5,}Z$/, { timeout: 15_000 });
  await expect(figure.getByText("YouCam found it here.")).toBeVisible();

  const seen = page.getByRole("slider", { name: "Seen from" });
  await seen.focus();
  await seen.press("Home");
  await expect(page.locator("#follow ol li").last()).toContainText("could see it from");
  await seen.press("End");
  await expect(page.locator("#follow ol li").last()).toContainText("couldn't pick it out");

  const before = await caption.innerText();
  await figure.getByRole("button", { name: "Next" }).click();
  await expect(caption).not.toHaveText(before);
  await figure.getByRole("radio", { name: /Pores/ }).check({ force: true });
  await expect(caption).toContainText(/pore \d+ of 649/);
  // The pore's size is an assumption or a photo measurement, and the sheet says which.
  await expect(page.locator("#follow ol")).toContainText(/Assumed size|Measured in the photo/);
});

test("typical and perfect eyes: 6 dB widens a dark spot's band about 1.5 times, more margin widens it further", async ({ page }) => {
  await page.goto("/science");
  await page.locator("#eyes").evaluate((el) => el.scrollIntoView());
  const factor = page.getByTestId("eyes-factor");
  await expect(factor).toContainText("×1.4");
  const margin = page.getByRole("slider", { name: "Margin" });
  await margin.focus();
  await margin.press("End");
  const wide = number((await factor.innerText()).replace("×", ""));
  expect(wide).toBeGreaterThan(1.7);
  await margin.press("Home");
  await expect(factor).toContainText("×1.00");
});

test("survival: 649 pores are counted by a worker, the recomputed counts match the recorded report, and the distance moves the count", async ({ page }) => {
  await page.goto("/science");
  await page.locator("#survival").evaluate((el) => el.scrollIntoView());
  const count = page.getByTestId("survival-count");
  await expect(count).toContainText("of 649", { timeout: 20_000 });
  await expect(page.locator("#survival")).toContainText("Recomputed counts equal the recorded report at all 8 distances");
  const near = number(await count.innerText());
  const slider = page.getByRole("slider", { name: "Viewer's distance" });
  await slider.focus();
  await slider.press("End");
  const far = number(await count.innerText());
  expect(far).toBeLessThan(near);
});

test("worth it: three labelled pictures, six concerns, and the picture follows the choice", async ({ page }) => {
  await page.goto("/science");
  await page.locator("#worth-it").evaluate((el) => el.scrollIntoView());
  const figure = page.locator("#worth-it figure").first();
  await expect(figure.getByRole("img", { name: /YouCam Skin Simulation at half strength/ })).toBeVisible({ timeout: 20_000 });
  await expect(figure.getByRole("img", { name: /The difference between the photo and the simulation/ })).toBeVisible({ timeout: 20_000 });
  await expect(figure.getByRole("radio")).toHaveCount(6);
  const photo = figure.getByRole("img", { name: /The photo, cropped to the part of the face for/ });
  const label = await photo.getAttribute("aria-label");
  await figure.getByRole("radio", { name: /Pores/ }).check({ force: true });
  await expect(photo).not.toHaveAttribute("aria-label", label ?? "");
});

test("how we checked it: ten checks with sources and commands, and numbered references that the text cites", async ({ page }) => {
  await page.goto("/science");
  await page.locator("#checks").evaluate((el) => el.scrollIntoView());
  const table = page.locator("#checks table");
  await expect(table.locator("tbody tr")).toHaveCount(10);
  await expect(table).toContainText("0.69 dB RMS over 41 analytic stimuli");
  await expect(table).toContainText("0.78 dB over the 8 skin-like shapes");
  await expect(table).toContainText("1.0328");
  await expect(table).toContainText("217.29");
  await expect(table).toContainText("npx tsx eval/run.ts --detector=standard");
  await expect(page.locator("#reproduce")).toContainText("npm test");
  await expect(page.locator("#reproduce").getByRole("link", { name: /NUMBERS\.md/ })).toHaveAttribute("href", /docs\/NUMBERS\.md$/);
  await expect(page.locator("#reproduce").getByRole("link", { name: /The repository/ })).toHaveAttribute("href", "https://github.com/ethanrom/arms-length");

  const refs = page.locator("#references ol > li");
  const n = await refs.count();
  expect(n).toBeGreaterThanOrEqual(14);
  await expect(page.locator("#ref-1")).toContainText("Watson");
  await expect(page.locator("#references")).toContainText("Rüfer");
  await expect(page.locator("#references")).toContainText("doi:10.1167/5.9.6");
  // Every inline citation points at a reference that exists.
  const targets = await page.locator("main sup a[href^='#ref-']").evaluateAll((as) => [...new Set(as.map((a) => a.getAttribute("href")))]);
  expect(targets.length).toBeGreaterThanOrEqual(10);
  for (const href of targets) await expect(page.locator(href as string)).toHaveCount(1);
});

test("axe finds no violations once every widget is on the page", async ({ page }) => {
  await page.goto("/science");
  await mountAll(page);
  await expect(page.getByTestId("mf-point")).toHaveCount(41);
  await expect(page.getByTestId("survival-count")).toContainText("of 649", { timeout: 20_000 });
  await expectNoAxeViolations(page);
});

test.describe("phone", () => {
  test.use({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });

  test("nothing overflows sideways and the controls are reachable", async ({ page }) => {
    await page.goto("/science");
    await mountAll(page);
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    expect(overflow).toBeLessThanOrEqual(1);
    await expect(page.getByRole("slider", { name: "Disk diameter" })).toBeVisible();
  });
});
