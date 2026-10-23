/**
 * Real smoke of "Tomorrow, from their side" on a running build: for each [face, day] it opens the demo face, asks for the
 * day, waits for the plan, then screenshots every moment (and with the mirror held) and the end of the day. With the
 * server on AGENT_MODE=live this calls Bedrock (a few cents a run, no YouCam units); on replay it calls nothing.
 *
 *   BASE=http://localhost:3230 node scripts/rehearse/smoke-ui.mjs <out-dir> '[["p1a","Coffee at 9, dinner at 7"]]'
 */
import { chromium } from "@playwright/test";
import fs from "node:fs";

const BASE = process.env.BASE ?? "http://localhost:3230";
const OUT = process.argv[2] ?? "internal/screens/rehearse-smoke";
const RUNS = JSON.parse(process.argv[3] ?? "[]");
fs.mkdirSync(OUT, { recursive: true });

const browser = await chromium.launch({ channel: "chrome" });
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
const errors = [];
page.on("console", (m) => m.type() === "error" && errors.push(m.text().slice(0, 200)));
page.on("pageerror", (e) => errors.push(String(e).slice(0, 200)));

const log = [];
for (const [face, day] of RUNS) {
  await page.goto(`${BASE}/try/${face}`);
  await page.locator("#rehearse").scrollIntoViewIfNeeded();
  await page.waitForTimeout(2500);
  await page.screenshot({ path: `${OUT}/${face}-teaser.png` });

  await page.getByRole("button", { name: "Rehearse my day" }).click();
  const box = page.getByRole("dialog");
  await box.getByLabel("What’s tomorrow?").fill(day);
  const started = Date.now();
  await box.getByRole("button", { name: "Show me tomorrow" }).click();
  await page.waitForTimeout(5000);
  await page.screenshot({ path: `${OUT}/${face}-building.png` });
  await page.getByTestId("rehearse-day").waitFor({ timeout: 90_000 });
  const ms = Date.now() - started;

  const moments = [];
  for (let i = 0; i < 9 && (await page.getByTestId("day-stage").count()); i++) {
    await page.waitForTimeout(3000);
    moments.push({
      title: await page.getByTestId("moment-title").innerText(),
      headline: await page.getByTestId("moment-headline").innerText(),
      distanceM: await page.getByTestId("day-stage").getAttribute("data-distance-m"),
    });
    await page.screenshot({ path: `${OUT}/${face}-m${i}.png` });
    await page.getByRole("button", { name: "Hold to see your mirror" }).hover();
    await page.mouse.down();
    await page.waitForTimeout(700);
    await page.screenshot({ path: `${OUT}/${face}-m${i}-mirror.png` });
    await page.mouse.up();
    await page.getByTestId("next").click();
    await page.waitForTimeout(600);
  }
  await page.waitForTimeout(1000);
  const verified = (await page.getByText("Every number checked against the model").count()) > 0;
  await page.screenshot({ path: `${OUT}/${face}-end.png` });
  log.push({ face, day, ms, verified, moments });
  await page.keyboard.press("Escape");
}

fs.writeFileSync(`${OUT}/smoke.json`, JSON.stringify({ log, errors }, null, 1));
console.log(JSON.stringify({ log, errors: errors.slice(0, 10) }, null, 1));
await browser.close();
