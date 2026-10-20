/** Integrator check: fixture persona -> measurements -> visibility report, printed per concern. */
import fs from "node:fs";
import path from "node:path";
import { loadPersona } from "@/lib/skin/fixtures-io";
import { measureAnalysis } from "@/lib/skin/measure";
import { buildVisibilityReport } from "@/lib/vision/report";
import { DEFAULT_VIEWING } from "@/lib/contracts";

async function main() {
  for (const persona of process.argv.slice(2).length ? process.argv.slice(2) : ["p2b", "p3a"]) {
    const p = await loadPersona(persona, "hd");
    const scale = JSON.parse(fs.readFileSync(path.join("fixtures/youcam", persona, "scale.json"), "utf8"));
    const m = measureAnalysis(p.analysis, p.masks, p.photo, scale);
    const r = buildVisibilityReport(m, DEFAULT_VIEWING);
    console.log(`\n${persona}  mmPerPx=${scale.mmPerPx.toFixed(4)}  features=${m.features.length} regions=${m.regions.length}`);
    for (const c of r.concerns)
      console.log(
        `  ${c.concern.padEnd(12)} n=${String(c.targetCount).padStart(4)}  max=${c.maxDistanceM.toFixed(2)} m  median=${c.medianDistanceM.toFixed(2)} m  [${c.intervalM.map((x) => x.toFixed(2)).join(", ")}]  ${c.confidence}`,
      );
  }
}
main();
