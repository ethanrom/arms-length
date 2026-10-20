/**
 * The generated tables of docs/EVAL.md: ModelFest errors by family and for the skin-relevant shapes (read from
 * eval/results/modelfest.json), and the illustrative distances (computed by the product's own visibility code).
 *
 *   npx tsx scripts/docs/eval-tables.ts            print the markdown
 *   npx tsx scripts/docs/eval-tables.ts --write    rewrite the blocks in docs/EVAL.md
 *
 * After `npx tsx eval/run.ts --detector=standard` or any change to lib/vision, run with --write and commit.
 * lib/vision/params.doc.test.ts fails when the doc and these tables differ.
 */
import { readFileSync } from "node:fs";
import { MAX_DISTANCE_M, MIN_DISTANCE_M } from "../../lib/contracts/vision";
import { FWHM_PER_SD } from "../../lib/vision/params";
import { rawDistances, type TargetSpec } from "../../lib/vision/visibility";
import type { ModelFestReport, StimulusResult } from "../../eval/modelfest/run";
import { isMain, ROOT, syncFile, table } from "./blocks";

const signed = (x: number): string => {
  const v = Math.abs(x).toFixed(2);
  return v === "0.00" ? v : `${x >= 0 ? "+" : "-"}${v}`;
};
const rms = (xs: number[]): number => Math.sqrt(xs.reduce((a, x) => a + x * x, 0) / xs.length);
const mean = (xs: number[]): number => xs.reduce((a, x) => a + x, 0) / xs.length;

/** "26-29, 40" from sorted ids. */
function ranges(ids: number[]): string {
  const sorted = [...ids].sort((a, b) => a - b);
  const out: string[] = [];
  for (let i = 0; i < sorted.length; ) {
    let j = i;
    while (j + 1 < sorted.length && sorted[j + 1] === sorted[j] + 1) j++;
    out.push(j > i ? `${sorted[i]}-${sorted[j]}` : String(sorted[i]));
    i = j + 1;
  }
  return out.join(", ");
}

export function loadReport(): ModelFestReport {
  return JSON.parse(readFileSync(`${ROOT}eval/results/modelfest.json`, "utf8")) as ModelFestReport;
}

const FAMILIES: { families: string[]; label: string }[] = [
  { families: ["blob"], label: "Gaussian blobs (pores, small spots)" },
  { families: ["disk"], label: "Disk (a spot)" },
  { families: ["line"], label: "Thin line and dipole (wrinkles)" },
  { families: ["edge"], label: "Edge (border of a region)" },
  { families: ["gabor"], label: "Gabor patches: fixed size, fixed cycles, oriented" },
  { families: ["gabor-elongated"], label: "Elongated Gabors and baguettes" },
  { families: ["gabor-compound"], label: "Compound Gabors, collinear strings, plaids" },
  { families: ["pattern"], label: "Bessel and checkerboard patterns" },
];

function errorRow(label: string, results: StimulusResult[]): string[] {
  const errs = results.map((r) => r.errorDb);
  const worst = results.reduce((a, r) => (Math.abs(r.errorDb) > Math.abs(a.errorDb) ? r : a));
  return [
    label,
    ranges(results.map((r) => r.id)),
    String(results.length),
    rms(errs).toFixed(2),
    signed(mean(errs)),
    `${signed(worst.errorDb)} (#${worst.id})`,
  ];
}

/** RMS error by stimulus family, then the two headline rows. */
export function familyTable(report: ModelFestReport = loadReport()): string {
  const rows = FAMILIES.map((f) => errorRow(f.label, report.results.filter((r) => f.families.includes(r.family))));
  rows.push(errorRow("**All analytic stimuli**", report.results));
  rows.push(errorRow("**Skin-relevant shapes only**", report.results.filter((r) => r.skinRelevant)));
  return table(["Family", "Stimuli (#)", "n", "RMS error (dB)", "Bias (dB)", "Largest error (dB)"], rows);
}

const STANDS_FOR: Record<number, string> = {
  26: "a broad soft patch (dark circle scale)",
  27: "a soft spot",
  28: "a small spot",
  29: "a pore or the smallest spot",
  30: "the border of a region",
  31: "a fine wrinkle",
  32: "a wrinkle with a highlight beside it",
  40: "an age spot or freckle",
};

/** The eight shapes that look like skin features, one row each. */
export function skinShapesTable(report: ModelFestReport = loadReport()): string {
  const rows = report.results
    .filter((r) => r.skinRelevant)
    .map((r) => [
      String(r.id),
      r.name,
      STANDS_FOR[r.id] ?? "",
      r.observedDb.toFixed(2),
      r.predictedDb.toFixed(2),
      signed(r.errorDb),
    ]);
  return table(["#", "Stimulus", "Looks like", "Observed (dB)", "Predicted (dB)", "Error (dB)"], rows);
}

// ---------------------------------------------------------------------------------------------------------------
// Illustrative distances
// ---------------------------------------------------------------------------------------------------------------

interface Case {
  label: string;
  size: string;
  contrast: string;
  spec: Pick<TargetSpec, "shape" | "sizeMm" | "lum">;
}

const CASES: Case[] = [
  { label: "Age spot", size: "3 mm disk", contrast: "12%", spec: { shape: "disk", sizeMm: 3, lum: -0.12 } },
  { label: "Pore, sharp and strong", size: "Gaussian, sd 0.12 mm (0.28 mm wide)", contrast: "30%", spec: { shape: "gaussian", sizeMm: 0.12, lum: -0.3 } },
  {
    label: "Pore, as a phone photo usually measures it",
    size: "Gaussian, 0.3 mm wide",
    contrast: "5%",
    spec: { shape: "gaussian", sizeMm: 0.3 / FWHM_PER_SD, lum: -0.05 },
  },
  { label: "Spot", size: "4 mm disk", contrast: "10%", spec: { shape: "disk", sizeMm: 4, lum: -0.1 } },
  { label: "Freckle", size: "2 mm disk", contrast: "15%", spec: { shape: "disk", sizeMm: 2, lum: -0.15 } },
  { label: "Papule", size: "5 mm disk", contrast: "15%", spec: { shape: "disk", sizeMm: 5, lum: 0.15 } },
];

/** Distances to a readable form: cm below 1 m is avoided on purpose; the model's precision is about 2 digits. */
function metres(x: number, capped = false): string {
  if (capped && x >= MAX_DISTANCE_M) return `${MAX_DISTANCE_M}+ m`;
  if (capped && x < MIN_DISTANCE_M) return `under ${MIN_DISTANCE_M} m`;
  return x < 1 ? `${x.toFixed(2)} m` : `${x.toFixed(1)} m`;
}

export interface IllustrativeDistance {
  label: string;
  /** Average observer at 30 cd/m^2 (margin 0), metres. */
  nominalM: number;
  /** Bound at 30 cd/m^2 (margin 6 dB), metres. */
  boundM: number;
  /** Bound at the app's default indoor luminance, metres, before the contract cap. */
  boundAppM: number;
}

/** Nominal and bound distances for planted features, luminance contrast only (full precision). */
export function illustrativeDistances(): IllustrativeDistance[] {
  const lab = { luminanceCdM2: 30, acuityScale: 1, label: "custom" as const, marginDb: 6 };
  const app = { luminanceCdM2: 45, acuityScale: 1, label: "indoor" as const, marginDb: 6 };
  return CASES.map((c) => {
    const spec: TargetSpec = { id: "illustration", concern: "age_spot", rg: 0, yv: 0, chromatic: false, ...c.spec };
    const a = rawDistances(spec, lab);
    return { label: c.label, nominalM: a.nominal, boundM: a.bound, boundAppM: rawDistances(spec, app).bound };
  });
}

export function distancesTable(): string {
  const rows = illustrativeDistances().map((d, i) => [
    d.label,
    CASES[i].size,
    CASES[i].contrast,
    metres(d.nominalM),
    metres(d.boundM),
    metres(d.boundAppM, true),
  ]);
  return table(
    ["Feature", "Shape and size", "Contrast", "Nominal (average observer)", "Bound (+6 dB)", "Bound in the app (indoor, 45 cd/m^2)"],
    rows,
  );
}

/** Every generated block of docs/EVAL.md by name. */
export function allEvalBlocks(): Record<string, string> {
  const report = loadReport();
  return {
    "modelfest-families": familyTable(report),
    "modelfest-skin": skinShapesTable(report),
    "distances": distancesTable(),
  };
}

if (isMain(import.meta.url)) {
  if (process.argv.includes("--write")) {
    const changed = syncFile(`${ROOT}docs/EVAL.md`, allEvalBlocks());
    console.log(changed.length ? `docs/EVAL.md: updated ${changed.join(", ")}` : "docs/EVAL.md: already up to date");
  } else {
    console.log(Object.values(allEvalBlocks()).join("\n\n"));
  }
}
