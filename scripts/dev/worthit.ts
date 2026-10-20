/**
 * Integrator check: the "Worth it?" distances per concern. For every half-strength Skin Simulation render of a fixture
 * persona (renders/sim_*.png whose request has only 0.5 strengths), measures the difference against the photo for the
 * concerns that render changed, and prints the distances, profile counts and the sentence.
 */
import fs from "node:fs";
import path from "node:path";
import { describeWorthIt } from "@/lib/copy";
import type { ConcernId } from "@/lib/contracts";
import { decodeImage, loadPersona } from "@/lib/skin/fixtures-io";
import { measureAnalysis } from "@/lib/skin/measure";
import { worthIt } from "@/lib/vision/worthIt";

const CONCERN_OF: Record<string, ConcernId> = {
  spots: "age_spot",
  pores: "pore",
  acne: "acne",
  redness: "redness",
  wrinkle: "wrinkle",
  dark_circle: "dark_circle",
  eye_bags: "eye_bag",
};

async function main() {
  const personas = process.argv.slice(2).length ? process.argv.slice(2) : ["p1a", "p2b", "p3a", "p5a"];
  for (const persona of personas) {
    const dir = path.join("fixtures/youcam", persona, "renders");
    const renders = fs.readdirSync(dir).filter((f) => /^sim_.*\.png$/.test(f)).sort();
    const p = await loadPersona(persona, "hd");
    const scale = JSON.parse(fs.readFileSync(path.join("fixtures/youcam", persona, "scale.json"), "utf8"));
    const base = measureAnalysis(p.analysis, p.masks, p.photo, scale);
    console.log(`\n${persona}`);
    for (const file of renders) {
      const request = JSON.parse(fs.readFileSync(path.join(dir, file.replace(/\.png$/, ".request.json")), "utf8")) as Record<string, number>;
      const keys = Object.keys(request);
      if (!keys.length || !keys.every((k) => request[k] === 0.5 && CONCERN_OF[k])) continue;
      const concerns = keys.map((k) => CONCERN_OF[k]);
      const sim = await decodeImage(path.join(dir, file));
      console.log(` ${file}`);
      for (const w of worthIt(base, { analysis: p.analysis, masks: p.masks }, p.photo, sim, concerns)) {
        const at = [0.6, 1, 1.5, 2.5, 4].map((d) => w.differenceProfile.find((x) => x.distanceM === d)?.count ?? 0);
        console.log(
          `  ${w.concern.padEnd(12)} n=${String(w.targetCount).padStart(4)} max=${w.differenceMaxDistanceM.toFixed(2).padStart(5)} median=${w.differenceMedianDistanceM.toFixed(2).padStart(5)}  count@0.6/1/1.5/2.5/4: ${at.join("/")}`,
        );
        const d = describeWorthIt(w);
        console.log(`     ${d.headline}\n     ${d.detail}`);
      }
    }
  }
}
main();
