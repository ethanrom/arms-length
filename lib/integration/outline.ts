/**
 * The YouCam mask outline of one measured target, for the "How we know" receipt: step 1, "YouCam found it here".
 *
 * Measurements keep boxes and centroids, not pixels, so the outline is read from the concern's "whole" mask again:
 * the foreground component under the target (holes filled for contour masks), traced round its outer edge and
 * simplified to a polygon of a few dozen points. Pure and DOM-free; used at build time and in the live worker.
 */
import { CONCERNS, type Box, type Feature, type Point, type RegionMeasure, type RgbaImage } from "@/lib/contracts";
import { binariseDiff, connectedComponents, fillHoles, foregroundOf } from "@/lib/skin/masks";
import { REGION_EXTENT_FRACTION, REGION_MIN_DIFF } from "@/lib/skin/params";

const PAD_PX = 4;
const MAX_POINTS = 60;

/** Moore-neighbour tracing of the outer boundary of the single 8-connected blob in `binary` that contains `start`. */
function traceOuter(binary: Uint8Array, w: number, h: number): Point[] {
  const at = (x: number, y: number) => (x >= 0 && y >= 0 && x < w && y < h ? binary[y * w + x] : 0);
  let sx = -1;
  let sy = -1;
  for (let y = 0; y < h && sx < 0; y++) {
    for (let x = 0; x < w; x++) {
      if (binary[y * w + x]) {
        sx = x;
        sy = y;
        break;
      }
    }
  }
  if (sx < 0) return [];
  // Clockwise neighbours starting from west.
  const nx = [-1, -1, 0, 1, 1, 1, 0, -1];
  const ny = [0, -1, -1, -1, 0, 1, 1, 1];
  const out: Point[] = [{ x: sx, y: sy }];
  let cx = sx;
  let cy = sy;
  let dir = 0; // entered the start pixel from the west (the pixel to its west is background by scan order)
  const limit = 4 * w * h;
  for (let step = 0; step < limit; step++) {
    let found = false;
    for (let k = 0; k < 8; k++) {
      const d = (dir + k) % 8;
      const x = cx + nx[d];
      const y = cy + ny[d];
      if (at(x, y)) {
        cx = x;
        cy = y;
        // The next search starts at the background pixel examined last, which touches the new pixel.
        dir = d % 2 === 0 ? (d + 6) % 8 : (d + 5) % 8;
        found = true;
        break;
      }
    }
    if (!found) break; // isolated pixel
    // Jacob's criterion: done when back on the start pixel with the same backtrack as at the beginning.
    if (cx === sx && cy === sy && dir === 0) break;
    out.push({ x: cx, y: cy });
  }
  return out;
}

function perpendicularDistance(p: Point, a: Point, b: Point): number {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const len = Math.hypot(dx, dy);
  if (len === 0) return Math.hypot(p.x - a.x, p.y - a.y);
  return Math.abs(dy * p.x - dx * p.y + b.x * a.y - b.y * a.x) / len;
}

/** Ramer-Douglas-Peucker on an open polyline. */
function simplifyOpen(points: Point[], epsilon: number): Point[] {
  if (points.length < 3) return points;
  let index = 0;
  let max = 0;
  for (let i = 1; i < points.length - 1; i++) {
    const d = perpendicularDistance(points[i], points[0], points[points.length - 1]);
    if (d > max) {
      max = d;
      index = i;
    }
  }
  if (max <= epsilon) return [points[0], points[points.length - 1]];
  const left = simplifyOpen(points.slice(0, index + 1), epsilon);
  const right = simplifyOpen(points.slice(index), epsilon);
  return [...left.slice(0, -1), ...right];
}

/** Closed polygon simplification: split at the farthest pair of anchors so no vertex is privileged. */
export function simplifyClosed(points: Point[], maxPoints = MAX_POINTS): Point[] {
  if (points.length <= 4) return points;
  const a = points[0];
  let far = 0;
  let farD = -1;
  points.forEach((p, i) => {
    const d = (p.x - a.x) ** 2 + (p.y - a.y) ** 2;
    if (d > farD) {
      farD = d;
      far = i;
    }
  });
  const first = points.slice(0, far + 1);
  const second = [...points.slice(far), points[0]];
  let epsilon = 0.6;
  for (let k = 0; k < 12; k++) {
    const poly = [...simplifyOpen(first, epsilon).slice(0, -1), ...simplifyOpen(second, epsilon).slice(0, -1)];
    if (poly.length <= maxPoints) return poly;
    epsilon *= 1.5;
  }
  return points.filter((_, i) => i % Math.ceil(points.length / maxPoints) === 0);
}

const isFeature = (t: Feature | RegionMeasure): t is Feature => "shape" in t;
const round1 = (n: number) => Math.round(n * 10) / 10;

/**
 * Outline of `target` in frame px, from the concern's "whole" mask. Falls back to the target's bounding box when the
 * mask has no foreground under it (a mask that was not provided, or a target measured from another source).
 */
export function outlineOf(target: Feature | RegionMeasure, mask: RgbaImage | undefined): Point[] {
  const { x, y, w, h } = target.bbox;
  const fallback: Point[] = [
    { x, y },
    { x: x + w, y },
    { x: x + w, y: y + h },
    { x, y: y + h },
  ];
  if (!mask) return fallback;

  const x0 = Math.max(0, Math.floor(x) - PAD_PX);
  const y0 = Math.max(0, Math.floor(y) - PAD_PX);
  const x1 = Math.min(mask.width, Math.ceil(x + w) + PAD_PX);
  const y1 = Math.min(mask.height, Math.ceil(y + h) + PAD_PX);
  const cw = x1 - x0;
  const ch = y1 - y0;
  if (cw <= 0 || ch <= 0) return fallback;

  const fg = foregroundOf(mask, CONCERNS[target.concern].maskKind === "region" ? 1 : undefined);
  const window = new Uint8Array(cw * ch);
  const binary =
    CONCERNS[target.concern].maskKind === "region"
      ? binariseDiff(fg.diff, Math.max(REGION_MIN_DIFF, REGION_EXTENT_FRACTION * fg.maxDiff))
      : fg.binary;
  for (let j = 0; j < ch; j++) for (let i = 0; i < cw; i++) window[j * cw + i] = binary[(y0 + j) * mask.width + x0 + i];

  const filled = CONCERNS[target.concern].maskKind === "contour" ? fillHoles(window, cw, ch) : window;
  const comps = connectedComponents(filled, cw, ch);
  if (comps.length === 0) return fallback;

  // The component holding the target's centre; else the one whose centroid is nearest to it.
  const cx = (isFeature(target) ? target.centroid.x : x + w / 2) - x0;
  const cy = (isFeature(target) ? target.centroid.y : y + h / 2) - y0;
  let best = comps[0];
  let bestD = Infinity;
  for (const c of comps) {
    const d = (c.centroid.x - cx) ** 2 + (c.centroid.y - cy) ** 2;
    if (d < bestD) {
      best = c;
      bestD = d;
    }
  }
  const only = new Uint8Array(cw * ch);
  for (const p of best.pixels) only[p] = 1;
  const boundary = traceOuter(only, cw, ch);
  if (boundary.length < 3) {
    const b: Box = best.bbox;
    return [
      { x: x0 + b.x, y: y0 + b.y },
      { x: x0 + b.x + b.w, y: y0 + b.y },
      { x: x0 + b.x + b.w, y: y0 + b.y + b.h },
      { x: x0 + b.x, y: y0 + b.y + b.h },
    ];
  }
  // Pixel centres to pixel-edge coordinates: trace around the pixel boxes by offsetting 0.5.
  return simplifyClosed(boundary).map((p) => ({ x: round1(x0 + p.x + 0.5), y: round1(y0 + p.y + 0.5) }));
}
