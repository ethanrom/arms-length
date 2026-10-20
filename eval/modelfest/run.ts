/**
 * ModelFest harness: for a Detector, find each analytic stimulus's threshold contrast and compare it with
 * the observer-mean threshold (Watson & Ahumada 2005). Pure and deterministic; file output lives in eval/run.ts.
 */
import type { ContrastPatch, Detector, ViewingConditions } from "@/lib/contracts";
import thresholds from "./thresholds.json";
import {
  ANALYTIC_STIMULI,
  EXCLUDED_STIMULI,
  MODELFEST_DISTANCE_M,
  generateStimulus,
  type StimulusFamily,
} from "./stimuli";

/**
 * ModelFest ran at L0 = 30 +/- 5 cd/m^2, binocular, natural pupils, 20/20 observers. No safety margin: the
 * comparison is against the average observer.
 */
export const MODELFEST_VIEWING: ViewingConditions = {
  luminanceCdM2: 30,
  acuityScale: 1,
  label: "custom",
  marginDb: 0,
};

const LOG_LO = -6; // c = 1e-6, -120 dB
const LOG_HI = 3; // c = 1e3, +60 dB
const TOL_LOG10 = 1e-4; // 0.002 dB

const scaled = (patch: ContrastPatch, c: number): ContrastPatch => ({ ...patch, lum: patch.lum.map((v) => v * c) });

/**
 * Contrast scale at which `detector.response` crosses 1, by bisection in log10 contrast. Assumes the response
 * increases with contrast (true for any sensible detector). `patch` is taken as unit contrast.
 */
export function findThresholdContrast(
  detector: Detector,
  patch: ContrastPatch,
  viewing: ViewingConditions,
  distanceM: number,
): number {
  const respond = (logc: number) => detector.response(scaled(patch, 10 ** logc), viewing, distanceM);
  let lo = LOG_LO;
  let hi = LOG_HI;
  if (!(respond(hi) >= 1)) throw new Error("detector does not reach response 1 below contrast 1000");
  if (respond(lo) >= 1) throw new Error("detector already responds at contrast 1e-6");
  while (hi - lo > TOL_LOG10) {
    const mid = (lo + hi) / 2;
    if (respond(mid) >= 1) hi = mid;
    else lo = mid;
  }
  return 10 ** ((lo + hi) / 2);
}

export interface StimulusResult {
  id: number;
  name: string;
  family: StimulusFamily;
  skinRelevant: boolean;
  observedDb: number;
  observerSdDb: number;
  predictedDb: number;
  /** predicted - observed; positive = the model needs more contrast than observers did (under-predicts visibility). */
  errorDb: number;
}

export interface ModelFestReport {
  viewing: ViewingConditions;
  distanceM: number;
  results: StimulusResult[];
  excluded: { id: number; name: string; reason: string }[];
  /** RMS of errorDb over all analytic stimuli. */
  rmsAllDb: number;
  /** RMS over the skin-relevant subset: Gaussian blobs, the disk, the line and dipole, the edge (#26-32, #40). */
  rmsSkinDb: number;
  nAll: number;
  nSkin: number;
}

const rms = (xs: number[]): number => Math.sqrt(xs.reduce((a, x) => a + x * x, 0) / xs.length);

/** Reference numbers for context; these cover different stimulus sets, so they are not like-for-like. */
export const PUBLISHED_REFERENCE = {
  source:
    "Watson & Ahumada 2005, Table 5 (RMS over all 43 stimuli, incl. noise #35 and natural scene #43); subset values from our own re-implementation of Standard A on the original images",
  standardA: { rmsAll43Db: 1.0329, rmsAll41Db: 0.69, rmsSkinSubsetDb: 0.78 },
  standardB: { rmsAll43Db: 1.1216, rmsAll41Db: 0.87, rmsSkinSubsetDb: 1.13 },
  /** RMS0: spread of a model that predicts every stimulus with the observer mean; the floor of observer noise. */
  observerRms0Db: 3.46,
};

export function runModelFest(
  detector: Detector,
  opts: { viewing?: ViewingConditions; distanceM?: number; ids?: number[] } = {},
): ModelFestReport {
  const viewing = opts.viewing ?? MODELFEST_VIEWING;
  const distanceM = opts.distanceM ?? MODELFEST_DISTANCE_M;
  const observed = new Map(thresholds.stimuli.map((t) => [t.id, t]));

  const results: StimulusResult[] = ANALYTIC_STIMULI.filter((s) => !opts.ids || opts.ids.includes(s.id)).map((s) => {
    const obs = observed.get(s.id);
    if (!obs) throw new Error(`no observed threshold for #${s.id}`);
    const c = findThresholdContrast(detector, generateStimulus(s.id, distanceM), viewing, distanceM);
    const predictedDb = 20 * Math.log10(c);
    return {
      id: s.id,
      name: s.name,
      family: s.family,
      skinRelevant: s.skinRelevant,
      observedDb: obs.thresholdDb,
      observerSdDb: obs.sdDb,
      predictedDb,
      errorDb: predictedDb - obs.thresholdDb,
    };
  });
  const skin = results.filter((r) => r.skinRelevant);
  return {
    viewing,
    distanceM,
    results,
    excluded: EXCLUDED_STIMULI.map((s) => ({ id: s.id, name: s.name, reason: s.excludedReason ?? "" })),
    rmsAllDb: rms(results.map((r) => r.errorDb)),
    rmsSkinDb: rms(skin.map((r) => r.errorDb)),
    nAll: results.length,
    nSkin: skin.length,
  };
}
