/**
 * Which part of the face to show up close: the detail loupe on the Step back hero, and the local crops that stand in for a
 * whole-face "after" in "Worth it?" and "The lightest touch". Pure and deterministic; boxes are in frame px.
 */
import { CONCERNS, type Box, type ConcernId, type Feature, type RegionMeasure, type Size2, type TargetVisibility } from "@/lib/contracts";

export type Target = Feature | RegionMeasure;

interface Weighted {
  x: number;
  y: number;
  weight: number;
}

/** The loupe magnifies this much, relative to the face as drawn in the hero. */
export const LOUPE_MAGNIFICATION = 3;
/** Width of the loupe's patch as a share of the frame width, and its aspect (w / h). */
export const LOUPE_WIDTH_FRAC = 0.27;
export const LOUPE_ASPECT = 4 / 3;

/** A mark counts more when the loupe can show it fading: it must drop out of sight somewhere on the slider's range. */
const FADES_FROM_M = 0.3;
const FADES_BY_M = 4;
const STEADY_WEIGHT = 0.25;

/** Marks that read as "what fades": the more pores and spots in the patch, the more there is to watch. */
const LOUPE_WEIGHT: Partial<Record<ConcernId, number>> = { pore: 1, age_spot: 4, acne: 3 };

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

/** The window of size (w, h), centred inside `zone` and fitting the frame, that holds the most weight; ties go to the one nearest the zone's centre. */
function densestWindow(points: Weighted[], frame: Size2, w: number, h: number, zone: Box): Box {
  const x0 = clamp(zone.x, w / 2, frame.width - w / 2);
  const x1 = clamp(zone.x + zone.w, w / 2, frame.width - w / 2);
  const y0 = clamp(zone.y, h / 2, frame.height - h / 2);
  const y1 = clamp(zone.y + zone.h, h / 2, frame.height - h / 2);
  const steps = 14;
  const cxMid = (x0 + x1) / 2;
  const cyMid = (y0 + y1) / 2;
  let best = { cx: cxMid, cy: cyMid, score: -1, dist: Infinity };
  for (let i = 0; i <= steps; i++) {
    for (let j = 0; j <= steps; j++) {
      const cx = x0 + ((x1 - x0) * i) / steps;
      const cy = y0 + ((y1 - y0) * j) / steps;
      let score = 0;
      for (const p of points) if (Math.abs(p.x - cx) <= w / 2 && Math.abs(p.y - cy) <= h / 2) score += p.weight;
      const dist = Math.hypot(cx - cxMid, cy - cyMid);
      if (score > best.score + 1e-9 || (Math.abs(score - best.score) <= 1e-9 && dist < best.dist)) best = { cx, cy, score, dist };
    }
  }
  return { x: best.cx - w / 2, y: best.cy - h / 2, w, h };
}

/**
 * The patch of cheek and nose with the most pores and spots that fade within the slider's range: the loupe magnifies it.
 * The patch sits below the eyes (the lower edge of the under-eye areas, when the analysis found them) and above the
 * mouth (where the pores stop). Falls back to the middle of the face when nothing was found.
 */
export function loupePatch(features: readonly Feature[], targets: readonly TargetVisibility[], frame: Size2, regions: readonly RegionMeasure[] = []): Box {
  const w = frame.width * LOUPE_WIDTH_FRAC;
  const h = w / LOUPE_ASPECT;
  const nominal = new Map(targets.map((t) => [t.targetId, t.nominalM ?? t.distanceM]));
  const marks = features.filter((f) => LOUPE_WEIGHT[f.concern]);
  if (marks.length === 0) return { x: (frame.width - w) / 2, y: frame.height * 0.45 - h / 2, w, h };

  // The face as pores see it: its extent, then the band below the eyes and above the mouth.
  const pores = marks.filter((f) => f.concern === "pore");
  const extent = (pores.length >= 20 ? pores : marks).map((f) => f.centroid);
  const minX = Math.min(...extent.map((p) => p.x));
  const maxX = Math.max(...extent.map((p) => p.x));
  const minY = Math.min(...extent.map((p) => p.y));
  const maxY = Math.max(...extent.map((p) => p.y));
  const eyes = regions.filter((r) => r.concern === "dark_circle" || r.concern === "eye_bag");
  const belowEyes = eyes.length ? Math.max(...eyes.map((r) => r.bbox.y + r.bbox.h)) : minY + (maxY - minY) * 0.45;
  // The zone is where the patch's centre may sit: far enough below the eyes that the patch clears them.
  const top = Math.min(belowEyes + h / 2, maxY - h * 0.1);
  const zone: Box = {
    x: minX + (maxX - minX) * 0.12,
    y: top,
    w: (maxX - minX) * 0.76,
    h: Math.max(0, maxY - (maxY - top) * 0.1 - top),
  };

  const points = marks.map((f): Weighted => {
    const d = nominal.get(f.id);
    const fades = d !== undefined && d >= FADES_FROM_M && d <= FADES_BY_M;
    return { x: f.centroid.x, y: f.centroid.y, weight: (LOUPE_WEIGHT[f.concern] ?? 0) * (fades ? 1 : STEADY_WEIGHT) };
  });
  return densestWindow(points, frame, w, h, zone);
}

/** `box` grown by `pad` (a share of its size) and clamped into the frame, with the aspect kept between the two limits. */
export function paddedBox(box: Box, frame: Size2, pad: number, minAspect: number, maxAspect: number): Box {
  let w = box.w * (1 + pad * 2);
  let h = box.h * (1 + pad * 2);
  const cx = box.x + box.w / 2;
  const cy = box.y + box.h / 2;
  if (w / h > maxAspect) h = w / maxAspect;
  else if (w / h < minAspect) w = h * minAspect;
  w = Math.min(w, frame.width);
  h = Math.min(h, frame.height);
  return { x: clamp(cx - w / 2, 0, frame.width - w), y: clamp(cy - h / 2, 0, frame.height - h), w, h };
}

const centroidOf = (t: Target) => ("centroid" in t ? t.centroid : { x: t.bbox.x + t.bbox.w / 2, y: t.bbox.y + t.bbox.h / 2 });

/**
 * The part of the face a concern lives on, for a local before/after crop. Areas (under-eye shadows and puffiness, redness)
 * get a box round all of them; many small marks get the busiest patch of the face rather than the whole face.
 */
export function concernCrop(concern: ConcernId, targets: readonly Target[], frame: Size2): Box {
  const mine = targets.filter((t) => t.concern === concern);
  const whole: Box = { x: 0, y: 0, w: frame.width, h: frame.height };
  if (mine.length === 0) return whole;
  const kind = CONCERNS[concern].maskKind;
  if (kind === "region") {
    const x0 = Math.min(...mine.map((t) => t.bbox.x));
    const y0 = Math.min(...mine.map((t) => t.bbox.y));
    const x1 = Math.max(...mine.map((t) => t.bbox.x + t.bbox.w));
    const y1 = Math.max(...mine.map((t) => t.bbox.y + t.bbox.h));
    return paddedBox({ x: x0, y: y0, w: x1 - x0, h: y1 - y0 }, frame, 0.3, 1.2, 2.4);
  }
  const w = frame.width * (concern === "wrinkle" ? 0.36 : 0.3);
  const h = w / LOUPE_ASPECT;
  const points = mine.map((t): Weighted => {
    const c = centroidOf(t);
    return { x: c.x, y: c.y, weight: 1 };
  });
  const xs = points.map((p) => p.x);
  const ys = points.map((p) => p.y);
  const zone: Box = { x: Math.min(...xs), y: Math.min(...ys), w: Math.max(...xs) - Math.min(...xs), h: Math.max(...ys) - Math.min(...ys) };
  return densestWindow(points, frame, w, h, zone);
}
