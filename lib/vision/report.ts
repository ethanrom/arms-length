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
 * Concerns are returned most visible first (ties broken by concern id) so the output is deterministic.
 *
 * Confidence rule, applied to the headline (max) target:
 *   base by concern, how well the measurement of that concern is anchored:
 *     high    age_spot, wrinkle, dark_circle (sharp mask outlines / lines / regions)
 *     medium  pore, eye_bag, redness (location-only markers, or soft-edged regions)
 *     low     acne (17 px ring markers say where, not how big), texture
 *   then capped by where the size came from: "mask" keeps the base, "photo" caps at medium, "prior" gives low
 *   (regions carry no size source: their extent is always read from the mask).
 *   Dark circles, eye bags, redness and wrinkles (COUNTERFACTUAL_CONCERNS) are low whenever the headline target's
 *   contrast was measured against its surround (`contrastBasis: "surround"`), because normal anatomy and lighting
 *   (eye-socket shading, fold shadows, lit cheeks) are part of that contrast. Only the counterfactual basis (photo vs
 *   Skin Simulation without the concern) keeps their base rating. A target with no basis recorded is not downgraded.
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
import { COUNTERFACTUAL_CONCERNS } from "../skin/params";
import { specFromTarget, visibilityOfSpec } from "./visibility";

type Confidence = ConcernVisibility["confidence"];

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
  if (headline.contrastBasis === "surround" && COUNTERFACTUAL_CONCERNS.includes(concern)) return "low";
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

export function buildVisibilityReport(measurements: Measurements, viewing: ViewingConditions = DEFAULT_VIEWING): VisibilityReport {
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

  const concerns: ConcernVisibility[] = [];
  for (const [concern, list] of byConcern) {
    // Most visible first; equal distances keep the input order (sort is stable).
    const ranked = [...list].sort((a, b) => b.distanceM - a.distanceM);
    const head = ranked[0];
    const distances = list.map((t) => t.distanceM).sort((a, b) => a - b);
    concerns.push({
      concern,
      targetCount: list.length,
      maxDistanceM: head.distanceM,
      medianDistanceM: median(distances),
      intervalM: head.intervalM,
      topTargets: ranked.slice(0, MAX_TOP_TARGETS).map((t) => t.targetId),
      profile: detectabilityProfile(distances),
      confidence: concernConfidence(concern, source.get(head.targetId) as Feature | RegionMeasure, scale.source),
    });
  }
  concerns.sort((a, b) => b.maxDistanceM - a.maxDistanceM || a.concern.localeCompare(b.concern));

  return { viewing, targets, concerns };
}
