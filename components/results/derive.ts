import type { Box, ConcernVisibility, Feature, Point, RegionMeasure } from "@/lib/contracts";
import type { ConcernCopy, ResultsData } from "./types";

export type Target = Feature | RegionMeasure;

/** One concern with everything the cards, the overlay and the Step back labels need. */
export interface ConcernView {
  id: string;
  visibility: ConcernVisibility;
  copy: ConcernCopy;
  /** Out of sight by `reliefWithinM`. */
  relief: boolean;
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
    const top = targets.find((t) => t.id === visibility.topTargets[0]) ?? targets[0];
    views.push({
      id: visibility.concern,
      visibility,
      copy,
      relief: visibility.maxDistanceM <= data.reliefWithinM,
      targets,
      topIds: new Set(visibility.topTargets),
      anchor: centre(top.bbox),
      bounds: union(targets.map((t) => t.bbox)),
    });
  }
  return views.sort((a, b) => a.visibility.maxDistanceM - b.visibility.maxDistanceM);
}
