/** The committed ModelFest run (eval/results/modelfest.json) as plot points, and its summary statistics recomputed. */
import report from "@/eval/results/modelfest.json";

export interface ModelFestPoint {
  id: number;
  name: string;
  family: string;
  skinRelevant: boolean;
  observedDb: number;
  predictedDb: number;
  errorDb: number;
  observerSdDb: number;
}

export const MODELFEST_POINTS: readonly ModelFestPoint[] = report.results.map((r) => ({
  id: r.id,
  name: r.name,
  family: r.family,
  skinRelevant: r.skinRelevant,
  observedDb: r.observedDb,
  predictedDb: r.predictedDb,
  errorDb: r.errorDb,
  observerSdDb: r.observerSdDb,
}));

export function rms(values: readonly number[]): number {
  return Math.sqrt(values.reduce((a, x) => a + x * x, 0) / values.length);
}

export interface ModelFestSummary {
  rmsAllDb: number;
  rmsSkinDb: number;
  nAll: number;
  nSkin: number;
  paperRms43Db: number;
  paperN: number;
  observerRms0Db: number;
}

/** RMS error over all points and over the skin-like subset, recomputed from the points; the paper's number for context. */
export function summarize(points: readonly ModelFestPoint[] = MODELFEST_POINTS): ModelFestSummary {
  const skin = points.filter((p) => p.skinRelevant);
  return {
    rmsAllDb: rms(points.map((p) => p.errorDb)),
    rmsSkinDb: rms(skin.map((p) => p.errorDb)),
    nAll: points.length,
    nSkin: skin.length,
    paperRms43Db: report.published.standardA.rmsAll43Db,
    paperN: 43,
    observerRms0Db: report.published.observerRms0Db,
  };
}

/** The numbers the committed file itself reports, for the unit test that checks the two agree. */
export const FILE_SUMMARY = { rmsAllDb: report.rmsAllDb, rmsSkinDb: report.rmsSkinDb, nAll: report.nAll, nSkin: report.nSkin };
