/** Bound and nominal distance of every measured feature of a face: the scan the report runs, kept per feature. */
import type { ConcernId, Feature, ScaleEstimate, ViewingConditions } from "@/lib/contracts";
import { rawDistances, specFromTarget } from "@/lib/vision/visibility";

export interface FeatureReach {
  id: string;
  concern: ConcernId;
  /** Farthest distance for even perfect eyes (the one-sided bound), m, uncapped up to 50. */
  boundM: number;
  /** Farthest distance for a typical sharp-eyed person (margin 0), m. */
  nominalM: number;
}

/** Features without a usable size or contrast are left out, as in the report. */
export function computeReaches(features: readonly Feature[], scale: ScaleEstimate, viewing: ViewingConditions): FeatureReach[] {
  const out: FeatureReach[] = [];
  for (const f of features) {
    const spec = specFromTarget(f, scale);
    if (!spec) continue;
    const r = rawDistances(spec, viewing);
    out.push({ id: f.id, concern: f.concern, boundM: r.bound, nominalM: r.nominal });
  }
  return out;
}

/** Reaches of one concern, as parallel arrays. */
export function reachesOf(reaches: readonly FeatureReach[], concern: ConcernId): { bound: number[]; nominal: number[]; ids: string[] } {
  const mine = reaches.filter((r) => r.concern === concern);
  return { bound: mine.map((r) => r.boundM), nominal: mine.map((r) => r.nominalM), ids: mine.map((r) => r.id) };
}
