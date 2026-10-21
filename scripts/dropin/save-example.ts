// Saves a real POST /api/visibility response for a recorded persona to public/brands/example-response.json, for the
// For brands page. Same call as example.ts; spends no YouCam units (the route never calls YouCam).
//   npx tsx scripts/dropin/save-example.ts [baseUrl] [persona]        defaults: http://localhost:3000 p2b
// `targets` is cut to the first TARGETS_KEPT entries (the full list is one entry per mark, over a megabyte for p2b);
// `targetsTotal` says how many there were. Everything else is the response as the route sent it.
import fs from "node:fs";
import path from "node:path";
import type { VisibilityReport } from "../../lib/contracts";
import { fixtureVisibilityRequest } from "./request";

const TARGETS_KEPT = 2;
const SCALE_HEADERS = ["source", "method", "mm-per-px", "rel-sd"] as const;

async function main() {
  const base = (process.argv[2] ?? "http://localhost:3000").replace(/\/$/, "");
  const persona = process.argv[3] ?? "p2b";
  const body = JSON.stringify(fixtureVisibilityRequest(persona));
  const res = await fetch(`${base}/api/visibility`, { method: "POST", headers: { "content-type": "application/json" }, body });
  if (!res.ok) throw new Error(`HTTP ${res.status}: ${await res.text()}`);
  const report = (await res.json()) as VisibilityReport;

  const out = {
    about: "A real response from POST /api/visibility for a recorded synthetic face, produced by scripts/dropin/save-example.ts. No YouCam units were spent.",
    request: { persona, bodyBytes: body.length, fields: ["output", "image", "masks"] },
    headers: Object.fromEntries(SCALE_HEADERS.map((k) => [`x-scale-${k}`, res.headers.get(`x-scale-${k}`)])),
    response: { ...report, targets: report.targets.slice(0, TARGETS_KEPT), targetsTotal: report.targets.length },
  };
  const file = path.join("public", "brands", "example-response.json");
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, `${JSON.stringify(out, null, 2)}\n`);
  console.log(`wrote ${file} (${report.concerns.length} concerns, ${report.targets.length} targets, ${(fs.statSync(file).size / 1024).toFixed(0)} KB)`);
}

void main();
