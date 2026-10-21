// Times POST /api/visibility on a recorded persona and writes public/brands/latency.json for the For brands page.
// Run it against a production build (`npm run build && npm start`), so the figure is not dev-server compile time:
//   npx tsx scripts/dropin/time-example.ts [baseUrl] [persona] [runs]       defaults: http://localhost:3000 p2b 5
// Spends no YouCam units: the route never calls YouCam. The first request is a warm-up and is not counted.
// The route allows 20 requests per 10 minutes per address, so keep runs small.
import fs from "node:fs";
import path from "node:path";
import { fixtureVisibilityRequest } from "./request";

async function main() {
  const base = (process.argv[2] ?? "http://localhost:3000").replace(/\/$/, "");
  const persona = process.argv[3] ?? "p2b";
  const runs = Number(process.argv[4] ?? 5);
  const body = JSON.stringify(fixtureVisibilityRequest(persona));

  const post = async () => {
    const started = performance.now();
    const res = await fetch(`${base}/api/visibility`, { method: "POST", headers: { "content-type": "application/json" }, body });
    await res.arrayBuffer();
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return performance.now() - started;
  };

  await post(); // warm-up
  const times: number[] = [];
  for (let i = 0; i < runs; i++) times.push(await post());
  const sorted = [...times].sort((a, b) => a - b);
  const medianMs = sorted[Math.floor(sorted.length / 2)];

  const out = {
    about: "Wall-clock time of POST /api/visibility from request sent to body read, after one warm-up request. Produced by scripts/dropin/time-example.ts.",
    persona,
    runs,
    timesMs: times.map(Math.round),
    medianMs: Math.round(medianMs),
    minMs: Math.round(sorted[0]),
    maxMs: Math.round(sorted[sorted.length - 1]),
    bodyBytes: body.length,
    server: "a production build (next start) on the same machine",
    node: process.version,
    platform: process.platform,
    measuredAt: new Date().toISOString().slice(0, 10),
  };
  const file = path.join("public", "brands", "latency.json");
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, `${JSON.stringify(out, null, 2)}\n`);
  console.log(`wrote ${file}: median ${out.medianMs} ms (min ${out.minMs}, max ${out.maxMs}) over ${runs} runs`);
}

void main();
