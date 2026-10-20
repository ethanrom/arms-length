/**
 * remeasure: the same features, measured again on a render (makeup preview or Skin Simulation).
 *
 * Geometry never changes: sizes (and so ids) come from the base measurements; only contrast is recomputed, on the
 * render after undoing its offset. Two ways to get the geometry:
 *  - exact: pass the analysis and its masks (`options.geometry`). The full measurement pipeline reruns on the aligned
 *    render, so the identity render gives back the base contrasts. Every concern works.
 *  - approximate: from `Measurements` alone, which keeps no pixels. Each spot, pore and acne mark is rebuilt as an
 *    ellipse in its bounding box with the stored area, and measured with the same surround code as the base. On the
 *    recorded p2b photo the median contrast is 0.97x the base for age spots and pores and 1.01x for acne, with about
 *    +-20% scatter per mark, so compare approximate numbers only with approximate numbers (measure the baseline the same way).
 *    Wrinkles and regions (dark circles, eye bags, redness) need masks, so their contrast is passed through unchanged.
 */
import type { Box, ConcernId, Feature, Measurements, RegionMeasure, RgbaImage, SkinAnalysis, Size2 } from "../contracts";
import { toLinearPlanes, type LinearPlanes } from "./color";
import { surroundStat, type Surround } from "./contrast";
import { measureContours, measureMarkers, type MeasureContext } from "./features";
import { dilate, type Component } from "./masks";
import { measureAnalysis } from "./measure";
import { MIN_REFERENCE_PIXELS } from "./params";

export interface RenderOffset {
  dx: number;
  dy: number;
  /** Frame region that has real render pixels. Default: all of it. */
  valid?: Box;
}

/** The analysis the base measurements came from; makes re-measurement exact. */
export interface MeasureGeometry {
  analysis: SkinAnalysis;
  /** Keyed by `ConcernResult.maskRef`, as for `measureAnalysis`. */
  masks: Map<string, RgbaImage>;
}

export interface RemeasureOptions {
  geometry?: MeasureGeometry;
  /** The analysis frame, when the render may have been rescaled. Defaults to the geometry's frame, else the render's size. */
  frame?: Size2;
}

/** Concerns whose contrast can be re-measured without masks (see the file header). */
export const MASKLESS_CONCERNS: readonly ConcernId[] = ["age_spot", "acne", "pore"];

/** Same tolerance as lib/youcam/render.ts: a render this close to the frame size is the frame, shifted. */
export const SAME_FRAME_TOLERANCE_PX = 2;

export function resampleImage(src: RgbaImage, width: number, height: number): RgbaImage {
  const out = new Uint8ClampedArray(width * height * 4);
  for (let y = 0; y < height; y++) {
    const fy = Math.min(src.height - 1, Math.max(0, ((y + 0.5) * src.height) / height - 0.5));
    const y0 = Math.floor(fy);
    const y1 = Math.min(src.height - 1, y0 + 1);
    const ty = fy - y0;
    for (let x = 0; x < width; x++) {
      const fx = Math.min(src.width - 1, Math.max(0, ((x + 0.5) * src.width) / width - 0.5));
      const x0 = Math.floor(fx);
      const x1 = Math.min(src.width - 1, x0 + 1);
      const tx = fx - x0;
      for (let c = 0; c < 4; c++) {
        const at = (px: number, py: number) => src.data[(py * src.width + px) * 4 + c];
        const top = at(x0, y0) * (1 - tx) + at(x1, y0) * tx;
        const bottom = at(x0, y1) * (1 - tx) + at(x1, y1) * tx;
        out[(y * width + x) * 4 + c] = top * (1 - ty) + bottom * ty;
      }
    }
  }
  return { width, height, data: out };
}

/** True when a render is the frame's size, give or take the 1-2 px the service crops or pads. */
export const isFrameSized = (render: Size2, frame: Size2): boolean =>
  Math.abs(render.width - frame.width) <= SAME_FRAME_TOLERANCE_PX && Math.abs(render.height - frame.height) <= SAME_FRAME_TOLERANCE_PX;

/**
 * The render in the analysis frame: aligned(x, y) = render(x + dx, y + dy), the convention of `RenderResult.offset`
 * (the VTO's +1 row: out(x, y + 1) = in(x, y)). Pixels the render does not cover, and its black padding, are outside
 * `offset.valid` (the frame region with real render pixels, from `registerRender`); they take the nearest valid
 * pixel. A render more than 2 px off the frame size was rescaled by the service: it is resampled to the frame first,
 * and the offset then applies to the resampled image.
 */
export function alignRender(render: RgbaImage, offset: RenderOffset, frame: Size2 = render): RgbaImage {
  const { width, height } = frame;
  const src = isFrameSized(render, frame) ? render : resampleImage(render, width, height);
  const v = offset.valid ?? { x: 0, y: 0, w: width, h: height };
  const xMin = Math.max(0, v.x + offset.dx);
  const xMax = Math.min(src.width - 1, v.x + v.w - 1 + offset.dx);
  const yMin = Math.max(0, v.y + offset.dy);
  const yMax = Math.min(src.height - 1, v.y + v.h - 1 + offset.dy);
  const out = new Uint8ClampedArray(width * height * 4);
  for (let y = 0; y < height; y++) {
    const sy = Math.min(yMax, Math.max(yMin, y + offset.dy));
    for (let x = 0; x < width; x++) {
      const sx = Math.min(xMax, Math.max(xMin, x + offset.dx));
      const s = (sy * src.width + sx) * 4;
      out.set(src.data.subarray(s, s + 4), (y * width + x) * 4);
    }
  }
  return { width, height, data: out };
}

// ---------------------------------------------------------------------------------------------------
// approximate geometry
// ---------------------------------------------------------------------------------------------------

/** Ratio of a full bounding box to its inscribed ellipse, per axis: an ellipse never needs to grow past the box. */
const MAX_FILL_SCALE = Math.sqrt(4 / Math.PI);

/** The ellipse inscribed in a feature's bounding box, scaled to the stored area; null when it falls outside the image. */
function ellipseComponent(f: Feature, width: number, height: number): Component | null {
  const { x, y, w, h } = f.bbox;
  const a = w / 2;
  const b = h / 2;
  const s = Math.min(MAX_FILL_SCALE, Math.sqrt(f.areaPx / (Math.PI * a * b)));
  const cx = x + (w - 1) / 2;
  const cy = y + (h - 1) / 2;
  const pixels: number[] = [];
  for (let py = Math.max(0, y); py < Math.min(height, y + h); py++) {
    for (let px = Math.max(0, x); px < Math.min(width, x + w); px++) {
      const u = (px - cx) / (a * s);
      const v = (py - cy) / (b * s);
      if (u * u + v * v <= 1) pixels.push(py * width + px);
    }
  }
  if (pixels.length === 0) {
    const px = Math.round(f.centroid.x);
    const py = Math.round(f.centroid.y);
    if (px < 0 || py < 0 || px >= width || py >= height) return null;
    pixels.push(py * width + px);
  }
  return { area: pixels.length, bbox: f.bbox, centroid: f.centroid, pixels: Int32Array.from(pixels) };
}

/** Stand-in for the face-skin fallback of the base pass: unmarked pixels (every 3rd row and column) around the features. */
function skinFallback(planes: LinearPlanes, features: Feature[], occupied: Uint8Array): Surround | null {
  const { width, height } = planes;
  if (features.length === 0) return null;
  const xs = features.map((f) => f.centroid.x);
  const ys = features.map((f) => f.centroid.y);
  const x0 = Math.max(0, Math.floor(Math.min(...xs)));
  const x1 = Math.min(width - 1, Math.ceil(Math.max(...xs)));
  const y0 = Math.max(0, Math.floor(Math.min(...ys)));
  const y1 = Math.min(height - 1, Math.ceil(Math.max(...ys)));
  const idx: number[] = [];
  for (let y = y0; y <= y1; y += 3) for (let x = x0; x <= x1; x += 3) if (!occupied[y * width + x]) idx.push(y * width + x);
  return idx.length >= MIN_REFERENCE_PIXELS ? surroundStat(planes, idx) : null;
}

function approximate(measurements: Measurements, aligned: RgbaImage): Measurements {
  const { width, height } = aligned;
  const planes = toLinearPlanes(aligned);

  const marks = measurements.features.filter((f) => MASKLESS_CONCERNS.includes(f.concern));
  const comps = new Map<string, Component>();
  const occupied = new Uint8Array(width * height);
  for (const f of marks) {
    const comp = ellipseComponent(f, width, height);
    if (!comp) continue;
    comps.set(f.id, comp);
    for (const p of comp.pixels) occupied[p] = 1;
  }
  const ctx: MeasureContext = {
    planes,
    mmPerPx: measurements.scale.mmPerPx,
    occupied: dilate(occupied, width, height, 1),
    skin: null,
  };
  ctx.skin = skinFallback(planes, marks, ctx.occupied);

  const contrast = new Map<string, Feature["contrast"]>();
  const spots = marks.filter((f) => f.concern === "age_spot" && comps.has(f.id));
  measureContours("age_spot", spots.map((f) => comps.get(f.id)!), ctx).forEach((d, i) => contrast.set(spots[i].id, d.contrast));
  for (const kind of ["pore", "acne"] as const) {
    const list = marks.filter((f) => f.concern === kind && comps.has(f.id));
    if (list.length === 0) continue;
    // The marker size the base pass used: its bbox is about the mark's diameter, so the inside-distance peak is half of it.
    const widths = list.map((f) => f.bbox.w).sort((a, b) => a - b);
    const det = {
      markers: list.map((f) => ({ x: Math.round(f.centroid.x), y: Math.round(f.centroid.y), area: f.areaPx, bbox: f.bbox })),
      unitPeak: widths[widths.length >> 1] / 2,
      footprint: occupied,
      components: list.length,
    };
    measureMarkers(kind, det, ctx).forEach((d, i) => contrast.set(list[i].id, d.contrast));
  }

  return {
    ...measurements,
    features: measurements.features.map((f) => {
      const c = contrast.get(f.id);
      // Exactly {0, 0} is the "no surround found" fallback of the measuring code, not a measurement.
      return c && (c.lum !== 0 || c.rg !== 0) ? { ...f, contrast: c } : f;
    }),
  };
}

// ---------------------------------------------------------------------------------------------------

export function remeasure(
  measurements: Measurements,
  renderPhoto: RgbaImage,
  offset: RenderOffset,
  options: RemeasureOptions = {},
): Measurements {
  const { geometry } = options;
  const frame = geometry?.analysis.frame ?? options.frame ?? renderPhoto;
  const aligned = alignRender(renderPhoto, offset, { width: frame.width, height: frame.height });
  if (!geometry) return approximate(measurements, aligned);

  const fresh = measureAnalysis(geometry.analysis, geometry.masks, aligned, measurements.scale);
  const contrast = new Map<string, Feature["contrast"]>();
  for (const t of [...fresh.features, ...fresh.regions]) contrast.set(t.id, t.contrast);
  const carry = <T extends Feature | RegionMeasure>(t: T): T => ({ ...t, contrast: contrast.get(t.id) ?? t.contrast });
  return { ...measurements, features: measurements.features.map(carry), regions: measurements.regions.map(carry) };
}
