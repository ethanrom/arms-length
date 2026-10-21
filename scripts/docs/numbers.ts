/**
 * The numbers ledger: docs/NUMBERS.md, one public file with every number the README, the video and the Devpost text quote,
 * each with its value, where it comes from and the command that reproduces it. The file is generated from the code,
 * the recorded fixtures and the committed results; nothing in it is typed by hand. A number that cannot be computed is
 * marked "manual" with the place it comes from.
 *
 *   npx tsx scripts/docs/numbers.ts                       print the markdown (slow: about a minute)
 *   npx tsx scripts/docs/numbers.ts --write               rewrite docs/NUMBERS.md
 *   npx tsx scripts/docs/numbers.ts --check               exit 1 when docs/NUMBERS.md differs from a fresh measurement
 *   npx tsx scripts/docs/numbers.ts --section ai,youcam   print only those sections (ids: see SECTIONS below)
 *   npx tsx scripts/docs/numbers.ts --fast                skip the slow sections
 *
 * Three tiers decide what the drift test (lib/vision/numbers.doc.test.ts) recomputes inside `npm test`:
 *   fast    ModelFest, iris, the per-face visibility shares, the AI comparison, YouCam constants, latency, vision
 *           constants, line counts, the axe scan of the specs. Recomputed on every test run (a few seconds).
 *   slow    "Worth it?" and least-coverage tables (about 40 s) and the test counts (a full vitest run, a Playwright
 *           listing). Not recomputed in `npm test`. The file records a fingerprint of everything they depend on (all
 *           of lib/, the eval code, the tests and specs, the recorded fixtures, this script) and a digest of the slow
 *           tables themselves; the drift test fails when either changed. `--check` recomputes them in full.
 *   ledger  Units spent and left, parsed from internal/LEDGER.md. That file is gitignored, so the check is skipped
 *           where it does not exist, and `--write` keeps the committed block when it cannot find the ledger.
 *
 * No network, no YouCam units. Run from the repository root (the fixtures are read relative to it).
 */
import { spawnSync, execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import fs from "node:fs";
import { createRequire } from "node:module";
import os from "node:os";
import path from "node:path";
import { HD_ACTIONS, SD_ACTIONS, type ConcernId, type Measurements, type ScaleEstimate } from "../../lib/contracts";
import { DEFAULT_VIEWING, MAX_DISTANCE_M, MIN_DISTANCE_M, PROFILE_DISTANCES_M } from "../../lib/contracts/vision";
import { concernTitle } from "../../lib/copy/concerns";
import { COVERAGE_GRID, KNEE_SHARE, MET_FRACTION, planCoverage } from "../../lib/coverage/plan";
import { replayMakeupRender } from "../../lib/coverage/replayRender";
import { COVERAGE_CONCERNS, COVERAGE_TARGET_M, SIMULATION_GROUPS } from "../../lib/integration/types";
import { IRIS_DIAMETER_MM, IRIS_DIAMETER_SD_MM, IRIS_POPULATION_REL_SD } from "../../lib/scale/iris";
import { IPD_MM, IPD_SD_MM, estimateScaleFromMasks } from "../../lib/scale/fromMasks";
import { decodeImage, loadPersona, type LoadedPersona } from "../../lib/skin/fixtures-io";
import { measureAnalysis } from "../../lib/skin/measure";
import { fixturePath } from "../../lib/youcam/fixtures";
import { MAKEUP_UNITS, analysisUnits, simulationUnits } from "../../lib/youcam/costs";
import { DEFAULT_MARGIN_DB, MODELFEST_LUMINANCE } from "../../lib/vision/params";
import { buildVisibilityReport, type VisibilityReportExt } from "../../lib/vision/report";
import { rawDistances, type TargetSpec } from "../../lib/vision/visibility";
import { worthIt, type WorthIt } from "../../lib/vision/worthIt";
import { illustrativeDistances, loadReport } from "./eval-tables";
import { extractBlock, isMain, ROOT, table } from "./blocks";

export const DOC_PATH = `${ROOT}docs/NUMBERS.md`;

// ---------------------------------------------------------------------------------------------------------------
// Small formatting helpers
// ---------------------------------------------------------------------------------------------------------------

const unix = (s: string): string => s.replace(/\r\n/g, "\n");
const readText = (rel: string): string => unix(fs.readFileSync(`${ROOT}${rel}`, "utf8"));
const readJson = <T>(rel: string): T => JSON.parse(readText(rel)) as T;

const pct = (x: number): string => `${Math.round(100 * x)}%`;
const int = (n: number): string => n.toLocaleString("en-US");
const mm4 = (x: number): string => x.toFixed(4);
/** Distances for reading: two decimals under 1 m, one above, "10+" at the contract cap. */
const metres = (x: number): string => (x >= MAX_DISTANCE_M ? `${MAX_DISTANCE_M}+` : x < 1 ? x.toFixed(2) : x.toFixed(1));
/** "0.8", "4.5", "12": up to 2 significant digits, as in docs/EVAL.md. */
const sig2 = (x: number): string => String(Number(x.toPrecision(2)));
const rangeOf = (xs: number[]): [number, number] => [Math.min(...xs), Math.max(...xs)];
const median = (xs: number[]): number => {
  const s = [...xs].sort((a, b) => a - b);
  const h = s.length >> 1;
  return s.length % 2 ? s[h] : (s[h - 1] + s[h]) / 2;
};

interface Row {
  what: string;
  value: string;
  source: string;
  reproduce: string;
}
const quantityTable = (rows: Row[]): string =>
  table(["Number", "Value", "Source", "Reproduce"], rows.map((r) => [r.what, r.value, r.source, r.reproduce]));

const sectionCmd = (id: string): string => `\`npx tsx scripts/docs/numbers.ts --section ${id}\``;

/** The short names of facts the headline section picks up. Filled by the fast sections as they are built. */
type Facts = Record<string, string>;

// ---------------------------------------------------------------------------------------------------------------
// The four demo faces: measured once per process and shared by every section that needs them
// ---------------------------------------------------------------------------------------------------------------

export const PERSONAS = ["p1a", "p2b", "p3a", "p5a"] as const;
type Persona = (typeof PERSONAS)[number];

/** The visible-mark concerns in the order the app lists them. */
const CONCERN_ORDER: ConcernId[] = ["pore", "age_spot", "acne", "wrinkle", "dark_circle", "eye_bag", "redness"];

interface ScaleFile {
  mmPerPx: number;
  relSd: number;
  irisPx: number;
  frame: { width: number; height: number };
}

interface PersonaRun {
  persona: Persona;
  loaded: LoadedPersona;
  scaleFile: ScaleFile;
  scale: ScaleEstimate;
  base: Measurements;
  report: VisibilityReportExt;
}

const personaCache = new Map<Persona, Promise<PersonaRun>>();

/** The same path as scripts/dev/pipeline.ts: loadPersona, scale.json, measureAnalysis, buildVisibilityReport at DEFAULT_VIEWING. */
export function personaRun(persona: Persona): Promise<PersonaRun> {
  let run = personaCache.get(persona);
  if (!run) {
    run = (async () => {
      const loaded = await loadPersona(persona, "hd");
      const scaleFile = JSON.parse(fs.readFileSync(fixturePath(persona, "scale.json"), "utf8")) as ScaleFile;
      const scale: ScaleEstimate = { mmPerPx: scaleFile.mmPerPx, relSd: scaleFile.relSd, source: "iris", irisPx: scaleFile.irisPx };
      const base = measureAnalysis(loaded.analysis, loaded.masks, loaded.photo, scale);
      return { persona, loaded, scaleFile, scale, base, report: buildVisibilityReport(base, DEFAULT_VIEWING) };
    })();
    personaCache.set(persona, run);
  }
  return run;
}

// ---------------------------------------------------------------------------------------------------------------
// 1. ModelFest
// ---------------------------------------------------------------------------------------------------------------

interface ThresholdsFile {
  source: { observers: number; repeatsPerObserver: number };
  stimuli: unknown[];
}

function modelfestSection(facts: Facts): string {
  const report = loadReport();
  const thresholds = readJson<ThresholdsFile>("eval/modelfest/thresholds.json");
  const published = (report as unknown as { published: { standardA: { rmsAll43Db: number } } }).published.standardA;
  const skinIds = report.results.filter((r) => r.skinRelevant).map((r) => r.id);
  const worst = report.results.reduce((a, r) => (Math.abs(r.errorDb) > Math.abs(a.errorDb) ? r : a));
  const all = report.rmsAllDb.toFixed(2);
  const skin = report.rmsSkinDb.toFixed(2);
  const paper = published.rmsAll43Db.toFixed(2);
  const excluded = report.excluded.length;
  const total = thresholds.stimuli.length;
  if (report.nAll + excluded !== total) throw new Error("ModelFest: scored plus excluded stimuli do not add up to the dataset");

  facts["modelfest.rms41"] = `${all} dB`;
  facts["modelfest.rmsSkin"] = `${skin} dB`;
  facts["modelfest.paper43"] = `${paper} dB`;
  facts["modelfest.observers"] = String(thresholds.source.observers);
  facts["modelfest.n"] = String(report.nAll);

  const file = "`eval/results/modelfest.json`";
  const regen = "`npx tsx eval/run.ts --detector=standard` (rewrites that file)";
  return [
    `Our detector is Watson and Ahumada's Standard A (2005), run on the ModelFest stimuli at ${MODELFEST_LUMINANCE} cd/m^2 with no safety margin.`,
    "",
    quantityTable([
      { what: "Analytic stimuli scored", value: `${report.nAll} of ${total}`, source: `${file} \`nAll\`; \`eval/modelfest/thresholds.json\` \`stimuli\``, reproduce: regen },
      { what: "Stimuli left out", value: `${excluded} (#${report.excluded.map((e) => e.id).join(", #")}: random or photographic pixel content)`, source: `${file} \`excluded\``, reproduce: regen },
      { what: "RMS error, all scored stimuli", value: `${all} dB`, source: `${file} \`rmsAllDb\``, reproduce: regen },
      { what: "RMS error, the skin-relevant shapes", value: `${skin} dB over ${report.nSkin} shapes (#${skinIds.join(", #")})`, source: `${file} \`rmsSkinDb\`, \`nSkin\``, reproduce: regen },
      { what: "Largest single error", value: `${Math.abs(worst.errorDb).toFixed(2)} dB (#${worst.id}, ${worst.name})`, source: `${file} \`results[].errorDb\``, reproduce: regen },
      { what: "The paper's own RMS, Standard A, all 43 stimuli", value: `${paper} dB`, source: `${file} \`published.standardA.rmsAll43Db\` (Watson and Ahumada 2005, Table 5)`, reproduce: "manual: Table 5 of the paper (doi 10.1167/5.9.6)" },
      { what: "Stimuli in the ModelFest set", value: String(total), source: "`eval/modelfest/thresholds.json` `stimuli`", reproduce: "`grep -c '\"thresholdDb\"' eval/modelfest/thresholds.json`" },
      { what: "Human observers behind the thresholds", value: `${thresholds.source.observers} (${thresholds.source.repeatsPerObserver} repeats each)`, source: "`eval/modelfest/thresholds.json` `source.observers`, `source.repeatsPerObserver`", reproduce: "`grep -n '\"observers\"' eval/modelfest/thresholds.json`" },
    ]),
  ].join("\n");
}

// ---------------------------------------------------------------------------------------------------------------
// 2. The iris ruler
// ---------------------------------------------------------------------------------------------------------------

async function irisSection(facts: Facts): Promise<string> {
  const runs = await Promise.all(PERSONAS.map(personaRun));
  const sd = await loadPersona("p2b", "sd");
  const rows: string[][] = [];
  const diffs: { label: string; ratio: number }[] = [];
  for (const run of runs) {
    const est = estimateScaleFromMasks(run.loaded.analysis, run.loaded.masks);
    const ratio = est.mmPerPx / run.scaleFile.mmPerPx - 1;
    diffs.push({ label: run.persona, ratio });
    rows.push([
      run.persona,
      `${run.scaleFile.frame.width} x ${run.scaleFile.frame.height}`,
      run.scaleFile.irisPx.toFixed(1),
      mm4(run.scaleFile.mmPerPx),
      `${(100 * run.scaleFile.relSd).toFixed(1)}%`,
      `${mm4(est.mmPerPx)} (${est.method})`,
      `${ratio >= 0 ? "+" : "-"}${(100 * Math.abs(ratio)).toFixed(1)}%`,
    ]);
  }
  const sdEst = estimateScaleFromMasks(sd.analysis, sd.masks);
  const p2b = runs.find((r) => r.persona === "p2b")!;
  const sdRatio = sdEst.mmPerPx / p2b.scaleFile.mmPerPx - 1;
  rows.push(["p2b (SD masks)", `${p2b.scaleFile.frame.width} x ${p2b.scaleFile.frame.height}`, "-", "-", "-", `${mm4(sdEst.mmPerPx)} (${sdEst.method})`, `${sdRatio >= 0 ? "+" : "-"}${(100 * Math.abs(sdRatio)).toFixed(1)}%`]);
  diffs.push({ label: "p2b SD", ratio: sdRatio });

  const hdAbs = rangeOf(diffs.filter((d) => d.label !== "p2b SD").map((d) => Math.abs(d.ratio)));
  const allAbs = rangeOf(diffs.map((d) => Math.abs(d.ratio)));
  const mmRange = rangeOf(runs.map((r) => r.scaleFile.mmPerPx));
  const popRel = (100 * IRIS_POPULATION_REL_SD).toFixed(1);
  const hd = `${(100 * hdAbs[0]).toFixed(1)}% to ${(100 * hdAbs[1]).toFixed(1)}%`;

  facts["iris.mean"] = `${IRIS_DIAMETER_MM} mm`;
  facts["iris.sd"] = `${IRIS_DIAMETER_SD_MM} mm`;
  facts["iris.rel"] = `${popRel}%`;
  facts["iris.mmRange"] = `${mm4(mmRange[0])} to ${mm4(mmRange[1])}`;
  facts["iris.maskAgreement"] = hd;
  facts["iris.maskAgreementMax"] = `${(100 * hdAbs[1]).toFixed(1)}%`;

  const scaleSrc = "`fixtures/youcam/<face>/scale.json` (made by `scripts/scale/fixtures.ts`)";
  const maskSrc = "`estimateScaleFromMasks` in `lib/scale/fromMasks.ts`, run on the recorded masks";
  return [
    quantityTable([
      { what: "Iris diameter, population mean", value: `${IRIS_DIAMETER_MM} mm`, source: "`IRIS_DIAMETER_MM` in `lib/scale/iris.ts` (Rufer, Schroder and Erb 2005, Cornea 24(3):259-261)", reproduce: "`grep -n IRIS_DIAMETER lib/scale/iris.ts`" },
      { what: "Iris diameter, population SD", value: `${IRIS_DIAMETER_SD_MM} mm (${popRel}% of the mean)`, source: "`IRIS_DIAMETER_SD_MM`, `IRIS_POPULATION_REL_SD` in `lib/scale/iris.ts`", reproduce: "`npx vitest run lib/scale/scale.test.ts`" },
      { what: "mm per pixel, the four faces", value: `${mm4(mmRange[0])} to ${mm4(mmRange[1])}`, source: scaleSrc, reproduce: "`npx tsx scripts/scale/fixtures.ts p1a` (needs headless Chrome)" },
      { what: "Mask-based scale vs the iris scale, the four faces (HD masks)", value: `within ${hd} (\`lib/scale/fromMasks.test.ts\` asserts under 10%)`, source: maskSrc, reproduce: `${sectionCmd("iris")}; \`npx vitest run lib/scale/fromMasks.test.ts\`` },
      { what: "Mask-based scale vs the iris scale, including p2b on SD masks", value: `within ${(100 * allAbs[0]).toFixed(1)}% to ${(100 * allAbs[1]).toFixed(1)}%`, source: maskSrc, reproduce: sectionCmd("iris") },
      { what: "Interpupillary distance assumed for the mask-based scale", value: `${IPD_MM} mm, SD ${IPD_SD_MM} mm`, source: "`IPD_MM`, `IPD_SD_MM` in `lib/scale/fromMasks.ts`", reproduce: "`grep -n IPD_ lib/scale/fromMasks.ts`" },
    ]),
    "",
    "Per face. Positive means the mask-based scale gives more millimetres per pixel than the iris.",
    "",
    table(["Face", "Frame (px)", "Iris (px)", "mm per px (iris)", "Scale uncertainty (1 SD)", "mm per px (masks)", "Masks vs iris"], rows),
    "",
    `Source: ${scaleSrc} for the iris columns; ${maskSrc} for the mask columns. Reproduce: ${sectionCmd("iris")}.`,
  ].join("\n");
}

// ---------------------------------------------------------------------------------------------------------------
// 3. The four demo faces
// ---------------------------------------------------------------------------------------------------------------

const PERSONA_SOURCE =
  "`lib/skin` `measureAnalysis` then `lib/vision` `buildVisibilityReport` at `DEFAULT_VIEWING` (45 cd/m^2, 20/20, margin 6 dB), with `scale.json`; the same path as `scripts/dev/pipeline.ts`";

async function foundSection(): Promise<string> {
  const runs = await Promise.all(PERSONAS.map(personaRun));
  const rows = runs.map((run) => {
    const count = (c: ConcernId): string => String(run.report.concerns.find((x) => x.concern === c)?.targetCount ?? 0);
    return [
      run.persona,
      String(run.base.features.length),
      String(run.base.regions.length),
      ...CONCERN_ORDER.map(count),
    ];
  });
  return [
    "Targets are what the model judges one by one: the measured marks (pores, dark spots, breakouts, fine lines) and the larger regions (under-eye shadows, under-eye puffiness, redness zones). Markers that sit inside a dark spot are counted once, as the spot.",
    "",
    table(["Face", "Marks measured", "Regions measured", ...CONCERN_ORDER.map(concernTitle)], rows),
    "",
    `Source: ${PERSONA_SOURCE}. Reproduce: \`npx tsx scripts/dev/pipeline.ts p1a p2b p3a p5a\` or ${sectionCmd("persona-found")}.`,
  ].join("\n");
}

async function sightSection(facts: Facts): Promise<string> {
  const runs = await Promise.all(PERSONAS.map(personaRun));
  const AT = [1, 1.5] as const;
  const outOf = (profile: { distanceM: number; count: number }[] | undefined, d: number, total: number): number => {
    const entry = profile?.find((p) => p.distanceM === d);
    if (!entry) throw new Error(`no profile entry at ${d} m (PROFILE_DISTANCES_M changed?)`);
    return total === 0 ? 0 : 1 - entry.count / total;
  };
  for (const d of AT) if (!(PROFILE_DISTANCES_M as readonly number[]).includes(d)) throw new Error(`${d} m is not a profile distance`);

  const rows: string[][] = [];
  for (const run of runs) {
    const ordered = CONCERN_ORDER.map((c) => run.report.concerns.find((x) => x.concern === c)).filter(
      (c): c is NonNullable<typeof c> => c !== undefined,
    );
    const cells = (nominal: boolean, d: number, items: typeof ordered): string => {
      const total = items.reduce((a, c) => a + c.targetCount, 0);
      const gone = items.reduce((a, c) => {
        const profile = nominal ? c.nominalProfile : c.profile;
        return a + outOf(profile, d, c.targetCount) * c.targetCount;
      }, 0);
      return total === 0 ? "-" : pct(gone / total);
    };
    for (const c of ordered) {
      rows.push([run.persona, concernTitle(c.concern), String(c.targetCount), cells(true, 1, [c]), cells(false, 1, [c]), cells(true, 1.5, [c]), cells(false, 1.5, [c])]);
    }
    const total = ordered.reduce((a, c) => a + c.targetCount, 0);
    rows.push([`**${run.persona}**`, "**All targets together**", `**${total}**`, `**${cells(true, 1, ordered)}**`, `**${cells(false, 1, ordered)}**`, `**${cells(true, 1.5, ordered)}**`, `**${cells(false, 1.5, ordered)}**`]);
    const pores = ordered.find((c) => c.concern === "pore");
    if (pores) facts[`sight.${run.persona}.pore`] = `${pct(outOf(pores.nominalProfile, 1.5, pores.targetCount))} typical, ${pct(outOf(pores.profile, 1.5, pores.targetCount))} bound`;
    facts[`sight.${run.persona}.poreFound`] = String(pores?.targetCount ?? 0);
  }
  return [
    "The share of each concern's targets that is out of sight at that distance. **Typical** is the average observer (margin 0). **Bound** is the one-sided claim: not visible even to a sharp-eyed 20/20 observer with a 6 dB margin, so it is the smaller share. Pooled rows add the counts of every concern the face has; pores dominate them.",
    "",
    table(["Face", "Concern", "Found", "1 m typical", "1 m bound", "1.5 m typical", "1.5 m bound"], rows),
    "",
    `Source: ${PERSONA_SOURCE}; the shares are 1 minus \`profile\` (bound) and \`nominalProfile\` (typical) at 1 m and 1.5 m. Reproduce: \`npx tsx scripts/dev/pipeline.ts p1a p2b p3a p5a\` (prints the bound profile) or ${sectionCmd("persona-sight")}.`,
  ].join("\n");
}

async function worthItSection(): Promise<string> {
  const rows: string[][] = [];
  const groups = (["a", "b"] as const).map((g) => ({ stem: `sim_improve_${g}05`, concerns: SIMULATION_GROUPS[g].concerns }));
  for (const persona of PERSONAS) {
    const run = await personaRun(persona);
    const found = new Map<ConcernId, WorthIt>();
    for (const group of groups) {
      const sim = await decodeImage(path.join(ROOT, "fixtures/youcam", persona, "renders", `${group.stem}.png`));
      for (const w of worthIt(run.base, { analysis: run.loaded.analysis, masks: run.loaded.masks }, run.loaded.photo, sim, group.concerns)) found.set(w.concern, w);
    }
    for (const concern of groups.flatMap((g) => g.concerns)) {
      const w = found.get(concern)!;
      if (w.targetCount === 0) continue; // nothing found on this face: no row
      rows.push([
        persona,
        concernTitle(concern),
        String(w.targetCount),
        metres(w.differenceMedianDistanceM),
        metres(w.differenceMaxDistanceM),
        w.differenceNominalMaxDistanceM === undefined ? "-" : metres(w.differenceNominalMaxDistanceM),
      ]);
    }
  }
  return [
    "How far the change a half-strength Skin Simulation would make stays detectable. A simulation of the picture, not a result for any product. Concerns the face does not have are left out.",
    "",
    table(["Face", "Concern", "Found", "Median (m)", "Max (m)", "Max, typical observer (m)"], rows),
    "",
    "Median and max are the one-sided bound over the concern's targets; \"10+\" is the 10 m contract cap. Targets found are the same as in the table above (the redness mask is empty on p2b and p5a).",
    "",
    "Source: `worthIt` in `lib/vision/worthIt.ts`, with the recorded renders `fixtures/youcam/<face>/renders/sim_improve_a05.png` (under-eye shadows, puffiness, fine lines, redness) and `sim_improve_b05.png` (dark spots, pores, breakouts), `DEFAULT_VIEWING`. " +
      `Reproduce: \`npx tsx scripts/dev/worthit.ts\` or ${sectionCmd("persona-worthit")} (about 10 s).`,
  ].join("\n");
}

async function coverageSection(): Promise<string> {
  const rows: string[][] = [];
  const skipped: string[] = [];
  for (const persona of PERSONAS) {
    if (!fs.existsSync(fixturePath(persona, "renders/foundation_cov50.png"))) {
      skipped.push(persona);
      continue;
    }
    const run = await personaRun(persona);
    const render = replayMakeupRender(persona);
    for (const concern of COVERAGE_CONCERNS) {
      const plan = await planCoverage({
        concern,
        base: run.base,
        scale: run.scale,
        viewing: DEFAULT_VIEWING,
        photo: run.loaded.photo,
        render,
        targetDistanceM: COVERAGE_TARGET_M,
        geometry: { analysis: run.loaded.analysis, masks: run.loaded.masks },
      });
      const total = run.base.features.filter((f) => f.concern === concern).length;
      const share = (x: number | undefined): string => (x === undefined ? "not rendered" : pct(x));
      const at = (coverage: number) => plan.steps.find((s) => s.lever.value === coverage)?.fractionAtTarget;
      const chosen = plan.chosen ? String(plan.chosen.lever.value) : "none";
      rows.push([
        persona,
        concernTitle(concern),
        String(total),
        share(plan.baselineFraction),
        share(at(50)),
        share(at(75)),
        share(at(100)),
        plan.status === "met" ? `${chosen} (reaches ${pct(MET_FRACTION)} or less)` : `${chosen} (knee)`,
      ]);
    }
  }
  return [
    `Foundation \`coverageIntensity\` with \`skin_smooth\` at 0, checked on recorded try-on renders (grid ${COVERAGE_GRID.join(", ")}). The columns are the share of the concern's marks still detectable at ${COVERAGE_TARGET_M} m (bound). "Least coverage" is the lowest coverage that brings the share to ${pct(MET_FRACTION)} or less; when nothing does, it is the knee, the lowest coverage with ${pct(KNEE_SHARE)} of the reduction that 100 gives.`,
    "",
    table(["Face", "Concern", "Marks", "No makeup", "Coverage 50", "75", "100", "Least coverage"], rows),
    "",
    skipped.length ? `${skipped.join(", ")}: no makeup renders were recorded, so there is no row. ` : "",
    "Under-eye shadows, puffiness, fine lines and redness have no verified makeup lever and are not searched (`lib/coverage/plan.ts`).",
    "",
    "Source: `planCoverage` in `lib/coverage/plan.ts` with `replayMakeupRender` (`lib/coverage/replayRender.ts`) on `fixtures/youcam/<face>/renders/foundation_cov*.png`. " +
      `Reproduce: \`npx tsx scripts/docs/product-tables.ts\` (the same search, in docs/EVAL.md) or ${sectionCmd("persona-coverage")} (about 30 s).`,
  ].join("\n");
}

// ---------------------------------------------------------------------------------------------------------------
// 4. The AI comparison
// ---------------------------------------------------------------------------------------------------------------

interface Spread {
  n: number;
  median: number | null;
  min: number | null;
  max: number | null;
  cv: number | null;
  nulls?: number;
  runs?: number;
}

interface AiSummary {
  meta: {
    model: string;
    calls: number;
    tokens: { input: number; output: number };
    estimatedCostUsd: number;
    priceAssumptionUsdPerMillion: { input: number; output: number };
  };
  testA: {
    cells: { persona: string; concern: string; llm: Spread; ours: { targetCount: number; fractionAt1_5m: number } | null }[];
    oursDeterminism: { rerunIdentical: boolean; sha256: string };
    aggregate: { cellsWithSpread: number; medianCv: number; medianMaxOverMin: number; worstMaxOverMin: number };
  };
  testB: {
    patches: { id: string; llm: Spread & { values: number[]; maxOverMin: number }; answersInsideRange: number }[];
    scaling: { weberPct: number; llm2over1: number; llm4over2: number; llm2over1Range: [number, number]; llm4over2Range: [number, number] }[];
    aggregate: {
      geometricMeanFactorOfMedianVsNominal: number;
      geometricMeanFactorOfAnswersVsNominal: number;
      worstFactorOfMedianVsNominal: number;
      answersInsideModelRange: number;
      answersTotal: number;
      medianCv: number;
      meanScalingRatio: { llm2over1: number; llm4over2: number; ideal: number };
    };
  };
}

function aiSection(facts: Facts): string {
  const s = readJson<AiSummary>("eval/llm-baseline/results/summary.json");
  const a = s.testA;
  const b = s.testB;

  const cvA = a.cells.filter((c) => c.llm.n >= 2 && typeof c.llm.cv === "number").map((c) => c.llm.cv!);
  if (cvA.length !== a.aggregate.cellsWithSpread) throw new Error("AI summary: cells with a spread do not match the aggregate");
  const callsA = new Set(a.cells.map((c) => c.persona)).size * Math.max(...a.cells.map((c) => c.llm.runs ?? 0));
  const callsB = b.patches.reduce((n, p) => n + p.llm.n, 0);
  if (callsA + callsB !== s.meta.calls) throw new Error("AI summary: Test A plus Test B calls do not add up to meta.calls");

  const cvB = rangeOf(b.patches.map((p) => p.llm.cv!));
  const ratioB = rangeOf(b.patches.map((p) => p.llm.maxOverMin));
  const medianRatios = b.scaling.flatMap((r) => [r.llm2over1, r.llm4over2]);
  const askRatios = b.scaling.flatMap((r) => [...r.llm2over1Range, ...r.llm4over2Range]);
  const cvRangeA = rangeOf(cvA);

  const pores = a.cells.filter((c) => c.concern === "pores");
  const poreMedians = [...new Set(pores.map((c) => c.llm.median))];
  const breakouts = a.cells.filter((c) => c.concern === "breakouts");
  const breakNull = breakouts.filter((c) => c.llm.median === null && c.llm.nulls === c.llm.runs);
  const breakFound = breakNull.map((c) => c.ours?.targetCount ?? 0);
  const poreShare = pores.map((c) => (c.ours ? pct(c.ours.fractionAt1_5m) : "-"));
  const price = s.meta.priceAssumptionUsdPerMillion;
  const tokens = s.meta.tokens;
  const cost = `$${s.meta.estimatedCostUsd.toFixed(2)}`;
  const x2 = (v: number): string => `${v.toFixed(2)}x`;
  const x1 = (v: number): string => `${v.toFixed(1)}x`;

  facts["ai.calls"] = String(s.meta.calls);
  facts["ai.cost"] = cost;
  facts["ai.cvB"] = pct(b.aggregate.medianCv);
  facts["ai.inRange"] = `${b.aggregate.answersInsideModelRange} of ${b.aggregate.answersTotal}`;
  facts["ai.factor"] = x2(b.aggregate.geometricMeanFactorOfMedianVsNominal);
  facts["ai.poresMedian"] = poreMedians.length === 1 && poreMedians[0] !== null ? `${poreMedians[0]} m on all ${pores.length} faces` : "differs by face";
  facts["ai.breakoutsNull"] = `null on ${breakNull.length} faces where YouCam found ${breakFound.join(", ")}`;
  facts["ai.ratioB"] = `${x1(ratioB[0])} to ${x1(ratioB[1])}`;
  facts["ai.cvBRange"] = `${pct(cvB[0])} to ${pct(cvB[1])}`;

  const file = "`eval/llm-baseline/results/summary.json`";
  const rebuild = "`npx tsx eval/llm-baseline/run.ts --offline` (no network; rebuilds the file from the cached replies)";
  return [
    `Claude Opus 5.5 on Amazon Bedrock (\`${s.meta.model}\`) against our model, on the four demo faces (Test A) and nine synthetic spots (Test B). Every number is in ${file}; the full write-up is \`eval/llm-baseline/README.md\`.`,
    "",
    quantityTable([
      { what: "Calls", value: `${s.meta.calls} (Test A ${callsA}, Test B ${callsB})`, source: `${file} \`meta.calls\`, \`testA.cells\`, \`testB.patches\``, reproduce: rebuild },
      { what: "Tokens", value: `${int(tokens.input)} in, ${int(tokens.output)} out`, source: `${file} \`meta.tokens\``, reproduce: rebuild },
      { what: "Estimated cost", value: `${cost} at list price ($${price.input} in, $${price.output} out per million tokens; Bedrock billing may differ)`, source: `${file} \`meta.estimatedCostUsd\`, \`meta.priceAssumptionUsdPerMillion\``, reproduce: rebuild },
      { what: "Test A (faces): run-to-run CV, median over the cells with a spread", value: `${pct(a.aggregate.medianCv)} over ${a.aggregate.cellsWithSpread} cells`, source: `${file} \`testA.aggregate.medianCv\``, reproduce: rebuild },
      { what: "Test A: run-to-run CV, range over those cells", value: `${pct(cvRangeA[0])} to ${pct(cvRangeA[1])}`, source: `${file} \`testA.cells[].llm.cv\``, reproduce: sectionCmd("ai") },
      { what: "Test A: highest of five answers over the lowest, median and worst cell", value: `${x1(a.aggregate.medianMaxOverMin)} and ${x1(a.aggregate.worstMaxOverMin)}`, source: `${file} \`testA.aggregate\``, reproduce: rebuild },
      { what: "Test B (synthetic spots): geometric-mean error factor of Claude's median answer against our average-observer distance", value: x2(b.aggregate.geometricMeanFactorOfMedianVsNominal), source: `${file} \`testB.aggregate.geometricMeanFactorOfMedianVsNominal\``, reproduce: rebuild },
      { what: "Test B: the same over every single answer", value: x2(b.aggregate.geometricMeanFactorOfAnswersVsNominal), source: `${file} \`testB.aggregate.geometricMeanFactorOfAnswersVsNominal\``, reproduce: rebuild },
      { what: "Test B: worst median, as a factor", value: x2(b.aggregate.worstFactorOfMedianVsNominal), source: `${file} \`testB.aggregate.worstFactorOfMedianVsNominal\``, reproduce: rebuild },
      { what: "Test B: answers inside our average-observer-to-bound range", value: `${b.aggregate.answersInsideModelRange} of ${b.aggregate.answersTotal}`, source: `${file} \`testB.aggregate.answersInsideModelRange\`, \`answersTotal\``, reproduce: rebuild },
      { what: "Test B: run-to-run CV, median over the nine spots", value: pct(b.aggregate.medianCv), source: `${file} \`testB.aggregate.medianCv\``, reproduce: rebuild },
      { what: "Test B: run-to-run CV, range over the nine spots", value: `${pct(cvB[0])} to ${pct(cvB[1])}`, source: `${file} \`testB.patches[].llm.cv\``, reproduce: sectionCmd("ai") },
      { what: "Test B: highest of five answers over the lowest, range over the nine spots", value: `${x1(ratioB[0])} to ${x1(ratioB[1])}`, source: `${file} \`testB.patches[].llm.maxOverMin\``, reproduce: sectionCmd("ai") },
      { what: "Doubling the spot: Claude's ratio of medians, 1 to 2 mm and 2 to 4 mm, mean over the three contrasts (ideal 2.0)", value: `${b.aggregate.meanScalingRatio.llm2over1.toFixed(2)} and ${b.aggregate.meanScalingRatio.llm4over2.toFixed(2)}`, source: `${file} \`testB.aggregate.meanScalingRatio\``, reproduce: rebuild },
      { what: "Doubling the spot: Claude's ratio of medians, lowest to highest of the six", value: `${x1(rangeOf(medianRatios)[0])} to ${x1(rangeOf(medianRatios)[1])}`, source: `${file} \`testB.scaling[]\``, reproduce: sectionCmd("ai") },
      { what: "Doubling the spot: single answer pairs, lowest to highest ratio", value: `${x1(rangeOf(askRatios)[0])} to ${x1(rangeOf(askRatios)[1])}`, source: `${file} \`testB.scaling[].llm2over1Range\`, \`llm4over2Range\``, reproduce: sectionCmd("ai") },
      { what: "Doubling the spot: our model", value: "2.0 for every doubling, by construction", source: `${file} \`testB.scaling[].ours2over1\`, \`ours4over2\``, reproduce: "`npx vitest run eval/llm-baseline`" },
      { what: "Faces: Claude's median for pores", value: poreMedians.length === 1 && poreMedians[0] !== null ? `${poreMedians[0]} m on all ${pores.length} faces` : poreMedians.join(" / "), source: `${file} \`testA.cells\` (concern \`pores\`)`, reproduce: sectionCmd("ai") },
      { what: "Faces: our pores still detectable at 1.5 m, bound (same faces, in the order of the table below)", value: `${pores.map((c) => c.persona).join(", ")}: ${poreShare.join(", ")}`, source: `${file} \`testA.cells[].ours.fractionAt1_5m\``, reproduce: sectionCmd("ai") },
      { what: "Faces: breakouts, Claude answered null in every run", value: `${breakNull.map((c) => c.persona).join(", ")} (YouCam found ${breakFound.join(", ")})`, source: `${file} \`testA.cells\` (concern \`breakouts\`, \`ours.targetCount\`)`, reproduce: sectionCmd("ai") },
      { what: "Our side, run twice in one process", value: a.oursDeterminism.rerunIdentical ? `identical (SHA-256 ${a.oursDeterminism.sha256.slice(0, 8)}...)` : "NOT identical", source: `${file} \`testA.oursDeterminism\``, reproduce: rebuild },
    ]),
  ].join("\n");
}

// ---------------------------------------------------------------------------------------------------------------
// 5. YouCam
// ---------------------------------------------------------------------------------------------------------------

/** What lib/youcam/client.ts calls, read from its source: literal /s2s paths, plus the task slugs handed to runTask. */
export function appEndpoints(): { endpoints: string[]; tasks: string[]; offlineOnly: string[] } {
  const client = readText("lib/youcam/client.ts");
  const literal = [...client.matchAll(/api\(\s*"(GET|POST)",\s*"(\/s2s\/[^"$]+)"/g)].map((m) => ({ method: m[1], path: m[2] }));
  const tasks = [...client.matchAll(/runTask\(\s*"([a-z-]+)",\s*"(v\d+\.\d+)"/g)].map((m) => ({ slug: m[1], version: m[2] }));
  const endpoints = [
    ...literal.map((e) => `${e.method} ${e.path}`),
    ...tasks.map((t) => `POST + GET /s2s/${t.version}/task/${t.slug}`),
  ].sort();
  // Paths only the scripts use: free reads for the ledger and the price list.
  const used = new Set([...literal.map((l) => l.path), ...tasks.map((t) => `/s2s/${t.version}/task/${t.slug}`)]);
  const offline = new Set<string>();
  const walk = (dir: string): void => {
    for (const entry of fs.readdirSync(`${ROOT}${dir}`, { withFileTypes: true })) {
      const rel = `${dir}/${entry.name}`;
      if (entry.isDirectory()) walk(rel);
      else if (entry.name.endsWith(".ts")) {
        for (const m of readText(rel).matchAll(/["'`](\/s2s\/v\d+\.\d+\/[a-z0-9/-]+)["'`]/g)) if (!used.has(m[1])) offline.add(m[1]);
      }
    }
  };
  walk("scripts/spikes");
  return { endpoints, tasks: tasks.map((t) => t.slug), offlineOnly: [...offline].sort() };
}

interface Latency {
  persona: string;
  runs: number;
  medianMs: number;
  minMs: number;
  maxMs: number;
  bodyBytes: number;
  server: string;
  measuredAt: string;
}

function youcamSection(facts: Facts): string {
  const hdConcerns = HD_ACTIONS.length;
  const sdConcerns = SD_ACTIONS.length;
  const simAll = SIMULATION_GROUPS.all.concerns.length;
  const renders = COVERAGE_GRID.length;
  const hd = analysisUnits("hd", hdConcerns);
  const sd = analysisUnits("sd", sdConcerns);
  const sim = simulationUnits(simAll);
  const simSmall = simulationUnits(Object.keys(SIMULATION_GROUPS.a.strengths).length);
  const session = hd + sim + renders * MAKEUP_UNITS;
  const { endpoints, tasks, offlineOnly } = appEndpoints();
  const lat = readJson<Latency>("public/brands/latency.json");

  facts["youcam.hd"] = String(hd);
  facts["youcam.session"] = String(session);
  facts["youcam.latency"] = `${lat.medianMs} ms`;
  facts["youcam.endpoints"] = String(endpoints.length);

  const costs = "`lib/youcam/costs.ts` (the price list read from `GET /s2s/v2.0/credit/feature-cost`)";
  return [
    quantityTable([
      { what: "YouCam products used", value: `${tasks.length} (${tasks.join(", ")})`, source: "`runTask(...)` calls in `lib/youcam/client.ts`", reproduce: "`grep -n 'runTask(' -A1 lib/youcam/client.ts`" },
      { what: "YouCam API endpoints the running app calls", value: `${endpoints.length}: ${endpoints.map((e) => `\`${e}\``).join(", ")}`, source: "`api(...)` and `runTask(...)` calls in `lib/youcam/client.ts`; every task endpoint is a submit (POST) and a free poll (GET)", reproduce: `${sectionCmd("youcam")}; \`grep -n '/s2s/' lib/youcam/client.ts\`` },
      { what: "Free reads used only by scripts (ledger and price list)", value: `${offlineOnly.length}: ${offlineOnly.map((e) => `\`GET ${e}\``).join(", ")}`, source: "`/s2s/` paths in `scripts/spikes/*.ts` that the client does not call", reproduce: "`grep -rn '/s2s/' scripts/spikes`" },
      { what: "HD Skin Analysis, units per call", value: `${hd} for ${hdConcerns} concerns (tiers 1-4 / 5-8 / 9-12 / 13-16 concerns: ${[1, 5, 9, 13].map((n) => analysisUnits("hd", n)).join(" / ")})`, source: `\`analysisUnits("hd", HD_ACTIONS.length)\` in ${costs}`, reproduce: sectionCmd("youcam") },
      { what: "SD Skin Analysis, units per call (the cheaper fallback)", value: `${sd} for ${sdConcerns} concerns`, source: `\`analysisUnits("sd", SD_ACTIONS.length)\` in ${costs}`, reproduce: sectionCmd("youcam") },
      { what: "Skin Simulation, units per call", value: `${sim} for ${simAll} concerns in one call (${simSmall} for 1-4 concerns)`, source: `\`simulationUnits\` in ${costs}; the seven concerns are \`SIMULATION_GROUPS.all\` in \`lib/integration/types.ts\``, reproduce: sectionCmd("youcam") },
      { what: "Makeup VTO, units per call", value: String(MAKEUP_UNITS), source: `\`MAKEUP_UNITS\` in ${costs}`, reproduce: sectionCmd("youcam") },
      { what: "Units per full live session", value: `${session} (${hd} analysis + ${sim} simulation + up to ${renders} try-on renders at ${MAKEUP_UNITS}); distances alone cost ${hd}`, source: "the three rows above; the renders are `COVERAGE_GRID` in `lib/coverage/plan.ts`", reproduce: sectionCmd("youcam") },
      { what: "Measured latency of `POST /api/visibility`, median", value: `${lat.medianMs} ms (min ${lat.minMs}, max ${lat.maxMs}; ${lat.runs} runs on ${lat.persona}, ${(lat.bodyBytes / 1024 / 1024).toFixed(1)} MB response)`, source: `\`public/brands/latency.json\` (${lat.server}, ${lat.measuredAt})`, reproduce: "`npm run build`, then `next start` and `npx tsx scripts/dropin/time-example.ts` (rewrites that file)" },
    ]),
  ].join("\n");
}

// ---------------------------------------------------------------------------------------------------------------
// 5b. The unit ledger (internal/LEDGER.md, gitignored)
// ---------------------------------------------------------------------------------------------------------------

/** internal/ is gitignored and lives in the main checkout, so a worktree looks there through git. */
export function findLedger(): string | null {
  const candidates = [process.env.ARMS_LENGTH_LEDGER, path.join(ROOT, "internal/LEDGER.md")];
  try {
    const common = execFileSync("git", ["rev-parse", "--git-common-dir"], { cwd: ROOT, encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }).trim();
    candidates.push(path.join(path.resolve(ROOT, common), "..", "internal", "LEDGER.md"));
  } catch {
    // not a git checkout: the other candidates still apply
  }
  return candidates.find((c): c is string => !!c && fs.existsSync(c)) ?? null;
}

interface LedgerParse {
  starting: number;
  buckets: { name: string; planned: number; spent: number; left: number }[];
  total: { planned: number; spent: number; left: number };
  lastBalance: number;
}

const num = (s: string): number => Number(s.replace(/[*,\s]/g, ""));

/** Reads the allocation table, the starting balance and the last "Balance after". Null when the format is not recognised. */
export function parseLedger(text: string): LedgerParse | null {
  const t = unix(text);
  const starting = /Starting balance:\s*\*\*([\d,]+)\s*units\*\*/.exec(t);
  const allocation = /## Allocation\n([\s\S]*?)\n## /.exec(t);
  const log = /## Spend log\n([\s\S]*?)(?:\n\nNotes:|\n## |$)/.exec(t);
  if (!starting || !allocation || !log) return null;
  const buckets: LedgerParse["buckets"] = [];
  for (const line of allocation[1].split("\n")) {
    const cells = line.split("|").map((c) => c.trim());
    if (cells.length < 6 || !/^\**[\d,]+\**$/.test(cells[2]) || !/^\**[\d,]+\**$/.test(cells[3]) || !/^\**[\d,]+\**$/.test(cells[4])) continue;
    buckets.push({ name: cells[1].replace(/\*/g, ""), planned: num(cells[2]), spent: num(cells[3]), left: num(cells[4]) });
  }
  const totalRow = buckets.find((b) => b.name === "Total");
  const balances = log[1]
    .split("\n")
    .map((line) => line.split("|").map((c) => c.trim()))
    .filter((cells) => /^\d{4}-\d{2}-\d{2}$/.test(cells[1] ?? ""))
    .map((cells) => num(cells[5] ?? ""));
  if (!totalRow || balances.length === 0 || balances.some(Number.isNaN)) return null;
  return {
    starting: num(starting[1]),
    buckets: buckets.filter((b) => b.name !== "Total"),
    total: totalRow,
    lastBalance: balances[balances.length - 1],
  };
}

function ledgerSection(): string | null {
  const file = findLedger();
  if (!file) return null;
  const parsed = parseLedger(fs.readFileSync(file, "utf8"));
  const src = "`internal/LEDGER.md` (gitignored; the project's own ledger, cross-checked against `GET /s2s/v1.0/client/credit` after each batch)";
  if (!parsed) {
    return quantityTable([{ what: "Units spent and left", value: "manual", source: src, reproduce: "open internal/LEDGER.md: its format was not recognised by `parseLedger`" }]);
  }
  const cmd = `${sectionCmd("ledger")} (reads ${src.split(" ")[0]})`;
  const live = parsed.buckets.find((b) => b.name === "Integration checks");
  return [
    quantityTable([
      { what: "Units at the start", value: int(parsed.starting), source: "`internal/LEDGER.md` \"Starting balance\"", reproduce: cmd },
      { what: "Units spent in total", value: int(parsed.total.spent), source: "`internal/LEDGER.md` allocation table, Total row", reproduce: cmd },
      { what: "Units left", value: int(parsed.total.left), source: "`internal/LEDGER.md` allocation table, Total row", reproduce: cmd },
      { what: "Balance after the last logged call", value: int(parsed.lastBalance), source: "`internal/LEDGER.md` spend log, last row", reproduce: cmd },
      ...(live ? [{ what: "Units the first live session through the app spent", value: `${live.spent} (bucket \"${live.name}\")`, source: "`internal/LEDGER.md` allocation table", reproduce: cmd }] : []),
    ]),
    "",
    table(
      ["Bucket", "Planned", "Spent", "Left"],
      parsed.buckets.map((b) => [b.name, int(b.planned), int(b.spent), int(b.left)]),
    ),
    "",
    `Source: ${src}. Reproduce: ${cmd}.`,
  ].join("\n");
}

const LEDGER_MANUAL = quantityTable([
  {
    what: "Units spent and left",
    value: "manual",
    source: "`internal/LEDGER.md` (gitignored, so it is not in this checkout); `docs/YOUCAM.md` section 5 quotes it",
    reproduce: "run `npx tsx scripts/docs/numbers.ts --write` in a checkout that has `internal/LEDGER.md`",
  },
]);

// ---------------------------------------------------------------------------------------------------------------
// 6. Engineering
// ---------------------------------------------------------------------------------------------------------------

/** Physical lines, the way `wc -l` counts them on LF files. */
const countLines = (text: string): number => {
  const t = unix(text);
  if (!t) return 0;
  const n = t.split("\n").length;
  return t.endsWith("\n") ? n - 1 : n;
};

function listFiles(dir: string, accept: (rel: string) => boolean): string[] {
  const out: string[] = [];
  const walk = (rel: string): void => {
    for (const entry of fs.readdirSync(`${ROOT}${rel}`, { withFileTypes: true }).sort((a, b) => (a.name < b.name ? -1 : 1))) {
      const child = `${rel}/${entry.name}`;
      if (entry.isDirectory()) walk(child);
      else if (accept(child)) out.push(child);
    }
  };
  walk(dir);
  return out;
}

const isTest = (rel: string): boolean => /\.test\.tsx?$/.test(rel);

export interface ModuleLines {
  module: string;
  files: number;
  lines: number;
  testFiles: number;
  testLines: number;
}

export function libLines(): ModuleLines[] {
  const modules = fs.readdirSync(`${ROOT}lib`, { withFileTypes: true }).filter((e) => e.isDirectory()).map((e) => e.name).sort();
  return modules.map((module) => {
    const files = listFiles(`lib/${module}`, (rel) => /\.tsx?$/.test(rel));
    const src = files.filter((f) => !isTest(f));
    const tests = files.filter(isTest);
    const sum = (list: string[]): number => list.reduce((n, f) => n + countLines(readText(f)), 0);
    return { module, files: src.length, lines: sum(src), testFiles: tests.length, testLines: sum(tests) };
  });
}

/** Routes the e2e specs visit in tests that assert an empty axe violations list (literal and loop-resolved `goto`s). */
export function axeRoutes(): { routes: string[]; specFiles: number; assertingFiles: number } {
  const specs = fs.readdirSync(`${ROOT}tests/e2e`).filter((f) => f.endsWith(".spec.ts")).sort();
  const routes = new Set<string>();
  let assertingFiles = 0;
  for (const spec of specs) {
    const text = readText(`tests/e2e/${spec}`);
    const arrays = (name: string): string[] => {
      const m = new RegExp(`const ${name}\\b[^=]*=\\s*\\[([\\s\\S]*?)\\n?\\];`).exec(text);
      return m ? [...m[1].matchAll(/"([^"]+)"/g)].map((x) => x[1]).filter((s) => s.startsWith("/") || /^p\d/.test(s)) : [];
    };
    // Every `test(` opens a block; the preamble (helpers, constants) before the first one is not a test.
    const starts = [...text.matchAll(/^[ \t]*test(?:\.(?:only|skip|fixme))?\(/gm)].map((m) => m.index!);
    let asserts = false;
    starts.forEach((start, i) => {
      const block = text.slice(start, starts[i + 1] ?? text.length);
      if (!/expectNoAxeViolations\(page\)|new AxeBuilder\(/.test(block)) return;
      asserts = true;
      for (const m of block.matchAll(/goto\(\s*(?:"([^"]+)"|`([^`]+)`|(\w+))\s*[,)]/g)) {
        const [, literal, template, variable] = m;
        const add = (route: string): void => void routes.add(route.split("#")[0].split("?")[0]);
        if (literal) add(literal);
        else if (template) {
          const v = /\$\{(\w+)\}/.exec(template);
          if (!v) add(template);
          else if (v[1] === "persona") for (const p of arrays("PERSONAS")) add(template.replace("${persona}", p));
        } else if (variable === "path") for (const p of [...text.matchAll(/path:\s*"([^"]+)"/g)].map((x) => x[1])) add(p);
      }
    });
    if (asserts) assertingFiles++;
  }
  return { routes: [...routes].sort(), specFiles: specs.length, assertingFiles };
}

function engineeringFastSection(facts: Facts): string {
  const lines = libLines();
  const totals = lines.reduce(
    (t, m) => ({ files: t.files + m.files, lines: t.lines + m.lines, testFiles: t.testFiles + m.testFiles, testLines: t.testLines + m.testLines }),
    { files: 0, lines: 0, testFiles: 0, testLines: 0 },
  );
  const axe = axeRoutes();
  const { endpoints } = appEndpoints();
  const apiRoutes = listFiles("app/api", (rel) => /\/route\.ts$/.test(rel));
  facts["eng.libLines"] = int(totals.lines);
  facts["eng.axe"] = `${axe.routes.length} routes`;

  return [
    quantityTable([
      { what: "YouCam API endpoints called", value: String(endpoints.length), source: "`lib/youcam/client.ts` (see section 5)", reproduce: sectionCmd("youcam") },
      { what: "Our own API routes", value: `${apiRoutes.length} (${apiRoutes.map((r) => `\`/${r.replace(/^app\//, "").replace(/\/route\.ts$/, "")}\``).join(", ")})`, source: "`app/api/**/route.ts`", reproduce: "`find app/api -name route.ts`" },
      { what: "Axe accessibility scan in the e2e specs", value: `0 violations asserted on ${axe.routes.length} routes: ${axe.routes.map((r) => `\`${r}\``).join(", ")}`, source: `static scan of \`tests/e2e/*.spec.ts\`: tests that call the axe helper and the pages they \`goto\` (${axe.assertingFiles} of ${axe.specFiles} spec files assert it). The specs require an empty violations list; this table does not record a run`, reproduce: `${sectionCmd("engineering-misc")}; \`npm run e2e\`` },
    ]),
  ].join("\n") + "\n\n" + [
    "Source lines of TypeScript per `lib/` module (physical lines, as `wc -l` counts them; test files separate).",
    "",
    table(
      ["Module", "Source files", "Source lines", "Test files", "Test lines"],
      [
        ...lines.map((m) => [`\`lib/${m.module}\``, String(m.files), int(m.lines), String(m.testFiles), int(m.testLines)]),
        ["**Total**", `**${totals.files}**`, `**${int(totals.lines)}**`, `**${totals.testFiles}**`, `**${int(totals.testLines)}**`],
      ],
    ),
    "",
    "Source: every `.ts` and `.tsx` file under `lib/` (a test file is one named `*.test.ts`). Reproduce: `find lib/vision -name '*.ts' ! -name '*.test.ts' | xargs cat | wc -l` for one module, or " +
      sectionCmd("engineering-lines") + ".",
  ].join("\n");
}

export interface TestCounts {
  unitTests: number;
  unitFiles: number;
  e2eTests: number;
  e2eFiles: number;
}

const requireFromHere = createRequire(import.meta.url);

/** A full vitest run, counted from its JSON report, and Playwright's own listing (nothing is run, no server starts). */
export function measureTestCounts(): TestCounts {
  const vitestEntry = path.join(path.dirname(requireFromHere.resolve("vitest/package.json")), "vitest.mjs");
  const out = path.join(fs.mkdtempSync(path.join(os.tmpdir(), "numbers-")), "vitest.json");
  // A failing test (the drift test itself, before this file is regenerated) still counts as a test, so the status is ignored.
  spawnSync(process.execPath, [vitestEntry, "run", "--reporter=json", `--outputFile=${out}`], { cwd: ROOT, stdio: "ignore" });
  const run = JSON.parse(fs.readFileSync(out, "utf8")) as { numTotalTests: number; testResults: unknown[] };

  const pwCli = path.join(path.dirname(requireFromHere.resolve("@playwright/test/package.json")), "cli.js");
  const list = spawnSync(process.execPath, [pwCli, "test", "--list", "--reporter=json"], { cwd: ROOT, encoding: "utf8", maxBuffer: 1 << 28 });
  const parsed = JSON.parse(list.stdout) as { suites: Suite[] };
  interface Suite {
    file?: string;
    specs?: { tests: unknown[] }[];
    suites?: Suite[];
  }
  const count = (s: Suite): number => (s.specs ?? []).reduce((n, x) => n + x.tests.length, 0) + (s.suites ?? []).reduce((n, c) => n + count(c), 0);
  return {
    unitTests: run.numTotalTests,
    unitFiles: run.testResults.length,
    e2eTests: parsed.suites.reduce((n, s) => n + count(s), 0),
    e2eFiles: parsed.suites.length,
  };
}

function engineeringTestsSection(counts: TestCounts): string {
  return quantityTable([
    { what: "Unit tests (vitest)", value: `${counts.unitTests} in ${counts.unitFiles} files`, source: "`numTotalTests` of a full `vitest run` (config: `vitest.config.mts`)", reproduce: "`npx vitest run --reporter=json --outputFile=out.json`, then read `numTotalTests`; or `npm test`" },
    { what: "End-to-end tests (Playwright)", value: `${counts.e2eTests} in ${counts.e2eFiles} spec files`, source: "Playwright's listing of `tests/e2e/*.spec.ts` (loops expanded); not run here", reproduce: "`npx playwright test --list`" },
  ]);
}

// ---------------------------------------------------------------------------------------------------------------
// 7. Vision constants
// ---------------------------------------------------------------------------------------------------------------

function visionSection(facts: Facts): string {
  const disk: TargetSpec = { id: "illustration", concern: "age_spot", shape: "disk", sizeMm: 3, lum: -0.12, rg: 0, yv: 0, chromatic: false };
  const lab = { luminanceCdM2: MODELFEST_LUMINANCE, acuityScale: 1, label: "custom" as const, marginDb: DEFAULT_MARGIN_DB };
  const app = DEFAULT_VIEWING;
  const l = rawDistances(disk, lab);
  const a = rawDistances(disk, app);
  const ratios = illustrativeDistances().map((d) => d.boundM / d.nominalM);
  const ratioRange = rangeOf(ratios);
  const contrastFactor = 10 ** (DEFAULT_MARGIN_DB / 20);
  const arcminMm = 1000 * Math.tan(Math.PI / 180 / 60);

  facts["vision.disk"] = `${l.nominal.toFixed(1)} m typical, ${l.bound.toFixed(1)} m bound`;
  facts["vision.margin"] = `${DEFAULT_MARGIN_DB} dB`;
  facts["vision.ratio"] = `${(l.bound / l.nominal).toFixed(2)}`;

  const eval_ = "`illustrativeDistances()` in `scripts/docs/eval-tables.ts`; docs/EVAL.md \"Illustrative distances\"";
  return quantityTable([
    { what: "A 3 mm disk at 12% contrast, at ModelFest's 30 cd/m^2: typical observer", value: `${l.nominal.toFixed(1)} m`, source: `\`rawDistances\` in \`lib/vision/visibility.ts\` (margin 0); ${eval_}`, reproduce: `${sectionCmd("vision")}; \`npx vitest run lib/vision/params.doc.test.ts\`` },
    { what: "The same disk, bound (margin 6 dB)", value: `${l.bound.toFixed(1)} m`, source: "`rawDistances` (bound), `DEFAULT_MARGIN_DB`", reproduce: sectionCmd("vision") },
    { what: "The same disk at the app's default light (45 cd/m^2, indoor): typical and bound", value: `${a.nominal.toFixed(1)} m and ${a.bound.toFixed(1)} m (the app caps a distance at ${MAX_DISTANCE_M} m)`, source: "`rawDistances` with `DEFAULT_VIEWING`; luminance factor is an unverified heuristic (`docs/MODEL.md` limitations)", reproduce: sectionCmd("vision") },
    { what: "Safety margin", value: `${DEFAULT_MARGIN_DB} dB, a factor of ${contrastFactor.toFixed(2)} in contrast sensitivity`, source: "`DEFAULT_MARGIN_DB` in `lib/vision/params.ts`; `DEFAULT_VIEWING.marginDb` in `lib/contracts/vision.ts`", reproduce: "`grep -n MARGIN lib/vision/params.ts`" },
    { what: "What the margin does to a distance: bound over typical, that 3 mm disk", value: `x${(l.bound / l.nominal).toFixed(2)}`, source: "`rawDistances` bound / nominal", reproduce: sectionCmd("vision") },
    { what: "Bound over typical, across the seven illustrative features", value: `x${ratioRange[0].toFixed(2)} to x${ratioRange[1].toFixed(2)}`, source: eval_, reproduce: sectionCmd("vision") },
    { what: "20/20 acuity", value: `1 arcminute; \`acuityScale\` 1 = 20/20, 2 = 20/40. 1 arcminute spans ${arcminMm.toFixed(2)} mm at 1 m`, source: "`DEFAULT_VIEWING.acuityScale` in `lib/contracts/vision.ts`; the 1 arcminute is the Snellen definition of 20/20 (manual: textbook definition, not a fitted constant)", reproduce: "`grep -n acuityScale lib/contracts/vision.ts`" },
    { what: "Default viewing light", value: `${app.luminanceCdM2} cd/m^2 (indoor)`, source: "`DEFAULT_VIEWING` in `lib/contracts/vision.ts`", reproduce: "`grep -n DEFAULT_VIEWING lib/contracts/vision.ts`" },
    { what: "Distances are reported between", value: `${MIN_DISTANCE_M} m and ${MAX_DISTANCE_M} m (shown as "${MAX_DISTANCE_M}+")`, source: "`MIN_DISTANCE_M`, `MAX_DISTANCE_M` in `lib/contracts/vision.ts`", reproduce: "`grep -n DISTANCE_M lib/contracts/vision.ts`" },
    { what: "Distances the profile counts at", value: `${PROFILE_DISTANCES_M.join(", ")} m`, source: "`PROFILE_DISTANCES_M` in `lib/contracts/vision.ts`", reproduce: "`grep -n PROFILE_DISTANCES_M lib/contracts/vision.ts`" },
  ]);
}

// ---------------------------------------------------------------------------------------------------------------
// Headline numbers (fast facts only)
// ---------------------------------------------------------------------------------------------------------------

function headlineSection(facts: Facts): string {
  const get = (key: string): string => {
    const v = facts[key];
    if (v === undefined) throw new Error(`headline: no fact "${key}"`);
    return v;
  };
  const rows: string[][] = [
    ["Model against human thresholds", `${get("modelfest.rms41")} RMS over ${get("modelfest.n")} ModelFest patterns (the paper: ${get("modelfest.paper43")} over 43)`, "1"],
    ["Skin-shaped patterns", get("modelfest.rmsSkin"), "1"],
    ["Human observers behind it", get("modelfest.observers"), "1"],
    ["The iris as a ruler", `${get("iris.mean")} +/- ${get("iris.sd")} (${get("iris.rel")})`, "2"],
    ["Mask-based scale against the iris scale", `within ${get("iris.maskAgreement")}`, "2"],
    ["A 3 mm, 12% spot", get("vision.disk"), "7"],
    ["The safety margin", `${get("vision.margin")}, about x${get("vision.ratio")} in distance`, "7"],
    ["Pores out of sight at 1.5 m on p2b", `${get("sight.p2b.pore")} (${get("sight.p2b.poreFound")} found)`, "3"],
    ["AI baseline calls and cost", `${get("ai.calls")} calls, ${get("ai.cost")}`, "4"],
    ["AI run-to-run spread, same question", `CV ${get("ai.cvB")} (median); highest of five asks ${get("ai.ratioB")} the lowest`, "4"],
    ["AI against our distance", `${get("ai.factor")} off (geometric mean); ${get("ai.inRange")} answers inside our range`, "4"],
    ["AI on real faces", `pores ${get("ai.poresMedian")}; breakouts ${get("ai.breakoutsNull")}`, "4"],
    ["YouCam units", `${get("youcam.hd")} per analysis, ${get("youcam.session")} per full session`, "5"],
    ["Measured route latency", get("youcam.latency"), "5"],
  ];
  return [
    "Each row is a value from a section below (the last column), picked up by the generator rather than typed.",
    "",
    table(["What", "Value", "Section"], rows),
    "",
    "Test counts and units spent and left are in sections 6 and 5; they are measured separately.",
  ].join("\n");
}

// ---------------------------------------------------------------------------------------------------------------
// The registry, the fingerprint, the document
// ---------------------------------------------------------------------------------------------------------------

export type Tier = "fast" | "slow" | "ledger";

interface SectionDef {
  id: string;
  heading: string;
  level: 2 | 3;
  tier: Tier;
}

/** Document order. A `ledger` or `slow` section is built only on request (see `buildSections`). */
export const SECTIONS: SectionDef[] = [
  { id: "headline", heading: "Headline numbers", level: 2, tier: "fast" },
  { id: "modelfest", heading: "1. ModelFest: the model against human observers", level: 2, tier: "fast" },
  { id: "iris", heading: "2. The iris ruler", level: 2, tier: "fast" },
  { id: "persona-found", heading: "3. The four demo faces: what was found", level: 2, tier: "fast" },
  { id: "persona-sight", heading: "3.1 Out of sight at 1 m and 1.5 m", level: 3, tier: "fast" },
  { id: "persona-worthit", heading: "3.2 Worth it?", level: 3, tier: "slow" },
  { id: "persona-coverage", heading: "3.3 The lightest touch: the coverage knee", level: 3, tier: "slow" },
  { id: "ai", heading: "4. The AI comparison", level: 2, tier: "fast" },
  { id: "youcam", heading: "5. YouCam", level: 2, tier: "fast" },
  { id: "ledger", heading: "5.1 Units spent and left", level: 3, tier: "ledger" },
  { id: "engineering-misc", heading: "6. Engineering", level: 2, tier: "fast" },
  { id: "engineering-tests", heading: "6.1 Test counts", level: 3, tier: "slow" },
  { id: "vision", heading: "7. Vision constants worth quoting", level: 2, tier: "fast" },
];

/** Block ids whose body is rendered inside another section's block (`engineering-lines` is part of `engineering-misc`). */
const ALIASES: Record<string, string> = { "engineering-lines": "engineering-misc" };

export interface Built {
  id: string;
  body: string;
  tier: Tier;
}

export interface BuildOptions {
  /** Build the slow sections too (default true). */
  slow?: boolean;
  /** Only these section ids (the headline pulls in every fast section). */
  only?: string[];
  /** The committed document: the ledger block is taken from it when the ledger file cannot be found. */
  previous?: string;
}

export async function buildSections(options: BuildOptions = {}): Promise<Built[]> {
  const { slow = true, previous } = options;
  const only = options.only?.map((id) => ALIASES[id] ?? id);
  const wanted = (id: string, tier: Tier): boolean => {
    if (only) return only.includes(id) || (id !== "headline" && tier === "fast" && only.includes("headline"));
    return tier === "fast" || tier === "ledger" || slow;
  };
  const facts: Facts = {};
  const built = new Map<string, Built>();
  const put = (id: string, tier: Tier, body: string): void => void built.set(id, { id, tier, body });

  if (wanted("modelfest", "fast")) put("modelfest", "fast", modelfestSection(facts));
  if (wanted("iris", "fast")) put("iris", "fast", await irisSection(facts));
  if (wanted("persona-found", "fast")) put("persona-found", "fast", await foundSection());
  if (wanted("persona-sight", "fast")) put("persona-sight", "fast", await sightSection(facts));
  if (wanted("ai", "fast")) put("ai", "fast", aiSection(facts));
  if (wanted("youcam", "fast")) put("youcam", "fast", youcamSection(facts));
  if (wanted("engineering-misc", "fast")) put("engineering-misc", "fast", engineeringFastSection(facts));
  if (wanted("vision", "fast")) put("vision", "fast", visionSection(facts));
  if (wanted("headline", "fast")) put("headline", "fast", headlineSection(facts));

  if (wanted("persona-worthit", "slow")) put("persona-worthit", "slow", await worthItSection());
  if (wanted("persona-coverage", "slow")) put("persona-coverage", "slow", await coverageSection());
  if (wanted("engineering-tests", "slow")) put("engineering-tests", "slow", engineeringTestsSection(measureTestCounts()));

  if (wanted("ledger", "ledger")) {
    const fresh = ledgerSection();
    if (fresh !== null) put("ledger", "ledger", fresh);
    else if (previous && hasBlock(previous, "ledger")) put("ledger", "ledger", extractBlock(previous, "ledger"));
    else put("ledger", "ledger", LEDGER_MANUAL);
  }
  return SECTIONS.flatMap((s) => (built.has(s.id) ? [built.get(s.id)!] : []));
}

function hasBlock(markdown: string, id: string): boolean {
  try {
    extractBlock(markdown, id);
    return true;
  } catch {
    return false;
  }
}

/** Everything the slow numbers depend on. Text files are hashed with LF endings so a Windows checkout agrees with CI. */
export function inputsFingerprint(): string {
  const files = new Set<string>();
  const add = (dir: string, accept: (rel: string) => boolean): void => listFiles(dir, accept).forEach((f) => files.add(f));
  add("lib", () => true);
  add("eval", (rel) => /\.(ts|json)$/.test(rel) && !/\/(results|raw|patches)\//.test(rel));
  add("app", (rel) => isTest(rel) || /^app\/api\/.*\/route\.ts$/.test(rel));
  add("tests/e2e", (rel) => rel.endsWith(".spec.ts"));
  add("fixtures/youcam", (rel) => !rel.endsWith(".md"));
  for (const f of ["scripts/docs/numbers.ts", "vitest.config.mts", "playwright.config.ts"]) files.add(f);
  const hash = createHash("sha256");
  for (const rel of [...files].sort()) {
    const raw = fs.readFileSync(`${ROOT}${rel}`);
    const content = /\.(ts|tsx|json|mts)$/.test(rel) ? Buffer.from(unix(raw.toString("utf8"))) : raw;
    hash.update(`${rel}\0${createHash("sha256").update(content).digest("hex")}\n`);
  }
  return hash.digest("hex").slice(0, 16);
}

export function slowDigest(built: Built[]): string {
  const hash = createHash("sha256");
  for (const b of built.filter((x) => x.tier === "slow")) hash.update(`${b.id}\0${b.body.trim()}\n`);
  return hash.digest("hex").slice(0, 16);
}

/** The block that ties the slow numbers to their inputs. */
export function fingerprintBody(built: Built[]): string {
  return [
    `Slow tables (3.2, 3.3 and 6.1) are not recomputed by \`npm test\`. Instead \`lib/vision/numbers.doc.test.ts\` checks two hashes:`,
    "",
    `- inputs: \`${inputsFingerprint()}\`. Every file under \`lib/\`, the \`eval/\` code, the unit tests, the e2e specs, \`fixtures/youcam/\` and this script. A change to any of them makes it differ.`,
    `- slow tables: \`${slowDigest(built)}\`. The tables above as committed, so a hand edit differs.`,
    "",
    "When either test fails, run `npx tsx scripts/docs/numbers.ts --write` and commit. `--check` recomputes everything, including the slow tables.",
  ].join("\n");
}

const INTRO = [
  "# Numbers ledger",
  "",
  "Every number quoted in the README, video and Devpost comes from this file. Regenerate with `npx tsx scripts/docs/numbers.ts --write`.",
  "",
  "The file is generated from the code, the recorded fixtures (`fixtures/youcam/`) and the committed results (`eval/results/`, `eval/llm-baseline/results/`). Each table says where a value comes from and how to get it again. Where a value cannot be computed it says **manual** and where it comes from. `npx tsx scripts/docs/numbers.ts --check` re-measures everything and fails on a difference, and `lib/vision/numbers.doc.test.ts` fails when this file is stale (see the last section). Tone and wording follow the product: distances, not grades.",
  "",
  "The four faces are synthetic (AI-generated) portraits; nobody real is shown.",
].join("\n");

export function renderDocument(built: Built[]): string {
  const fingerprint: Built = { id: "fingerprint", tier: "fast", body: fingerprintBody(built) };
  const parts: string[] = [INTRO];
  const wrap = (id: string, body: string): string => `<!-- generated:${id}:start -->\n\n${body.trim()}\n\n<!-- generated:${id}:end -->`;
  for (const def of SECTIONS) {
    const b = built.find((x) => x.id === def.id);
    if (!b) continue;
    parts.push(`${"#".repeat(def.level)} ${def.heading}`, wrap(def.id, b.body));
  }
  parts.push("## How this file stays true", wrap("fingerprint", fingerprint.body));
  return parts.join("\n\n") + "\n";
}

/** Blocks whose content `npm test` can compare in full: the fast ones, the fingerprint, and the ledger when it can be found. */
export function checkableIds(built: Built[]): string[] {
  return built.filter((b) => b.tier !== "slow").map((b) => b.id);
}

// ---------------------------------------------------------------------------------------------------------------
// Command line
// ---------------------------------------------------------------------------------------------------------------

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const sectionArg = args.indexOf("--section");
  const only = sectionArg >= 0 ? (args[sectionArg + 1] ?? "").split(",").filter(Boolean) : undefined;
  const slow = !args.includes("--fast");
  const previous = fs.existsSync(DOC_PATH) ? unix(fs.readFileSync(DOC_PATH, "utf8")) : undefined;

  if (only) {
    const built = await buildSections({ only, slow, previous });
    if (built.length === 0) throw new Error(`no such section: ${only.join(", ")} (ids: ${SECTIONS.map((s) => s.id).join(", ")})`);
    console.log(built.map((b) => b.body).join("\n\n"));
    return;
  }

  const built = await buildSections({ slow, previous });
  const text = renderDocument(built);
  if (args.includes("--write")) {
    if (!slow) throw new Error("--write needs the slow sections: do not combine it with --fast");
    if (previous === text) console.log("docs/NUMBERS.md: already up to date");
    else {
      fs.writeFileSync(DOC_PATH, text);
      console.log("docs/NUMBERS.md: written");
    }
  } else if (args.includes("--check")) {
    if (previous === undefined) {
      console.error("docs/NUMBERS.md does not exist. Run: npx tsx scripts/docs/numbers.ts --write");
      process.exit(1);
    }
    const stale = built.filter((b) => !hasBlock(previous, b.id) || extractBlock(previous, b.id) !== b.body.trim()).map((b) => b.id);
    if (!hasBlock(previous, "fingerprint") || extractBlock(previous, "fingerprint") !== fingerprintBody(built).trim()) stale.push("fingerprint");
    if (stale.length) {
      console.error(`docs/NUMBERS.md is stale: ${stale.join(", ")}. Run: npx tsx scripts/docs/numbers.ts --write`);
      process.exit(1);
    }
    console.log("docs/NUMBERS.md: current (every block re-measured)");
  } else {
    console.log(text);
  }
}

if (isMain(import.meta.url)) void main();
