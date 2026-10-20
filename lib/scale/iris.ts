/**
 * The iris as a ruler. The horizontal visible iris diameter (white-to-white corneal diameter) is about 11.71 mm
 * with an SD of 0.42 mm (Rüfer F, Schröder A, Erb C. "White-to-white corneal diameter: normal values in healthy
 * humans obtained with the Orbscan II topography system." Cornea 2005;24(3):259-261). So one iris gives
 * millimetres per pixel on the face plane, with about 3.6% of population spread before any measurement error.
 */
import type { ScaleEstimate, Size2 } from "@/lib/contracts";

/** MediaPipe Face Landmarker output: x, y normalised to image width and height; z is roughly in width units. */
export interface Landmark {
  x: number;
  y: number;
  z?: number;
}

export const IRIS_DIAMETER_MM = 11.71;
export const IRIS_DIAMETER_SD_MM = 0.42;
export const IRIS_POPULATION_REL_SD = IRIS_DIAMETER_SD_MM / IRIS_DIAMETER_MM;

/**
 * Assumed SD of each iris edge landmark in source pixels. We treat the "about 1 px per edge" guess as one SD,
 * which is conservative (it would be the bound of a uniform error). Two edges give sqrt(2) px per eye, and
 * averaging two eyes divides that by sqrt(2).
 */
export const IRIS_EDGE_SD_PX = 1;

/**
 * MediaPipe mesh indices: 468 is the centre of one iris and 469-472 its ring; 473 and 474-477 are the other
 * eye. Each ring is in circular order, so entries 0/2 and 1/3 are opposite points.
 */
export const IRIS_RINGS: readonly (readonly [number, number, number, number])[] = [
  [469, 470, 471, 472],
  [474, 475, 476, 477],
];
export const FACE_MESH_LANDMARKS = 478;

/** Horizontal diameter of one iris ring in px, or null if the ring is missing or degenerate. */
function ringDiameterPx(
  lm: readonly Landmark[],
  ring: readonly number[],
  size: Size2,
): number | null {
  const pts = ring.map((i) => lm[i]);
  if (pts.some((p) => !p || !Number.isFinite(p.x) || !Number.isFinite(p.y))) return null;
  const px = pts.map((p) => ({ x: p.x * size.width, y: p.y * size.height }));
  // The pair that is more horizontal is the horizontal diameter. Euclidean length keeps it right under head roll.
  let best: { dx: number; d: number } | null = null;
  for (const [a, b] of [
    [0, 2],
    [1, 3],
  ] as const) {
    const dx = Math.abs(px[a].x - px[b].x);
    const d = Math.hypot(px[a].x - px[b].x, px[a].y - px[b].y);
    if (!best || dx > best.dx) best = { dx, d };
  }
  return best && best.d > 0 ? best.d : null;
}

/** Horizontal iris diameter in source px for each eye (null when not measurable). */
export function irisDiametersPx(
  lm: readonly Landmark[],
  size: Size2,
): [number | null, number | null] {
  if (lm.length < FACE_MESH_LANDMARKS) return [null, null];
  return [
    ringDiameterPx(lm, IRIS_RINGS[0], size),
    ringDiameterPx(lm, IRIS_RINGS[1], size),
  ];
}

/**
 * Millimetres per pixel from the iris landmarks, in the pixel grid of `size`. Returns null with no usable iris.
 *
 * relSd (relative, 1 SD) adds in quadrature:
 * - population spread of iris size, 0.42 / 11.71 (Rüfer 2005);
 * - landmark error: IRIS_EDGE_SD_PX per edge, averaged over the eyes found, and never less than the standard
 *   error implied by the two eyes disagreeing (|left - right| / 2), which also absorbs yaw and blur.
 */
export function estimateIrisScale(lm: readonly Landmark[], size: Size2): ScaleEstimate | null {
  const found = irisDiametersPx(lm, size).filter((d): d is number => d !== null);
  if (found.length === 0) return null;
  const irisPx = found.reduce((s, d) => s + d, 0) / found.length;
  const modelled = (IRIS_EDGE_SD_PX * Math.SQRT2) / Math.sqrt(found.length);
  const disagreement = found.length === 2 ? Math.abs(found[0] - found[1]) / 2 : 0;
  const landmarkRel = Math.max(modelled, disagreement) / irisPx;
  return {
    mmPerPx: IRIS_DIAMETER_MM / irisPx,
    relSd: Math.hypot(IRIS_POPULATION_REL_SD, landmarkRel),
    source: "iris",
    irisPx,
  };
}

/**
 * Re-express an estimate for a resampled image: output px = source px * factor. The relative uncertainty is
 * a property of the measurement, so it is unchanged.
 */
export function rescaleEstimate(est: ScaleEstimate, factor: number): ScaleEstimate {
  if (!(factor > 0) || !Number.isFinite(factor)) throw new RangeError("factor must be positive");
  return {
    ...est,
    mmPerPx: est.mmPerPx / factor,
    ...(est.irisPx !== undefined ? { irisPx: est.irisPx * factor } : {}),
  };
}
