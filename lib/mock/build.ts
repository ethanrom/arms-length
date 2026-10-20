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
import { DEFAULT_VIEWING } from "@/lib/contracts";

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
}

const median = (xs: number[]) => {
  const s = [...xs].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
};

/**
 * Builds a report whose per-target distances decay geometrically from the farthest to the median and below, so
 * the concern summary matches its targets exactly. Targets are ranked by the order of features given.
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
    const half = (ids.length - 1) / 2;
    const ratio = summary.medianM / summary.maxM;
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
    concerns.push({
      concern,
      targetCount: own.length,
      maxDistanceM: maxM,
      medianDistanceM: round(median(ds)),
      intervalM: [round(maxM * (1 - summary.relHalfWidth)), round(maxM * (1 + summary.relHalfWidth))],
      topTargets: own.slice(0, 5).map((t) => t.targetId),
      confidence: summary.confidence,
    });
  }

  concerns.sort((a, b) => a.maxDistanceM - b.maxDistanceM);
  return { viewing: DEFAULT_VIEWING, targets, concerns };
}

const round = (x: number) => Math.round(x * 100) / 100;
