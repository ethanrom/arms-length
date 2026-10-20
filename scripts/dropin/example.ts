// Calls POST /api/visibility with the recorded p2b analysis, photo and masks, and prints the distance per concern.
// Start the app first (`npm run build && npm start`, or `npm run dev`), then:
//   npx tsx scripts/dropin/example.ts [baseUrl] [persona]        defaults: http://localhost:3000 p2b
// Spends no YouCam units: the endpoint never calls YouCam.
import fs from "node:fs";
import type { VisibilityReport } from "../../lib/contracts";
import { fixtureVisibilityRequest } from "./request";

async function main() {
  const base = (process.argv[2] ?? "http://localhost:3000").replace(/\/$/, "");
  const persona = process.argv[3] ?? "p2b";
  const body = JSON.stringify(fixtureVisibilityRequest(persona));
  console.log(`POST ${base}/api/visibility  (${persona}, ${(body.length / 1e6).toFixed(2)} MB)`);

  const started = Date.now();
  const res = await fetch(`${base}/api/visibility`, { method: "POST", headers: { "content-type": "application/json" }, body });
  const seconds = ((Date.now() - started) / 1000).toFixed(1);
  if (!res.ok) {
    console.error(`HTTP ${res.status}`, await res.text());
    process.exit(1);
  }

  const report = (await res.json()) as VisibilityReport;
  const scale = ["source", "method", "mm-per-px", "rel-sd"].map((k) => `${k}=${res.headers.get(`x-scale-${k}`)}`).join(" ");
  console.log(`HTTP ${res.status} in ${seconds}s, scale: ${scale}`);
  console.log("concern        targets  max (m)  median (m)  interval (m)    confidence");
  for (const c of report.concerns) {
    console.log(
      `${c.concern.padEnd(14)} ${String(c.targetCount).padStart(7)}  ${c.maxDistanceM.toFixed(2).padStart(7)}  ${c.medianDistanceM.toFixed(2).padStart(10)}  ` +
        `${`${c.intervalM[0].toFixed(2)} to ${c.intervalM[1].toFixed(2)}`.padEnd(14)}  ${c.confidence}`,
    );
  }

  const iris = JSON.parse(fs.readFileSync(`fixtures/youcam/${persona}/scale.json`, "utf8")) as { mmPerPx: number };
  console.log(`(iris-ruler scale for comparison: ${iris.mmPerPx} mm/px)`);
}

void main();
