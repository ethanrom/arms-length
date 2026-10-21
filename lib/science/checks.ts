/**
 * "How we checked it": one row per check, with the result, where it comes from and the command that reproduces it.
 * Numbers are read from the committed result files or computed here from lib/vision; the few that live only in a test
 * file are copied from that test and the test names its tolerance. Server side only (it imports result files).
 */
import summary from "@/eval/llm-baseline/results/summary.json";
import { STANDARD_B } from "@/lib/vision/params";
import { blobThresholdLookup } from "@/lib/vision/tables";
import { csfPeak } from "./csf";
import { summarize } from "./modelfest";
import { codeUrl } from "./refs";
import { diskReach, viewingAt } from "./visibility";

export interface CheckRow {
  id: string;
  check: string;
  result: string;
  sources: { label: string; href?: string }[];
  /** Reproduction command, or null where the check needs data we do not redistribute. */
  command: string | null;
  /** Reference keys (lib/science/refs.ts) to cite beside the check. */
  cites: string[];
}

const db = (x: number) => 20 * Math.log10(x);

/**
 * The independent numpy predictions of Standard A for ModelFest #26-29 and #40, in dB. Copied from
 * lib/vision/standard.test.ts, which requires the code to agree within 0.1 dB.
 */
const FIVE: { id: string; shape: "gaussian" | "disk"; sizeDeg: number; referenceDb: number }[] = [
  { id: "#29", shape: "gaussian", sizeDeg: 1.05 / 60, referenceDb: -16.302 },
  { id: "#28", shape: "gaussian", sizeDeg: 2.106 / 60, referenceDb: -24.146 },
  { id: "#27", shape: "gaussian", sizeDeg: 8.43 / 60, referenceDb: -30.63 },
  { id: "#26", shape: "gaussian", sizeDeg: 0.5, referenceDb: -32.865 },
  { id: "#40", shape: "disk", sizeDeg: 0.25, referenceDb: -33.007 },
];

/** Largest difference (dB) between the tabulated detector and the independent reference over the five stimuli. */
export function fiveStimuliWorstDb(): number {
  return Math.max(...FIVE.map((s) => Math.abs(db(blobThresholdLookup(s.shape, s.sizeDeg)) - s.referenceDb)));
}

export function buildChecks(): CheckRow[] {
  const mf = summarize();
  const peakA = csfPeak();
  const peakB = csfPeak(STANDARD_B);
  const worst = fiveStimuliWorstDb();
  const doubling = diskReach(2, 12, viewingAt(45)).typicalM / diskReach(1, 12, viewingAt(45)).typicalM;
  const b = summary.testB.aggregate;
  const det = summary.testA.oursDeterminism;
  const cvs = summary.testB.patches.map((p) => p.llm.cv);
  const ratios = summary.testB.patches.map((p) => p.llm.maxOverMin);
  const cvLo = Math.min(...cvs);
  const cvHi = Math.max(...cvs);
  const ratioLo = Math.min(...ratios);
  const ratioHi = Math.max(...ratios);
  const doublings = summary.testB.scaling.flatMap((x) => [x.llm2over1, x.llm4over2]);
  const scaleLo = Math.min(...doublings);
  const scaleHi = Math.max(...doublings);

  return [
    {
      id: "replication",
      check: "Paper replication",
      result:
        "Our independent re-implementation (numpy, run on the paper's supplementary stimulus images) gets 1.0328 dB RMS for Standard A against the paper's 1.0329, and 1.1215 dB for Standard B against 1.1216. It also reproduces the observers' summary numbers (minimum threshold −42.13 dB, RMS0 3.46 dB).",
      sources: [{ label: "Watson & Ahumada 2005, Table 5" }, { label: "our re-implementation: research notes, not in the repository" }],
      command: null,
      cites: ["watson2005"],
    },
    {
      id: "csf-peak",
      check: "CSF peak",
      result: `Standard A peaks at ${peakA.gain.toFixed(2)} at ${peakA.f.toFixed(2)} cycles/degree, Standard B at ${peakB.gain.toFixed(2)} at ${peakB.f.toFixed(2)}, as published (computed from csf() when this page was built).`,
      sources: [{ label: "lib/vision/standard.test.ts", href: codeUrl("lib/vision/standard.test.ts") }],
      command: "npx vitest run lib/vision/standard.test.ts",
      cites: ["watson2005"],
    },
    {
      id: "five-stimuli",
      check: "Five analytic ModelFest stimuli (#26–29, #40)",
      result: `Within ${(Math.ceil(worst * 100) / 100).toFixed(2)} dB of the independent reference predictions through the lookup tables the app uses (largest difference ${worst.toFixed(3)} dB). The test allows 0.1 dB, both computed directly and tabulated.`,
      sources: [{ label: "lib/vision/standard.test.ts", href: codeUrl("lib/vision/standard.test.ts") }],
      command: "npx vitest run lib/vision/standard.test.ts",
      cites: ["watson2005", "modelfest"],
    },
    {
      id: "modelfest",
      check: "The production detector on ModelFest",
      result: `${mf.rmsAllDb.toFixed(2)} dB RMS over ${mf.nAll} analytic stimuli, ${mf.rmsSkinDb.toFixed(2)} dB over the ${mf.nSkin} skin-like shapes (blobs, disk, line, dipole, edge). The paper reports ${mf.paperRms43Db.toFixed(2)} dB over all ${mf.paperN}, which include a noise pattern and a natural scene we do not generate. Nothing was tuned on this data.`,
      sources: [{ label: "eval/results/modelfest.json", href: codeUrl("eval/results/modelfest.json") }],
      command: "npx tsx eval/run.ts --detector=standard",
      cites: ["watson2005", "modelfest"],
    },
    {
      id: "castle",
      check: "castleCSF port",
      result:
        "Rows of castleCSF's own data files, run through our port, equal a reference port to 4.2e-7 in log10 sensitivity at the worst of five (the test allows 1e-4). They lie within 3.76 dB (Gabors) and 2.93 dB (discs) of the measurements, as castleCSF itself does (the test allows 4 and 3.5 dB).",
      sources: [
        { label: "lib/vision/castle.test.ts", href: codeUrl("lib/vision/castle.test.ts") },
        { label: "docs/NUMBERS.md section 1.1", href: codeUrl("docs/NUMBERS.md") },
      ],
      command: "npx vitest run lib/vision/castle.test.ts",
      cites: ["castle2024"],
    },
    {
      id: "angle-law",
      check: "The angle law",
      result: `A distance scales exactly with size: a 2 mm spot reaches ×${doubling.toFixed(4)} as far as a 1 mm one at the same contrast (computed from rawDistances when this page was built). The bound is never below the nominal distance, and neither falls as size, contrast or margin grow.`,
      sources: [{ label: "lib/vision/visibility.test.ts", href: codeUrl("lib/vision/visibility.test.ts") }],
      command: "npx vitest run lib/vision/visibility.test.ts",
      cites: [],
    },
    {
      id: "oracles",
      check: "Planted-feature oracles",
      result:
        "Draw a spot, line, pore, breakout, dark circle or redness zone of known size and contrast, run the real measuring code, and check what comes back. A 4.0 mm spot at −0.25 contrast returns 4.02 mm and −0.250 (the test allows 0.2 mm and 0.03); a 1.0 mm pore returns 0.998 mm and −0.402 (0.3 mm and 0.05); a wrinkle's length must come back at 94–103% of planted, its width within 0.15 mm and its contrast within 0.05; red-green and luminance contrast of a breakout match the colour oracle within 0.03 and 0.04.",
      sources: [
        { label: "lib/skin/measure.test.ts", href: codeUrl("lib/skin/measure.test.ts") },
        { label: "docs/EVAL.md section 2", href: codeUrl("docs/EVAL.md") },
      ],
      command: "npx vitest run lib/skin/measure.test.ts",
      cites: ["srgb"],
    },
    {
      id: "scale",
      check: "Iris ruler against scale from masks",
      result:
        "A second, independent ruler (the spacing of the under-eye regions in the YouCam masks) lands within 0.1% to 4.8% of the iris ruler on the four recorded faces; the test requires within 10% on three sets, one held out when the ratios were calibrated.",
      sources: [
        { label: "lib/scale/fromMasks.test.ts", href: codeUrl("lib/scale/fromMasks.test.ts") },
        { label: "docs/NUMBERS.md section 2", href: codeUrl("docs/NUMBERS.md") },
      ],
      command: "npx vitest run lib/scale/fromMasks.test.ts",
      cites: ["ruefer2005"],
    },
    {
      id: "determinism",
      check: "Determinism",
      result: `The same input gives the same output, byte for byte: the model's answers over the head-to-head's inputs, run twice, are ${det.rerunIdentical ? "identical" : "NOT identical"} (sha256 ${det.sha256.slice(0, 12)}…). Nothing random and no language model is in the loop.`,
      sources: [{ label: "eval/llm-baseline/results/summary.json", href: codeUrl("eval/llm-baseline/results/summary.json") }],
      command: "npx tsx eval/llm-baseline/run.ts --offline",
      cites: [],
    },
    {
      id: "ai",
      check: "The AI head-to-head",
      result: `${summary.meta.calls} real calls to a frontier vision model. Told a spot's size and contrast, its median answer was a geometric-mean ×${b.geometricMeanFactorOfMedianVsNominal.toFixed(2)} from ours, and ${b.answersInsideModelRange} of ${b.answersTotal} answers fell inside our model's range. Five identical asks about one spot varied with a coefficient of variation of ${Math.round(cvLo * 100)}% to ${Math.round(cvHi * 100)}% (the highest answer was ×${ratioLo.toFixed(1)} to ×${ratioHi.toFixed(1)} the lowest); doubling a spot should double the distance, and its medians rose ×${scaleLo.toFixed(1)} to ×${scaleHi.toFixed(1)} where ours rises exactly ×2. On the faces it gave the same pore distance on all four.`,
      sources: [
        { label: "eval/llm-baseline", href: codeUrl("eval/llm-baseline") },
        { label: "docs/NUMBERS.md section 4", href: codeUrl("docs/NUMBERS.md") },
      ],
      command: "npx tsx eval/llm-baseline/run.ts --offline",
      cites: [],
    },
  ];
}
