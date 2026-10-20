/**
 * Visibility report: per-target distances and their per-concern aggregation.
 *
 * Aggregation per concern (only concerns with `visibility: true`; targets without a usable size or contrast are
 * left out of both lists):
 *   maxDistanceM     the farthest any one target stays detectable ("visible from up to X")
 *   medianDistanceM  median over all the concern's targets, vanished ones (distance 0) included
 *   intervalM        the scale-uncertainty interval of the max target
 *   topTargets       ids of the (at most 5) most visible targets, most visible first
 *   profile          at each PROFILE_DISTANCES_M entry, how many targets have a bound distance at or beyond it. This is the
 *                    summary for many-feature concerns: unlike the max it does not hinge on one outlier. Regions are
 *                    included (for a handful of zones it is a step function).
 *   nominalProfile   the same count from each target's nominal distance (average observer, margin 0). Visible-side
 *                    claims ("a typical sharp-eyed person could pick out ...") read this one; relief claims ("even perfect
 *                    eyes couldn't ...") read the bound `profile`. Nominal is never above the bound.
 *   nominalMaxDistanceM  the farthest nominal distance, the nominal twin of maxDistanceM.
 * Concerns are returned most visible first (ties broken by concern id) so the output is deterministic.
 *
 * Confidence rule, applied to the headline (max) target:
 *   base by concern, how well the measurement of that concern is anchored:
 *     high    age_spot, wrinkle, dark_circle (sharp mask outlines / lines / regions)
 *     medium  pore, eye_bag, redness (location-only markers, or soft-edged regions)
 *     low     acne (17 px ring markers say where, not how big), texture
 *   then capped by where the size came from: "mask" keeps the base, "photo" caps at medium, "prior" gives low
 *   (regions carry no size source: their extent is always read from the mask).
 *   A scale estimate that is only "assumed" (no iris or card) makes every concern low.
 */
import { CONCERNS, type ConcernId } from "../contracts/concerns";
import type { Feature, Measurements, RegionMeasure } from "../contracts/measure";
import {
  DEFAULT_VIEWING,
  PROFILE_DISTANCES_M,
  type ConcernVisibility,
  type TargetVisibility,
  type ViewingConditions,
  type VisibilityReport,
} from "../contracts/vision";
import { specFromTarget, visibilityOfSpec } from "./visibility";

type Confidence = ConcernVisibility["confidence"];

/**
 * Nominal companions of ConcernVisibility, optional until the frozen contract adds them (proposed names, same shapes as
 * `profile` and `maxDistanceM`). Missing on reports built before nominal distances existed; the copy then estimates them
 * from the bound.
 */
export interface NominalFields {
  nominalProfile?: NonNullable<ConcernVisibility["profile"]>;
  nominalMaxDistanceM?: number;
}
export type ConcernVisibilityExt = ConcernVisibility & NominalFields;
export type VisibilityReportExt = Omit<VisibilityReport, "concerns"> & { concerns: ConcernVisibilityExt[] };

const BASE_CONFIDENCE: Record<ConcernId, Confidence> = {
  age_spot: "high",
  wrinkle: "high",
  dark_circle: "high",
  pore: "medium",
  eye_bag: "medium",
  redness: "medium",
  acne: "low",
  texture: "low",
};

const RANK: Record<Confidence, number> = { low: 0, medium: 1, high: 2 };
const min = (a: Confidence, b: Confidence): Confidence => (RANK[a] <= RANK[b] ? a : b);

export function concernConfidence(
  concern: ConcernId,
  headline: Feature | RegionMeasure,
  scaleSource: Measurements["scale"]["source"],
): Confidence {
  if (scaleSource === "assumed") return "low";
  const base = BASE_CONFIDENCE[concern];
  const source = "sizeSource" in headline ? headline.sizeSource : "mask";
  if (source === "prior") return "low";
  if (source === "photo") return min(base, "medium");
  return base;
}

function median(sorted: number[]): number {
  const n = sorted.length;
  if (n === 0) return 0;
  return n % 2 ? sorted[(n - 1) / 2] : (sorted[n / 2 - 1] + sorted[n / 2]) / 2;
}

const MAX_TOP_TARGETS = 5;

/** `distances` must be the targets' bound distances; a target counts at d when it stays detectable out to d. */
export function detectabilityProfile(distances: readonly number[]): NonNullable<ConcernVisibility["profile"]> {
  return PROFILE_DISTANCES_M.map((distanceM) => {
    const count = distances.filter((x) => x >= distanceM).length;
    return { distanceM, count, fraction: distances.length ? count / distances.length : 0 };
  });
}

export function buildVisibilityReport(measurements: Measurements, viewing: ViewingConditions = DEFAULT_VIEWING): VisibilityReportExt {
  const { scale } = measurements;
  const source = new Map<string, Feature | RegionMeasure>();
  const targets: TargetVisibility[] = [];
  for (const target of [...measurements.features, ...measurements.regions]) {
    if (!CONCERNS[target.concern].visibility) continue;
    const spec = specFromTarget(target, scale);
    if (!spec) continue;
    source.set(target.id, target);
    targets.push(visibilityOfSpec(spec, scale, viewing));
  }

  const byConcern = new Map<ConcernId, TargetVisibility[]>();
  for (const t of targets) {
    const list = byConcern.get(t.concern);
    if (list) list.push(t);
    else byConcern.set(t.concern, [t]);
  }

  const concerns: ConcernVisibilityExt[] = [];
  for (const [concern, list] of byConcern) {
    // Most visible first; equal distances keep the input order (sort is stable).
    const ranked = [...list].sort((a, b) => b.distanceM - a.distanceM);
    const head = ranked[0];
    const distances = list.map((t) => t.distanceM).sort((a, b) => a - b);
    const nominals = list.map((t) => t.nominalM);
    const nominal = nominals.every((x): x is number => x !== undefined)
      ? { nominalProfile: detectabilityProfile(nominals), nominalMaxDistanceM: Math.max(...nominals) }
      : {};
    concerns.push({
      concern,
      targetCount: list.length,
      maxDistanceM: head.distanceM,
      medianDistanceM: median(distances),
      intervalM: head.intervalM,
      topTargets: ranked.slice(0, MAX_TOP_TARGETS).map((t) => t.targetId),
      profile: detectabilityProfile(distances),
      ...nominal,
      confidence: concernConfidence(concern, source.get(head.targetId) as Feature | RegionMeasure, scale.source),
    });
  }
  concerns.sort((a, b) => b.maxDistanceM - a.maxDistanceM || a.concern.localeCompare(b.concern));

  return { viewing, targets, concerns };
}
