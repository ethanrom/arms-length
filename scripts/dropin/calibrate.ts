// Prints the numbers behind lib/scale/fromMasks.ts: the eye-region separation / IPD ratios, the mark extent in mm,
// and how well the estimator agrees with the iris-ruler scale. Run: npx tsx scripts/dropin/calibrate.ts
// HD sets (p2b, p3a) calibrate; the SD set of p2b is held out. Needs only the recorded fixtures (no network).
import fs from "node:fs";
import { eyeRegionSeparationPx, estimateScaleFromMasks, SEPARATION_PER_IPD } from "../../lib/scale/fromMasks";
import { loadPersona } from "../../lib/skin/fixtures-io";

const SETS = [
  { persona: "p2b", quality: "hd" },
  { persona: "p3a", quality: "hd" },
  { persona: "p2b", quality: "sd" },
] as const;

const pct = (x: number) => `${(100 * x).toFixed(1)}%`;

async function main() {
  const rows = [];
  for (const { persona, quality } of SETS) {
    const scale = JSON.parse(fs.readFileSync(`fixtures/youcam/${persona}/scale.json`, "utf8")) as {
      mmPerPx: number;
      interpupillaryMm: number;
    };
    const loaded = await loadPersona(persona, quality);
    const mask = (concern: string) => loaded.masks.get(loaded.analysis.results.find((r) => r.concern === concern)!.maskRef!)!;
    const ipdPx = scale.interpupillaryMm / scale.mmPerPx; // pupil to pupil, from the iris landmarks
    const ratio = {
      dark_circle: eyeRegionSeparationPx(mask("dark_circle"))! / ipdPx,
      eye_bag: eyeRegionSeparationPx(mask("eye_bag"))! / ipdPx,
    };
    const est = estimateScaleFromMasks(loaded.analysis, loaded.masks);

    // The same estimator with the eye masks removed: the face-extent fallback.
    const noEyes = new Map(loaded.masks);
    for (const concern of ["dark_circle", "eye_bag"]) noEyes.delete(loaded.analysis.results.find((r) => r.concern === concern)!.maskRef!);
    const fallback = estimateScaleFromMasks(loaded.analysis, noEyes);
    const none = estimateScaleFromMasks(loaded.analysis, new Map());

    rows.push({ persona, quality, ratio, irisMmPerPx: scale.mmPerPx, est, fallback, none, ipdMm: scale.interpupillaryMm });
  }

  console.log("separation / IPD (calibration constants in fromMasks.ts):", SEPARATION_PER_IPD);
  for (const r of rows) {
    console.log(`${r.persona}-${r.quality}: ratio dark_circle ${r.ratio.dark_circle.toFixed(3)}, eye_bag ${r.ratio.eye_bag.toFixed(3)} (measured IPD ${r.ipdMm} mm)`);
  }
  const hd = rows.filter((r) => r.quality === "hd");
  for (const key of ["dark_circle", "eye_bag"] as const) {
    const mean = hd.reduce((s, r) => s + r.ratio[key], 0) / hd.length;
    console.log(`mean HD ${key}: ${mean.toFixed(4)}`);
  }

  console.log("\nagreement with the iris scale (estimate / iris - 1):");
  for (const r of rows) {
    const rel = (e: { mmPerPx: number }) => pct(e.mmPerPx / r.irisMmPerPx - 1);
    console.log(
      `${r.persona}-${r.quality}: eye regions ${rel(r.est)} (${r.est.method}, relSd ${pct(r.est.relSd)}) | ` +
        `face extent ${rel(r.fallback)} (${r.fallback.method}, relSd ${pct(r.fallback.relSd)}) | frame prior ${rel(r.none)} (relSd ${pct(r.none.relSd)})`,
    );
  }

  // Leave one HD face out: calibrate the ratio on the other, predict this one.
  console.log("\nleave-one-face-out (HD, ratio from the other face, IPD prior 63 mm):");
  for (const held of hd) {
    const other = hd.find((r) => r !== held)!;
    const k = (other.ratio.dark_circle + other.ratio.eye_bag) / 2;
    const k2 = (held.ratio.dark_circle + held.ratio.eye_bag) / 2;
    // mm/px error from the ratio alone = k2/k - 1 (the IPD prior error is shared by every method)
    console.log(`${held.persona}: ratio error ${pct(k2 / k - 1)}`);
  }
}

void main();
