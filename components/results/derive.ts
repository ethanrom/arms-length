import type { Box, ConcernVisibility, Feature, Point, RegionMeasure } from "@/lib/contracts";
import { fractionAt, type ProfilePoint } from "@/app/_lib/axis";
import type { ConcernCopy, ResultsData } from "./types";

export type Target = Feature | RegionMeasure;

/** One concern with everything the cards, the overlay and the Step back labels need. */
export interface ConcernView {
  id: string;
  visibility: ConcernVisibility;
  copy: ConcernCopy;
  /** Out of sight by `reliefWithinM`: for many-feature concerns, when most marks are gone by then. */
  relief: boolean;
  /** The distance that orders and labels the concern: where half its marks fade, or the single mark's distance. */
  keyDistanceM: number;
  /** Share of marks detectable at fixed distances, for concerns with many features (pores, spots, lines, acne). */
  profile: ProfilePoint[] | null;
  /** How many marks the concern has (the denominator of the profile). */
  total: number;
  targets: Target[];
  topIds: ReadonlySet<string>;
  /** Where to hang a label on the face: the centre of the most visible target. */
  anchor: Point;
  /** Union of all targets, in frame px. */
  bounds: Box;
}

const centre = (b: Box): Point => ({ x: b.x + b.w / 2, y: b.y + b.h / 2 });

function union(boxes: Box[]): Box {
  const x0 = Math.min(...boxes.map((b) => b.x));
  const y0 = Math.min(...boxes.map((b) => b.y));
  const x1 = Math.max(...boxes.map((b) => b.x + b.w));
  const y1 = Math.max(...boxes.map((b) => b.y + b.h));
  return { x: x0, y: y0, w: x1 - x0, h: y1 - y0 };
}

/** Concerns ordered by how far they carry: the least visible first, so relief leads. */
export function deriveConcernViews(data: ResultsData): ConcernView[] {
  const views: ConcernView[] = [];
  for (const visibility of data.report.concerns) {
    const copy = data.concerns.find((c) => c.concern === visibility.concern);
    if (!copy) continue;
    const targets: Target[] = [
      ...data.measurements.features.filter((f) => f.concern === visibility.concern),
      ...data.measurements.regions.filter((r) => r.concern === visibility.concern),
    ];
    if (targets.length === 0) continue;
    const keyDistanceM = visibility.profile ? visibility.medianDistanceM : visibility.maxDistanceM;
    const top = targets.find((t) => t.id === visibility.topTargets[0]) ?? targets[0];
    views.push({
      id: visibility.concern,
      visibility,
      copy,
      relief: keyDistanceM <= data.reliefWithinM,
      keyDistanceM,
      profile: visibility.profile ?? null,
      total: visibility.targetCount,
      targets,
      topIds: new Set(visibility.topTargets),
      anchor: centre(top.bbox),
      bounds: union(targets.map((t) => t.bbox)),
    });
  }
  return views.sort((a, b) => a.keyDistanceM - b.keyDistanceM);
}

export interface ConcernStatus {
  /** Most of it can still be seen (all of it, for a single area). */
  state: "most" | "some" | "none";
  /** Marks detectable now, for many-feature concerns. */
  count: number | null;
  total: number;
}

/** What an ideal observer can still pick out of this concern at a distance. */
export function statusAt(view: ConcernView, distanceM: number): ConcernStatus {
  if (!view.profile) {
    return { state: distanceM <= view.visibility.maxDistanceM ? "most" : "none", count: null, total: view.total };
  }
  const fraction = fractionAt(view.profile, distanceM);
  const count = Math.round(fraction * view.total);
  return { state: count === 0 ? "none" : fraction >= 0.5 ? "most" : "some", count, total: view.total };
}
