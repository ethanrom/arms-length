/**
 * The log-distance axis shared by the Step back slider, the concern bars and the ticks.
 * Vision scales with the ratio of distances (twice as far is half the angular size), so a log axis puts equal
 * "visual change" at equal spacing. Pure functions only; this file is unit tested.
 */

export interface LogAxis {
  /** Nearest distance on the axis, metres. */
  min: number;
  /** Farthest distance on the axis, metres. */
  max: number;
}

/** Mirror distance to across a room. */
export const DEFAULT_AXIS: LogAxis = { min: 0.25, max: 6 };

/** Distances where renders are precomputed; the slider crossfades between neighbours. */
export const DEFAULT_STOPS: readonly number[] = [0.25, 0.4, 0.6, 1, 1.5, 2.5, 4, 6];

const clamp01 = (x: number) => Math.min(1, Math.max(0, x));

/** CSS percentage for a 0..100 value, rounded so server and client markup always agree. */
export const percent = (value: number): string => `${Math.round(value * 1000) / 1000}%`;

/** Distance (m) to a 0..1 position along the axis. Clamped. */
export function toUnit(distanceM: number, axis: LogAxis = DEFAULT_AXIS): number {
  if (!(distanceM > 0)) return 0;
  return clamp01(Math.log(distanceM / axis.min) / Math.log(axis.max / axis.min));
}

/** 0..1 position along the axis to distance (m). Clamped. */
export function fromUnit(unit: number, axis: LogAxis = DEFAULT_AXIS): number {
  return axis.min * Math.pow(axis.max / axis.min, clamp01(unit));
}

export function clampDistance(distanceM: number, axis: LogAxis = DEFAULT_AXIS): number {
  return Math.min(axis.max, Math.max(axis.min, distanceM));
}

/** Integer slider step (0..steps) to distance. */
export function stepToDistance(step: number, steps: number, axis: LogAxis = DEFAULT_AXIS): number {
  return fromUnit(step / steps, axis);
}

/** Distance to the nearest integer slider step (0..steps). */
export function distanceToStep(distanceM: number, steps: number, axis: LogAxis = DEFAULT_AXIS): number {
  return Math.round(toUnit(distanceM, axis) * steps);
}

/**
 * Which two render stops bracket a distance, and how far between them (0..1, measured in log distance, so the
 * crossfade matches the axis). Distances outside the stops clamp to the first or last stop.
 */
export function bracketStops(stops: readonly number[], distanceM: number): { index: number; t: number } {
  if (stops.length < 2) return { index: 0, t: 0 };
  if (distanceM <= stops[0]) return { index: 0, t: 0 };
  const last = stops.length - 1;
  if (distanceM >= stops[last]) return { index: last - 1, t: 1 };
  let i = 0;
  while (i < last - 1 && distanceM >= stops[i + 1]) i++;
  const t = Math.log(distanceM / stops[i]) / Math.log(stops[i + 1] / stops[i]);
  return { index: i, t: clamp01(t) };
}

/** Per-layer opacities for a stack of stop renders: the lower stop opaque, the upper one fading in over it. */
export function layerOpacities(stops: readonly number[], distanceM: number): number[] {
  const out = stops.map(() => 0);
  if (stops.length === 0) return out;
  if (stops.length === 1) return [1];
  const { index, t } = bracketStops(stops, distanceM);
  out[index] = 1;
  out[index + 1] = t;
  return out;
}

/** "25 cm", "1.5 m", "10 m". */
export function formatDistance(distanceM: number): string {
  if (!Number.isFinite(distanceM)) return "";
  if (distanceM < 0.995) return `${Math.round(distanceM * 100)} cm`;
  const m = Math.round(distanceM * 10) / 10;
  return `${m} m`;
}

/** For screen readers: "25 centimetres", "1 metre", "1.5 metres". */
export function spokenDistance(distanceM: number): string {
  if (!Number.isFinite(distanceM)) return "";
  if (distanceM < 0.995) {
    const cm = Math.round(distanceM * 100);
    return `${cm} ${cm === 1 ? "centimetre" : "centimetres"}`;
  }
  const m = Math.round(distanceM * 10) / 10;
  return `${m} ${m === 1 ? "metre" : "metres"}`;
}

export interface NamedDistance {
  distanceM: number;
  label: string;
}

/**
 * The anchor a distance is close to (within `tolerance` in log distance, default about 15%), or the pair of
 * anchors it sits between. Anchors must be sorted by distance.
 */
export function locateAmongAnchors<T extends NamedDistance>(
  anchors: readonly T[],
  distanceM: number,
  tolerance = 0.15,
): { near: T | null; below: T | null; above: T | null } {
  let near: T | null = null;
  let best = Infinity;
  let below: T | null = null;
  let above: T | null = null;
  for (const a of anchors) {
    const off = Math.abs(Math.log(distanceM / a.distanceM));
    if (off < best) {
      best = off;
      near = a;
    }
    if (a.distanceM <= distanceM) below = a;
    if (a.distanceM > distanceM && above === null) above = a;
  }
  return { near: best <= tolerance ? near : null, below, above };
}

/**
 * Opacity (0..1) of a threshold label as the slider approaches and passes the distance where a concern fades.
 * The label is strongest at the threshold and eases out over `window` (natural-log units, 0.3 is about 35%).
 */
export function thresholdLabelOpacity(distanceM: number, thresholdM: number, window = 0.3): number {
  if (!(distanceM > 0) || !(thresholdM > 0)) return 0;
  const off = Math.abs(Math.log(distanceM / thresholdM)) / window;
  if (off >= 1) return 0;
  const k = 1 - off;
  return k * k * (3 - 2 * k); // smoothstep
}
