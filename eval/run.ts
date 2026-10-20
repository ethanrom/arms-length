/**
 * `npm run eval`: ModelFest validation. Writes eval/results/modelfest.json and eval/results/modelfest.svg.
 *   npm run eval                          reference stand-in detector (works without lib/vision)
 *   npm run eval -- --detector=standard   the product detector, imported from @/lib/vision/standard
 */
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import type { Detector } from "@/lib/contracts";
import { renderModelFestSvg } from "./chart";
import { PUBLISHED_REFERENCE, runModelFest } from "./modelfest/run";
import { referenceDetector } from "./reference-detector";

const isDetector = (x: unknown): x is Detector =>
  typeof x === "object" && x !== null && typeof (x as Detector).response === "function";

/** Finds a Detector in the module under a few likely names; null if the module file does not exist yet. */
async function loadStandard(): Promise<Detector | null> {
  const root = fileURLToPath(new URL("../", import.meta.url));
  if (!["ts", "tsx", "mts", "js", "mjs"].some((ext) => existsSync(`${root}lib/vision/standard.${ext}`))) return null;
  const spec = "@/lib/vision/standard"; // variable specifier: typecheck must not require the file to exist
  const mod = (await import(spec)) as Record<string, unknown>;
  for (const name of ["standardDetector", "detector", "default"]) {
    if (isDetector(mod[name])) return mod[name];
  }
  for (const name of ["createStandardDetector", "makeStandardDetector", "standardDetector", "default"]) {
    const factory = mod[name];
    if (typeof factory === "function") {
      const made: unknown = (factory as () => unknown)();
      if (isDetector(made)) return made;
    }
  }
  const any = Object.values(mod).find(isDetector);
  if (any) return any;
  throw new Error("@/lib/vision/standard has no export that implements Detector (needs a `response` method)");
}

async function main() {
  const arg = process.argv.find((a) => a.startsWith("--detector="))?.split("=")[1] ?? "reference";
  let detector: Detector;
  if (arg === "reference") detector = referenceDetector;
  else if (arg === "standard") {
    const d = await loadStandard();
    if (!d) {
      console.error("--detector=standard: @/lib/vision/standard does not exist yet. Run without the flag for the reference detector.");
      process.exit(1);
    }
    detector = d;
  } else {
    console.error(`unknown detector "${arg}" (use reference or standard)`);
    process.exit(1);
  }

  const t0 = Date.now();
  const report = runModelFest(detector);
  const label = arg === "reference" ? "reference stand-in" : "standard";

  console.log(`ModelFest, ${label} detector (${((Date.now() - t0) / 1000).toFixed(1)} s)`);
  console.log("  id  observed  predicted  error  name");
  for (const r of report.results) {
    console.log(
      `  ${String(r.id).padStart(2)}  ${r.observedDb.toFixed(2).padStart(8)}  ${r.predictedDb.toFixed(2).padStart(9)}  ${((r.errorDb >= 0 ? "+" : "-") + Math.abs(r.errorDb).toFixed(2)).padStart(6)}${r.skinRelevant ? "  * " : "    "}${r.name}`,
    );
  }
  console.log(`  RMS all (${report.nAll}): ${report.rmsAllDb.toFixed(2)} dB   RMS skin-relevant (${report.nSkin}, *): ${report.rmsSkinDb.toFixed(2)} dB`);
  console.log(`  Standard A in the paper: ${PUBLISHED_REFERENCE.standardA.rmsAll43Db} dB over all 43`);

  const dir = fileURLToPath(new URL("./results/", import.meta.url));
  mkdirSync(dir, { recursive: true });
  const json = {
    detector: arg,
    detectorNote:
      arg === "reference"
        ? "Reference stand-in (difference-of-Gaussians CSF), tuned on these same thresholds (in-sample). Not the product model."
        : "Product detector from @/lib/vision/standard.",
    ...report,
    published: PUBLISHED_REFERENCE,
  };
  writeFileSync(`${dir}modelfest.json`, JSON.stringify(json, null, 2) + "\n");
  writeFileSync(`${dir}modelfest.svg`, renderModelFestSvg(report, label));
  console.log(`  wrote ${dir}modelfest.json and modelfest.svg`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
