/**
 * Small constructors for the mock persona data: they keep the hand-placed features readable and make the
 * VisibilityReport consistent with the Measurements it is built from. Illustrative numbers only.
 */
import type {
  Box,
  ConcernId,
  ConcernVisibility,
  Feature,
  Measurements,
  RegionMeasure,
  ScaleEstimate,
  TargetVisibility,
  VisibilityReport,
} from "@/lib/contracts";
import { DEFAULT_VIEWING, PROFILE_DISTANCES_M } from "@/lib/contracts";

export function spot(
  scale: ScaleEstimate,
  concern: ConcernId,
  index: number,
  cx: number,
  cy: number,
  diameterMm: number,
  lum: number,
  rg = 0,
  region = "whole",
  sizeSource: Feature["sizeSource"] = "mask",
): Feature {
  const dPx = diameterMm / scale.mmPerPx;
  return {
    id: `${concern}:${index}`,
    concern,
    shape: "spot",
    region,
    centroid: { x: cx, y: cy },
    bbox: { x: cx - dPx / 2, y: cy - dPx / 2, w: dPx, h: dPx },
    areaPx: Math.PI * (dPx / 2) ** 2,
    diameterMm,
    sizeSource,
    contrast: { lum, rg },
  };
}

export function line(
  scale: ScaleEstimate,
  concern: ConcernId,
  index: number,
  bbox: Box,
  lum: number,
  region = "whole",
): Feature {
  const lengthMm = Math.max(bbox.w, bbox.h) * scale.mmPerPx;
  const widthMm = 0.35;
  return {
    id: `${concern}:${index}`,
    concern,
    shape: "line",
    region,
    centroid: { x: bbox.x + bbox.w / 2, y: bbox.y + bbox.h / 2 },
    bbox,
    areaPx: (lengthMm * widthMm) / (scale.mmPerPx * scale.mmPerPx),
    lengthMm,
    widthMm,
    sizeSource: "mask",
    contrast: { lum, rg: 0 },
  };
}

export function patch(
  scale: ScaleEstimate,
  concern: ConcernId,
  index: number,
  bbox: Box,
  lum: number,
  rg: number,
  reference: string,
): RegionMeasure {
  return {
    id: `${concern}:${index}`,
    concern,
    bbox,
    areaPx: Math.PI * (bbox.w / 2) * (bbox.h / 2),
    widthMm: bbox.w * scale.mmPerPx,
    heightMm: bbox.h * scale.mmPerPx,
    contrast: { lum, rg },
    reference,
  };
}

export interface ConcernSummary {
  maxM: number;
  medianM: number;
  /** Relative half-width of the interval at about 95%. Wider when sizes are assumed, not measured. */
  relHalfWidth: number;
  confidence: ConcernVisibility["confidence"];
  /** Many-feature concerns: how many marks YouCam found (the denominator of the profile). */
  population?: number;
  /** Fraction still detectable at each PROFILE_DISTANCES_M entry. Must be zero beyond maxM. */
  survival?: readonly number[];
}

const median = (xs: number[]) => {
  const s = [...xs].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
};

/** Distance where the profile crosses 50%, by interpolation on the log axis. */
function halfLife(survival: readonly number[]): number {
  const d = PROFILE_DISTANCES_M;
  if (survival[0] <= 0.5) return d[0];
  for (let i = 1; i < d.length; i++) {
    if (survival[i] <= 0.5) {
      const t = (survival[i - 1] - 0.5) / (survival[i - 1] - survival[i]);
      return d[i - 1] * Math.pow(d[i] / d[i - 1], t);
    }
  }
  return d[d.length - 1];
}

/**
 * Builds a report whose per-target distances decay geometrically from the farthest to the median and below, so
 * the concern summary matches its targets exactly. Targets are ranked by the order of features given.
 * Concerns with a survival curve also get a profile (count and fraction detectable at fixed distances)
 * and their median comes from it.
 */
export function buildReport(measurements: Measurements, summaries: Partial<Record<ConcernId, ConcernSummary>>): VisibilityReport {
  const targets: TargetVisibility[] = [];
  const concerns: ConcernVisibility[] = [];

  for (const [concern, summary] of Object.entries(summaries) as [ConcernId, ConcernSummary][]) {
    const ids = [
      ...measurements.features.filter((f) => f.concern === concern).map((f) => f.id),
      ...measurements.regions.filter((r) => r.concern === concern).map((r) => r.id),
    ];
    if (ids.length === 0) continue;
    const medianM = summary.survival ? halfLife(summary.survival) : summary.medianM;
    const half = (ids.length - 1) / 2;
    const ratio = medianM / summary.maxM;
    const own: TargetVisibility[] = ids.map((targetId, i) => {
      const d = ids.length === 1 ? summary.maxM : summary.maxM * Math.pow(ratio, i / Math.max(half, 0.5));
      return {
        targetId,
        concern,
        distanceM: round(d),
        intervalM: [round(d * (1 - summary.relHalfWidth)), round(d * (1 + summary.relHalfWidth))],
      };
    });
    targets.push(...own);
    const ds = own.map((t) => t.distanceM);
    const maxM = Math.max(...ds);
    const population = summary.population ?? own.length;
    concerns.push({
      concern,
      targetCount: population,
      maxDistanceM: maxM,
      medianDistanceM: summary.survival ? round(medianM) : round(median(ds)),
      intervalM: [round(maxM * (1 - summary.relHalfWidth)), round(maxM * (1 + summary.relHalfWidth))],
      topTargets: own.slice(0, 5).map((t) => t.targetId),
      confidence: summary.confidence,
      ...(summary.survival
        ? {
            profile: PROFILE_DISTANCES_M.map((distanceM, i) => {
              const count = Math.round(population * summary.survival![i]);
              return { distanceM, count, fraction: count / population };
            }),
          }
        : {}),
    });
  }

  concerns.sort((a, b) => a.maxDistanceM - b.maxDistanceM);
  return { viewing: DEFAULT_VIEWING, targets, concerns };
}

const round = (x: number) => Math.round(x * 100) / 100;
