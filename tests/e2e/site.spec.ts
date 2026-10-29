import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";

// The marketing pages: landing, /try, /how-it-works, /for-brands, /privacy and the self-test.
test.use({ reducedMotion: "reduce" });

const AXE_TAGS = ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa", "best-practice"];

async function expectNoAxeViolations(page: Page) {
  const { violations } = await new AxeBuilder({ page }).withTags(AXE_TAGS).analyze();
  expect(violations.map((v) => ({ id: v.id, nodes: v.nodes.slice(0, 3).map((n) => n.html.slice(0, 140)) }))).toEqual([]);
}

const PAGES = ["/", "/try", "/how-it-works", "/for-brands", "/privacy", "/self-test"];

test.describe("landing, phone", () => {
  test.use({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });

  test("the first screen shows the face, the tape and the way in", async ({ page }) => {
    await page.goto("/");
    const face = page.getByRole("img", { name: /Synthetic portrait of a woman/ });
    await expect(face).toBeInViewport({ ratio: 0.9 });
    await expect(page.getByRole("slider", { name: /Step back from the mirror/ })).toBeInViewport();
    await expect(page.getByRole("link", { name: /Try a demo face/ }).first()).toBeInViewport();
    // The default face is the relief-friendly one, and it is not the man with the under-eye example.
    await expect(page.getByRole("link", { name: /Try a demo face/ }).first()).toHaveAttribute("href", "/try/p1a");
  });

  test("text spacing overrides do not clip or overflow the landing page", async ({ page }) => {
    await page.goto("/");
    await page.addStyleTag({
      content: "* { line-height: 1.5 !important; letter-spacing: 0.12em !important; word-spacing: 0.16em !important; } p { margin-bottom: 2em !important; }",
    });
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    expect(overflow).toBeLessThanOrEqual(1);
  });
});

test("the landing credits YouCam and names the self-test and photo options", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { level: 1 })).toContainText(/25\s*cm/);
  await expect(page.getByText("Built on YouCam HD Skin Analysis, Skin Simulation and Makeup VTO.").first()).toBeVisible();
  await expect(page.getByRole("link", { name: "Try a demo face" }).first()).toBeVisible();
  await expect(page.getByRole("link", { name: "Use my photo" })).toBeVisible();
  await expect(page.getByRole("link", { name: /Check it with your own eyes/ })).toHaveAttribute("href", "/self-test");
  await expect(page.getByText(/Don.t trust us/)).toHaveCount(0);
  await expectNoAxeViolations(page);
});

test.describe("with motion", () => {
  test.use({ reducedMotion: "no-preference" });

  test("the step-back animation has a Pause/Play control that really stops it", async ({ page }) => {
    await page.goto("/");
    const slider = page.getByRole("slider", { name: /Step back from the mirror/ });
    const toggle = page.getByRole("button", { name: /^(Pause|Play|Replay|Play the step back)$/ });
    await expect(toggle).toHaveText("Pause");

    // Wait until it is moving, then pause.
    const start = await slider.inputValue();
    await expect.poll(async () => slider.inputValue(), { timeout: 15_000 }).not.toBe(start);
    await toggle.click();
    await expect(toggle).toHaveText("Play");
    const held = await slider.inputValue();
    await page.waitForTimeout(1500);
    expect(await slider.inputValue()).toBe(held);

    // Play resumes it from where it stopped.
    await toggle.click();
    await expect(toggle).toHaveText("Pause");
    await expect.poll(async () => slider.inputValue(), { timeout: 15_000 }).not.toBe(held);

    // Touching the tape hands control over: the button offers a replay.
    await slider.focus();
    await slider.press("Home");
    await expect(toggle).toHaveText("Replay");
  });
});

test("/try offers four distinct synthetic faces, p1a first, and a gated own-photo path", async ({ page }) => {
  await page.goto("/try");
  const cards = page.locator("#faces li");
  await expect(cards).toHaveCount(4);
  await expect(cards.locator("a").first()).toHaveAttribute("href", "/try/p1a");
  const hrefs = await cards.locator("a").evaluateAll((els) => els.map((e) => e.getAttribute("href")));
  expect(hrefs).toEqual(["/try/p1a", "/try/p2b", "/try/p3a", "/try/p5a"]);
  // Four different photos and four different descriptions, each labelled as synthetic.
  const photos = await cards.locator("img").evaluateAll((els) => els.map((e) => e.getAttribute("src")));
  expect(new Set(photos).size).toBe(4);
  const texts = await cards.evaluateAll((els) => els.map((e) => e.textContent ?? ""));
  expect(new Set(texts).size).toBe(4);
  for (const text of texts) expect(text).toContain("Synthetic face (AI-generated)");
  await expect(page.getByText(/Check mine/)).toHaveCount(0);

  // Own photo: 18+ must be confirmed first.
  await page.getByRole("button", { name: "Use my photo" }).click();
  await expect(page.getByText(/Please confirm you are 18 or over/)).toBeVisible();
  await expect(page).toHaveURL(/\/try$/);
  await expect(page.getByRole("link", { name: "how my photo is handled" })).toHaveAttribute("href", "/privacy");
  await expectNoAxeViolations(page);

  await page.getByRole("checkbox", { name: /I am 18 or over/ }).check();
  await page.getByRole("button", { name: "Use my photo" }).click();
  await expect(page).toHaveURL(/\/try\/live$/, { timeout: 30_000 });
});

test("/try: an 18+ tick made the moment the page appears survives hydration", async ({ page }) => {
  // The scripts are held back so the tick deterministically lands on the server HTML before hydration; the mount effect
  // used to clear it again.
  let release!: () => void;
  const held = new Promise<void>((resolve) => (release = resolve));
  await page.route(/\/_next\/static\/.*\.js/, async (route) => {
    await held;
    await route.continue();
  });
  await page.goto("/try", { waitUntil: "commit" });
  const adult = page.getByRole("checkbox", { name: /I am 18 or over/ });
  await adult.check();
  release();
  await page.waitForTimeout(1000);
  await expect(adult).toBeChecked();
});

// /try is one calm choice, not a long page: the four faces in a row on a desktop, a 2x2 grid on a phone, then the own-photo card.
test.describe("/try layout, desktop", () => {
  test.use({ viewport: { width: 1440, height: 900 } });

  test("the four faces sit in one row, the own-photo card is on the first screen, and the page is about a screen and a third", async ({ page }) => {
    await page.goto("/try");
    const tops = await page.locator("#faces li").evaluateAll((els) => els.map((e) => Math.round(e.getBoundingClientRect().top)));
    expect(tops).toHaveLength(4);
    expect(new Set(tops).size).toBe(1);
    await expect(page.getByRole("button", { name: "Use my photo" })).toBeInViewport({ ratio: 1 });
    await expect(page.getByRole("checkbox", { name: /I am 18 or over/ })).toBeInViewport({ ratio: 1 });
    const height = await page.evaluate(() => document.documentElement.scrollHeight);
    expect(height).toBeLessThanOrEqual(900 * 1.5);
  });

  test("the landing's Use my photo link lands on the card", async ({ page }) => {
    await page.goto("/try#camera");
    await expect(page.locator("#camera")).toBeInViewport();
    await expect(page.locator("#camera-section")).toBeAttached();
  });
});

test.describe("/try layout, phone", () => {
  test.use({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });

  test("the faces are a 2x2 grid, nothing runs off the page, and the page stays under three screens", async ({ page }) => {
    await page.goto("/try");
    const boxes = await page.locator("#faces li").evaluateAll((els) =>
      els.map((e) => {
        const r = e.getBoundingClientRect();
        return { top: Math.round(r.top), left: Math.round(r.left), right: Math.round(r.right) };
      }),
    );
    expect(boxes).toHaveLength(4);
    expect(boxes[0].top).toBe(boxes[1].top);
    expect(boxes[2].top).toBe(boxes[3].top);
    expect(boxes[2].top).toBeGreaterThan(boxes[0].top);
    expect(boxes[1].left).toBeGreaterThan(boxes[0].left);
    for (const b of boxes) expect(b.right).toBeLessThanOrEqual(390);
    const { width, height } = await page.evaluate(() => ({ width: document.documentElement.scrollWidth - window.innerWidth, height: document.documentElement.scrollHeight }));
    expect(width).toBeLessThanOrEqual(1);
    expect(height).toBeLessThanOrEqual(844 * 3);
  });
});

test("/try: the keyboard reaches each face, the 18+ box, the key disclosure and the submit button, in that order", async ({ page }) => {
  await page.goto("/try");
  const seen: string[] = [];
  for (let i = 0; i < 40 && !seen.includes("button:Use my photo"); i++) {
    await page.keyboard.press("Tab");
    seen.push(
      await page.evaluate(() => {
        const el = document.activeElement as HTMLElement | null;
        if (!el) return "";
        if (el instanceof HTMLAnchorElement) return `link:${el.getAttribute("href")}`;
        if (el instanceof HTMLInputElement) return `${el.type}:${el.name}`;
        if (el.tagName === "SUMMARY") return "summary";
        return `${el.tagName.toLowerCase()}:${(el.textContent ?? "").trim().replace(/\s*→$/, "")}`;
      }),
    );
  }
  const order = ["link:/try/p1a", "link:/try/p2b", "link:/try/p3a", "link:/try/p5a", "checkbox:adult", "button:Use my photo", "summary"];
  let at = -1;
  for (const stop of order.slice(0, -1)) {
    const next = seen.indexOf(stop, at + 1);
    expect(next, `${stop} in ${seen.join(" > ")}`).toBeGreaterThan(at);
    at = next;
  }
  // The disclosure is a real, focusable summary: Enter opens it and the two fields appear.
  await page.keyboard.press("Tab");
  await expect(page.locator("summary")).toBeFocused();
  await page.keyboard.press("Enter");
  await expect(page.getByLabel(/Access code/)).toBeVisible();
  await expect(page.getByLabel(/YouCam API key/)).toBeVisible();
});

test("/privacy says where a photo goes, what is deleted, and what is kept", async ({ page }) => {
  await page.goto("/privacy");
  await expect(page.getByRole("heading", { level: 1 })).toContainText(/in plain words/);
  const main = page.getByRole("main");
  await expect(main.getByText(/We don.t store your photo/).first()).toBeVisible();
  await expect(main.getByText(/Skin Simulation picture early, so it may keep it for up to 24 hours/)).toBeVisible();
  await expect(main.getByText(/30 days at the latest/)).toBeVisible();
  await expect(main.getByText(/18 and over/).first()).toBeVisible();
  await expect(main.getByText(/Visibility, not health. Not health advice./)).toBeVisible();
  await expect(main.getByText(/An estimate from one photo, not a guarantee/)).toBeVisible();
  await expect(main.getByText(/synthetic/i).first()).toBeVisible();
  await expectNoAxeViolations(page);
});

test("the footer help link sits in the same place on every page and goes to the help section", async ({ page }) => {
  for (const path of PAGES) {
    await page.goto(path);
    const footer = page.getByRole("contentinfo");
    await expect(footer.getByRole("link", { name: "Privacy notice" })).toHaveAttribute("href", "/privacy");
    await expect(footer.getByRole("link", { name: "Help and contact" })).toHaveAttribute("href", "/privacy#help");
    await expect(footer.getByText("Built on YouCam HD Skin Analysis, Skin Simulation and Makeup VTO.")).toBeVisible();
  }
  await page.goto("/");
  await page.getByRole("contentinfo").getByRole("link", { name: "Help and contact" }).click();
  await expect(page).toHaveURL(/\/privacy#help$/);
  await expect(page.getByRole("heading", { name: "Help and contact" })).toBeInViewport();
});

test("/how-it-works leads with five cards, then validation, the YouCam table and the AI comparison", async ({ page }) => {
  await page.goto("/how-it-works");
  const five = page.locator("section[aria-labelledby=five-h]");
  await expect(five.getByRole("listitem")).toHaveCount(5);
  await expect(five.getByRole("heading", { level: 3 })).toHaveText([
    "YouCam finds it",
    "The iris is the ruler",
    "Size and contrast, measured",
    "Checked against people",
    "Not just asking an AI",
  ]);
  // The cards come before the long text.
  const firstChapter = await page.locator("#idea").boundingBox();
  const cards = await five.boundingBox();
  expect(cards!.y).toBeLessThan(firstChapter!.y);

  // The AI comparison is the real chart, framed as YouCam proof.
  const ai = page.locator("#ai");
  await expect(ai.getByText(/said .no breakouts. where YouCam found 18, 5 and 3/)).toBeVisible();
  await expect(ai.getByText(/It knows the recipe; it can.t measure your face/)).toBeVisible();
  await expect(ai.getByRole("img", { name: /AI's five answers/ })).toBeVisible();
  await expect(page.getByText(/Placeholder|Chart pending/i)).toHaveCount(0);

  // The APIs table has units; Camera Kit is explained.
  const table = page.locator("#youcam table");
  await expect(table.getByRole("row")).toHaveCount(5);
  await expect(table).toContainText("16");
  await expect(table).toContainText("1 per picture");
  await expect(page.locator("#youcam")).toContainText(/Why not the JS Camera Kit/);

  // The validation anchor lands on the ModelFest section with its chart.
  await page.goto("/how-it-works#validation");
  const validation = page.locator("#validation");
  await expect(validation.getByRole("heading", { level: 2 })).toContainText("Checked against people");
  await expect(validation).toContainText("16 observers");
  await expect(validation).toContainText("0.69 dB");
  const chart = validation.getByRole("img", { name: /predicted against observed detection thresholds/ });
  await expect(chart).toBeVisible();
  expect(await chart.evaluate((el: HTMLImageElement) => el.complete && el.naturalWidth > 0)).toBe(true);
  await expectNoAxeViolations(page);
});

test("/for-brands shows a real response, a cost table and the roadmap", async ({ page, request }) => {
  await page.goto("/for-brands");
  await expect(page.getByRole("heading", { level: 1 })).toContainText(/visibility layer/);
  await expect(page.getByText(/Illustrative|placeholder|Layout shell/i)).toHaveCount(0);

  // The JSON on the page and the saved file are the same real response.
  const res = await request.get("/brands/example-response.json");
  expect(res.ok()).toBe(true);
  const json = await res.json();
  expect(json.response.concerns.length).toBeGreaterThanOrEqual(6);
  expect(json.response.targetsTotal).toBeGreaterThan(100);
  const pores = json.response.concerns.find((c: { concern: string }) => c.concern === "pore");
  await expect(page.getByLabel("Example response")).toContainText(`"targetCount": ${pores.targetCount}`);
  await expect(page.getByLabel("Example response")).toContainText("x-scale-source");

  // Cost per session.
  const costs = page.getByRole("table");
  await expect(costs.getByRole("row", { name: /Distances only/ })).toContainText("16");
  await expect(costs.getByRole("row", { name: /Full session/ })).toContainText("about 26");
  await expect(costs.getByRole("row", { name: /already ran/ })).toContainText("0 extra");
  // Measured latency, or an honest "not measured".
  await expect(page.getByText(/median over \d+ requests/)).toBeVisible();

  await expect(page.getByRole("heading", { name: /actually be noticed/ })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Kiosk mode" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Video-call mode" })).toBeVisible();
  await expectNoAxeViolations(page);
});

test("the self-test offers non-walking options, a numeric dpi field and a gentle mismatch note", async ({ page }) => {
  await page.goto("/self-test");
  await expect(page.getByRole("heading", { level: 1 })).toContainText(/your own eyes/);
  await expect(page.getByLabel(/type your screen.s dots per inch/i)).toBeVisible();
  const wide = page.getByLabel("Rectangle size");
  const before = await wide.inputValue();
  await page.getByRole("button", { name: "Make the rectangle a little larger" }).click();
  expect(Number(await wide.inputValue())).toBeGreaterThan(Number(before));
  await expectNoAxeViolations(page);

  await page.getByRole("button", { name: /It matches/ }).click();
  await expect(page.getByRole("heading", { name: /Walk back until it disappears/ })).toBeFocused();
  await expect(page.getByText(/Rather not walk\? Stay seated and ask a friend/)).toBeVisible();
  await expect(page.getByText(/This isn.t an eye test/)).toBeVisible();
  await page.getByRole("button", { name: /It.s gone/ }).click();

  const input = page.getByLabel(/Distance when it disappeared/);
  await input.fill("42");
  await expect(page.getByRole("alert").filter({ hasText: /between 0.2/ })).toContainText(/between 0.2 and 10 metres/);
  await input.fill("9");
  await expect(page.getByText(/Seeing it farther than predicted is common/)).toBeVisible();
  await expect(page.getByText(/Screens differ in brightness|bright screen/).first()).toBeVisible();
  await expectNoAxeViolations(page);
});

test("the skip route shows the prediction without a walk", async ({ page }) => {
  await page.goto("/self-test");
  await page.getByRole("button", { name: /I can.t walk back/ }).click();
  await expect(page.getByRole("heading", { name: /Your eyes against the model/ })).toBeFocused();
  await expect(page.getByText(/gone beyond/)).toBeVisible();
});

test("the site keeps itself out of search results: noindex on the pages and a robots.txt that disallows everything", async ({ page, request }) => {
  await page.goto("/");
  await expect(page.locator('meta[name="robots"]')).toHaveAttribute("content", /noindex, nofollow/);
  const robots = await (await request.get("/robots.txt")).text();
  expect(robots).toMatch(/User-Agent: \*\s+Disallow: \/\s*$/i);
});

test("keyboard: tab order reaches the skip link, the nav, the CTAs and a visible focus ring", async ({ page }) => {
  await page.goto("/for-brands");
  await page.keyboard.press("Tab");
  await expect(page.getByRole("link", { name: "Skip to content" })).toBeFocused();
  const cta = page.getByRole("link", { name: /See it on a demo face/ });
  await cta.focus();
  const ring = await cta.evaluate((el) => {
    const s = getComputedStyle(el);
    return { style: s.outlineStyle, width: parseFloat(s.outlineWidth) };
  });
  expect(ring.style).not.toBe("none");
  expect(ring.width).toBeGreaterThanOrEqual(2);
  // The scrollable code blocks and tables can be focused and scrolled by keyboard.
  await page.getByLabel("Example response").focus();
  await expect(page.getByLabel("Example response")).toBeFocused();
  await cta.focus();
  await page.keyboard.press("Enter");
  await expect(page).toHaveURL(/\/try\/p1a$/);
});

test.describe("narrow screens and text spacing", () => {
  test.use({ viewport: { width: 320, height: 700 } });

  for (const path of ["/try", "/how-it-works", "/for-brands", "/privacy", "/self-test"]) {
    test(`${path} reflows at 320 px with text-spacing overrides and nothing runs off the page`, async ({ page }) => {
      await page.goto(path);
      await page.addStyleTag({
        content: "* { line-height: 1.5 !important; letter-spacing: 0.12em !important; word-spacing: 0.16em !important; } p { margin-bottom: 2em !important; }",
      });
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
      expect(overflow).toBeLessThanOrEqual(1);
    });
  }
});
