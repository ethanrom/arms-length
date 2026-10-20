/**
 * Integrator check: fixture persona -> measurements -> visibility report, printed per concern.
 * Dark circles, eye bags, redness and wrinkles are measured against renders/sim_counterfactual.png when the persona has one;
 * pass --surround to measure them against nearby skin instead.
 */
import fs from "node:fs";
import path from "node:path";
import { decodeImage, loadPersona } from "@/lib/skin/fixtures-io";
import { alignCounterfactual } from "@/lib/skin/counterfactual";
import { measureAnalysis } from "@/lib/skin/measure";
import { buildVisibilityReport } from "@/lib/vision/report";
import { DEFAULT_VIEWING } from "@/lib/contracts";
import { describeConcern } from "@/lib/copy";

async function main() {
  const args = process.argv.slice(2);
  const surround = args.includes("--surround");
  const personas = args.filter((a) => !a.startsWith("--"));
  for (const persona of personas.length ? personas : ["p2b", "p3a"]) {
    const p = await loadPersona(persona, "hd");
    const scale = JSON.parse(fs.readFileSync(path.join("fixtures/youcam", persona, "scale.json"), "utf8"));
    const simFile = path.join("fixtures/youcam", persona, "renders/sim_counterfactual.png");
    const sim = !surround && fs.existsSync(simFile) ? alignCounterfactual(p.photo, await decodeImage(simFile)) : undefined;
    const m = measureAnalysis(p.analysis, p.masks, p.photo, scale, sim);
    const r = buildVisibilityReport(m, DEFAULT_VIEWING);
    console.log(`\n${persona}  mmPerPx=${scale.mmPerPx.toFixed(4)}  features=${m.features.length} regions=${m.regions.length}  contrast: ${sim ? "counterfactual" : "surround"}`);
    for (const s of m.skipped) console.log(`  skipped ${s.concern}: ${s.reason}`);
    const PROFILE_AT = [0.6, 1, 1.5, 2.5, 4];
    for (const c of r.concerns) {
      console.log(
        `  ${c.concern.padEnd(12)} n=${String(c.targetCount).padStart(4)}  max=${c.maxDistanceM.toFixed(2)} m  median=${c.medianDistanceM.toFixed(2)} m  [${c.intervalM.map((x) => x.toFixed(2)).join(", ")}]  ${c.confidence}`,
      );
      const at = PROFILE_AT.map((d) => c.profile?.find((p) => p.distanceM === d));
      console.log(
        `    profile count (share) at ${PROFILE_AT.join(" / ")} m: ${at.map((p) => (p ? `${p.count} (${Math.round(p.fraction * 100)}%)` : "-")).join("  ")}`,
      );
      const d = describeConcern(c);
      console.log(`    ${d.tone}: ${d.headline} ${d.detail}`);
    }
  }
}
main();
