import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";

test.use({ reducedMotion: "reduce" });

const SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

/** Width and height from a PNG's IHDR chunk. */
const dimensions = (png: Buffer) => ({ width: png.readUInt32BE(16), height: png.readUInt32BE(20) });

test("the share route draws a 4:5 and a 9:16 PNG", async ({ request }) => {
  const post = await request.get("/share/p2b/card?format=4x5&lines=pore.mostly.room,acne.mostly.room");
  expect(post.status()).toBe(200);
  expect(post.headers()["content-type"]).toBe("image/png");
  const postBytes = await post.body();
  expect(postBytes.subarray(0, 8).equals(SIGNATURE)).toBe(true);
  expect(dimensions(postBytes)).toEqual({ width: 1080, height: 1350 });

  const story = await request.get("/share/p2b/card?format=9x16&lines=pore.mostly.room");
  expect(story.status()).toBe(200);
  expect(story.headers()["content-type"]).toBe("image/png");
  expect(dimensions(await story.body())).toEqual({ width: 1080, height: 1920 });

  // Asked for as a download.
  const download = await request.get("/share/p2b/card?format=4x5&download=1");
  expect(download.headers()["content-disposition"]).toContain("attachment");
});

test("an own photo's card never carries a face, whatever the URL asks for", async ({ request }) => {
  const plain = await (await request.get("/share/live/card?format=4x5&lines=pore.mostly.room")).body();
  const asked = await (await request.get("/share/live/card?format=4x5&lines=pore.mostly.room&face=1")).body();
  expect(asked.equals(plain)).toBe(true);
  // A demo face can be added on request, and then the picture differs.
  const demo = await (await request.get("/share/p2b/card?format=4x5&lines=pore.mostly.room")).body();
  const withFace = await (await request.get("/share/p2b/card?format=4x5&lines=pore.mostly.room&face=1")).body();
  expect(withFace.equals(demo)).toBe(false);
});

test("only the closed vocabulary can be drawn, and unknown faces are refused", async ({ request }) => {
  const junk = await request.get("/share/p2b/card?format=4x5&lines=%3Cb%3Ehi%3C/b%3E,pore.all.moon,texture.all.room");
  expect(junk.status()).toBe(200);
  expect((await request.get("/share/not-a-face/card?format=4x5")).status()).toBe(404);
});

test("the shared page previews the card, has a link preview image and no axe violations", async ({ page }) => {
  await page.goto("/share/p3a");
  await expect(page.getByRole("heading", { level: 1 })).toContainText(/From where others stand/);
  await expect(page.getByRole("img", { name: /A share card\. From where others stand\./ })).toBeVisible();
  await expect(page.locator('meta[property="og:image"]')).toHaveAttribute("content", /\/share\/p3a\/opengraph-image/);
  await expect(page.getByRole("link", { name: /See the whole reading/ })).toHaveAttribute("href", "/try/p3a");
  const { violations } = await new AxeBuilder({ page }).analyze();
  expect(violations.map((v) => v.id)).toEqual([]);
});

test("the share studio picks up to three relief lines, switches size and offers the download", async ({ page }) => {
  await page.goto("/try/p5a");
  await page.getByRole("tab", { name: "Share" }).click();
  const studio = page.locator("#share");
  const lines = studio.getByRole("checkbox");
  await expect(lines.first()).toBeVisible();
  const preview = studio.getByRole("img", { name: /Share card, 4:5 post/ });
  await expect(preview).toHaveAttribute("src", /\/share\/p5a\/card\?format=4x5&lines=/);

  // p5a offers three relief lines; all are on to begin with, and turning one off drops it from the card.
  const tokens = async () => new URL((await preview.getAttribute("src"))!, "http://localhost").searchParams.get("lines")!.split(",").filter(Boolean);
  const choices = studio.getByRole("checkbox", { name: /out of sight/ });
  await expect(choices).toHaveCount(3);
  expect(await tokens()).toHaveLength(3);
  await choices.nth(0).uncheck();
  await expect.poll(tokens).toHaveLength(2);

  await studio.getByText("9:16 story").click();
  await expect(studio.getByRole("img", { name: /Share card, 9:16 story/ })).toHaveAttribute("src", /format=9x16/);
  await expect(studio.getByRole("link", { name: "Download the picture" })).toHaveAttribute("href", /\/share\/p5a\/card\?.*download=1/);

  // The face is off unless asked for.
  await expect(studio.getByRole("img", { name: /Share card/ })).not.toHaveAttribute("src", /face=1/);
  await studio.getByLabel("Include the synthetic face").check();
  await expect(studio.getByRole("img", { name: /Share card/ })).toHaveAttribute("src", /face=1/);
});
