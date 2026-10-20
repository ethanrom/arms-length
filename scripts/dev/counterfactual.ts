/** Integrator check: region and wrinkle distances before (surround) and after (counterfactual) for fixture personas. */
import fs from "node:fs";
import path from "node:path";
import { loadPersona, decodeImage } from "@/lib/skin/fixtures-io";
import { measureAnalysis } from "@/lib/skin/measure";
import { alignCounterfactual } from "@/lib/skin/counterfactual";
import { COUNTERFACTUAL_CONCERNS } from "@/lib/skin/params";
import { buildVisibilityReport } from "@/lib/vision/report";
import { DEFAULT_VIEWING, type ConcernVisibility } from "@/lib/contracts";

const f = (x: number) => x.toFixed(2).padStart(5);
const at = (c: ConcernVisibility, d: number) => c.profile?.find((p) => p.distanceM === d)?.count ?? 0;

async function main() {
  const personas = process.argv.slice(2).length ? process.argv.slice(2) : ["p1a", "p2b", "p3a", "p5a"];
  for (const persona of personas) {
    const p = await loadPersona(persona, "hd");
    const scale = JSON.parse(fs.readFileSync(path.join("fixtures/youcam", persona, "scale.json"), "utf8"));
    const sim = await decodeImage(path.join("fixtures/youcam", persona, "renders/sim_counterfactual.png"));
    const aligned = alignCounterfactual(p.photo, sim);
    const before = measureAnalysis(p.analysis, p.masks, p.photo, scale);
    const after = measureAnalysis(p.analysis, p.masks, p.photo, scale, aligned);
    const rb = buildVisibilityReport(before, DEFAULT_VIEWING);
    const ra = buildVisibilityReport(after, DEFAULT_VIEWING);
    console.log(`\n${persona}`);
    for (const concern of COUNTERFACTUAL_CONCERNS) {
      const b = rb.concerns.find((c) => c.concern === concern);
      const a = ra.concerns.find((c) => c.concern === concern);
      const line = (c: ConcernVisibility | undefined) =>
        c ? `n=${String(c.targetCount).padStart(3)} max=${f(c.maxDistanceM)} med=${f(c.medianDistanceM)} @1.5m=${String(at(c, 1.5)).padStart(3)} @4m=${String(at(c, 4)).padStart(3)} ${c.confidence}` : "none";
      console.log(`  ${concern.padEnd(11)} before ${line(b)}\n  ${"".padEnd(11)} after  ${line(a)}`);
      if (concern !== "wrinkle") {
        for (const r of after.regions.filter((x) => x.concern === concern)) {
          const r0 = before.regions.find((x) => x.id === r.id)!;
          const t0 = rb.targets.find((t) => t.targetId === r.id)!;
          const t1 = ra.targets.find((t) => t.targetId === r.id)!;
          console.log(
            `      ${r.id} ${r.widthMm.toFixed(0)}x${r.heightMm.toFixed(0)}mm  lum ${r0.contrast.lum.toFixed(3)} -> ${r.contrast.lum.toFixed(3)}  rg ${r0.contrast.rg.toFixed(3)} -> ${r.contrast.rg.toFixed(3)}  dist ${f(t0.distanceM)} -> ${f(t1.distanceM)} m`,
          );
        }
      } else {
        const lum = (m: typeof after) => m.features.filter((x) => x.concern === "wrinkle").map((x) => x.contrast.lum).sort((x, y) => x - y);
        const q = (a: number[], k: number) => a[Math.min(a.length - 1, Math.floor(k * (a.length - 1)))];
        console.log(`      lum p10/50/90 before ${[0.1, 0.5, 0.9].map((k) => q(lum(before), k).toFixed(3)).join("/")}  after ${[0.1, 0.5, 0.9].map((k) => q(lum(after), k).toFixed(3)).join("/")}`);
      }
    }
  }
}
main();
