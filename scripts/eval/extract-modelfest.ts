/**
 * Derives the 43 observer-mean ModelFest thresholds (numbers only) from the baseline data CSV and writes
 * eval/modelfest/thresholds.json. The CSV is not committed (no licence stated); get it from the JOV
 * supplement (jovi-5-9-6_s01.zip, `5.9.6/modelfestbaselinedata.csv`) or the NASA ModelFest site, then:
 *   npx tsx scripts/eval/extract-modelfest.ts path/to/modelfestbaselinedata.csv
 *
 * CSV layout: one line per observer, initials then 172 values = 43 stimuli x 4 repeats, stimulus-major.
 * Values are -log10(c) (log sensitivity, positive), so threshold dB = 20 log10 c = -20 * value.
 */
import { createHash } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { MODELFEST_STIMULI } from "../../eval/modelfest/stimuli";

const csvPath = process.argv[2] ?? process.env.MODELFEST_CSV;
if (!csvPath) {
  console.error("usage: tsx scripts/eval/extract-modelfest.ts <modelfestbaselinedata.csv>");
  process.exit(1);
}
const outPath = fileURLToPath(new URL("../../eval/modelfest/thresholds.json", import.meta.url));

const text = readFileSync(csvPath, "utf8");
const rows = text
  .split(/\r?\n/)
  .filter((l) => l.trim())
  .map((l) => l.split(",").map((x) => x.trim()));
const N_STIM = 43;
const N_REP = 4;

// Per observer, per stimulus: mean over the 4 repeats, in dB.
const perObserver = rows.map((r) => {
  const vals = r.slice(1).map(Number);
  if (vals.length !== N_STIM * N_REP || vals.some((v) => !Number.isFinite(v))) {
    throw new Error(`observer ${r[0]}: expected ${N_STIM * N_REP} numeric values, got ${vals.length}`);
  }
  return Array.from({ length: N_STIM }, (_, s) => {
    let sum = 0;
    for (let k = 0; k < N_REP; k++) sum += -20 * vals[s * N_REP + k];
    return sum / N_REP;
  });
});
const nObs = perObserver.length;

const meanDb = Array.from({ length: N_STIM }, (_, s) => perObserver.reduce((a, o) => a + o[s], 0) / nObs);
// Sample SD (n - 1) of the observer means: between-observer spread of the threshold.
const sdDb = Array.from({ length: N_STIM }, (_, s) =>
  Math.sqrt(perObserver.reduce((a, o) => a + (o[s] - meanDb[s]) ** 2, 0) / (nObs - 1)),
);

// Sanity checks against numbers printed in the paper: minimum -42.13 dB at stimulus 4; RMS0 = 3.46 dB.
const minIdx = meanDb.indexOf(Math.min(...meanDb));
const rms0 = Math.sqrt(perObserver.reduce((a, o) => a + o.reduce((b, v, s) => b + (v - meanDb[s]) ** 2, 0), 0) / (nObs * N_STIM));
if (nObs !== 16 || minIdx !== 3 || Math.abs(meanDb[3] + 42.13) > 0.01 || Math.abs(rms0 - 3.46) > 0.01) {
  throw new Error(`sanity check failed: observers ${nObs}, min at #${minIdx + 1} = ${meanDb[minIdx]}, RMS0 ${rms0}`);
}

const r2 = (x: number) => Math.round(x * 100) / 100;
const out = {
  citation: {
    dataset: "ModelFest Baseline Dataset",
    paper:
      "Watson, A.B. & Ahumada, A.J. Jr. (2005). A standard model for foveal detection of spatial contrast. Journal of Vision, 5(9):6, 717-740.",
    doi: "10.1167/5.9.6",
    consortium: "Data collected by the ModelFest consortium (16 observers, 10 laboratories). http://vision.arc.nasa.gov/modelfest/",
    note: "Only these derived per-stimulus summary numbers are included. The stimulus images and per-observer data are not redistributed.",
  },
  units: "dB = 20 log10(c); c is the peak contrast of the stimulus as defined by Eq. 1 of the paper, L = L0 (1 + c (g - 128) / 127)",
  source: {
    file: "modelfestbaselinedata.csv (values are -log10 c; dB = -20 * value)",
    sha256: createHash("sha256").update(readFileSync(csvPath)).digest("hex"),
    observers: nObs,
    repeatsPerObserver: N_REP,
    method: "thresholdDb: mean over observers of the per-observer mean of 4 repeats. sdDb: sample SD (n-1) across the observer means.",
    checks: { minThresholdDb: r2(meanDb[minIdx]), minAtStimulus: minIdx + 1, rms0Db: r2(rms0) },
  },
  stimuli: MODELFEST_STIMULI.map((s) => ({
    id: s.id,
    name: s.name,
    thresholdDb: r2(meanDb[s.id - 1]),
    sdDb: r2(sdDb[s.id - 1]),
  })),
};
writeFileSync(outPath, JSON.stringify(out, null, 2) + "\n");
console.log(`wrote ${outPath}: ${out.stimuli.length} stimuli, ${nObs} observers, RMS0 ${r2(rms0)} dB`);
