/** Picking a measured feature on the photo: by pointer (nearest) and by keyboard (the next one in a direction). */
import type { Box, Feature, Point } from "@/lib/contracts";

export type Direction = "left" | "right" | "up" | "down";

/** Distance from a point to a box (0 inside it). */
export function distanceToBox(p: Point, b: Box): number {
  const dx = Math.max(b.x - p.x, 0, p.x - (b.x + b.w));
  const dy = Math.max(b.y - p.y, 0, p.y - (b.y + b.h));
  return Math.hypot(dx, dy);
}

/** The feature nearest to a point (by its box, so a long line is hit anywhere along it), within `maxDistance` px of the frame. */
export function nearestFeature(features: readonly Feature[], p: Point, maxDistance: number): Feature | null {
  let best: Feature | null = null;
  let bestD = maxDistance;
  for (const f of features) {
    const d = distanceToBox(p, f.bbox);
    if (d <= bestD) {
      best = f;
      bestD = d;
    }
  }
  return best;
}

const centre = (f: Feature): Point => f.centroid;

/**
 * The nearest feature lying in a direction from `from`: inside a 90 degree cone around the direction, ranked by distance
 * along the axis plus twice the sideways offset, so the walk stays on its row or column. Null at the edge of the set.
 */
export function neighbourInDirection(features: readonly Feature[], from: Feature, dir: Direction): Feature | null {
  const o = centre(from);
  let best: Feature | null = null;
  let bestScore = Infinity;
  for (const f of features) {
    if (f.id === from.id) continue;
    const c = centre(f);
    const dx = c.x - o.x;
    const dy = c.y - o.y;
    const along = dir === "right" ? dx : dir === "left" ? -dx : dir === "down" ? dy : -dy;
    const across = dir === "left" || dir === "right" ? Math.abs(dy) : Math.abs(dx);
    if (along <= 0 || across > along) continue;
    const score = along + 2 * across;
    if (score < bestScore) {
      best = f;
      bestScore = score;
    }
  }
  return best;
}

/** The previous or next feature in list order (wraps), for Page Up / Page Down and the step buttons. */
export function stepFeature(features: readonly Feature[], from: Feature | null, delta: 1 | -1): Feature | null {
  if (features.length === 0) return null;
  const i = from ? features.findIndex((f) => f.id === from.id) : -1;
  const next = i < 0 ? (delta === 1 ? 0 : features.length - 1) : (i + delta + features.length) % features.length;
  return features[next];
}
