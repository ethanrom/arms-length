/**
 * Per-mask-kind feature extraction (CONCERNS[...].maskKind):
 *  - contour  (age spots)  : filled outlines -> equivalent diameter (mm) from the mask, contrast vs a ring.
 *  - polyline (wrinkles)   : skeleton length, width from the photo's cross-line profile (else the mask).
 *  - marker   (pores, acne): the mask gives location only; size and contrast from the photo around it.
 *  - region   (dark circle, eye bag, redness): extent from the mask, alpha-weighted contrast vs a reference.
 * Detection (mask only) is separate from measurement (needs the photo and the shared exclusion map).
 */
import type { Box, ConcernId, Feature, RegionMeasure, RgbaImage } from "../contracts";
import {
  boxStat, annulusPixels, bilinear, meanStat, radialProfile, ringPixels, surroundStat, weightedStat,
  type Surround,
} from "./contrast";
import { coneContrastRg, contrastBetween, weberContrast, type ColorStat, type LinearPlanes } from "./color";
import {
  analyseSkeleton, binariseDiff, connectedComponents, fillHoles, foregroundOf, insideDistance, skeletonise,
  type Component, type Foreground, type SkeletonInfo,
} from "./masks";
import * as P from "./params";

export type FeatureDraft = Omit<Feature, "id" | "region">;
export type RegionDraft = Omit<RegionMeasure, "id" | "reference">;

export interface MeasureContext {
  planes: LinearPlanes;
  mmPerPx: number;
  /** 1 where any detected feature (any concern) sits, dilated by 1 px: excluded from surrounds. */
  occupied: Uint8Array;
  /** Skin reference over the face, used when a local surround has too few usable pixels. */
  skin: Surround | null;
}

const median = (values: number[]): number => {
  const s = values.slice().sort((a, b) => a - b);
  return s.length ? s[s.length >> 1] : 0;
};

function footprintOf(comps: Component[], n: number): Uint8Array {
  const out = new Uint8Array(n);
  for (const c of comps) for (let k = 0; k < c.pixels.length; k++) out[c.pixels[k]] = 1;
  return out;
}

/** Binary crop of a component with `pad` px of background all round, plus its global origin. */
function localCrop(comp: Component, width: number, pad: number) {
  const ox = comp.bbox.x - pad;
  const oy = comp.bbox.y - pad;
  const w = comp.bbox.w + 2 * pad;
  const h = comp.bbox.h + 2 * pad;
  const bin = new Uint8Array(w * h);
  for (let k = 0; k < comp.pixels.length; k++) {
    const p = comp.pixels[k];
    bin[(Math.floor(p / width) - oy) * w + ((p % width) - ox)] = 1;
  }
  return { ox, oy, w, h, bin };
}

/** Ring around a component, widened if crowded, as a robust surround; falls back to the face reference. */
function ringSurround(comp: Component, innerPx: number, widthPx: number, ctx: MeasureContext): Surround | null {
  const { width, height } = ctx.planes;
  let w = widthPx;
  for (let attempt = 0; attempt < 4; attempt++) {
    const ring = ringPixels(comp, innerPx, innerPx + w, width, height, ctx.occupied);
    if (ring.length >= P.MIN_RING_PIXELS) {
      const s = surroundStat(ctx.planes, ring);
      if (s && s.n >= P.MIN_RING_PIXELS / 2) return s;
    }
    w *= 1.6;
  }
  return ctx.skin;
}

const ZERO = { lum: 0, rg: 0 };

// ---------------------------------------------------------------------------------------------------
// contour (age spots)
// ---------------------------------------------------------------------------------------------------

export interface ContourDetection {
  comps: Component[];
  /** Filled outlines of every component (also the dropped specks), for the exclusion map. */
  footprint: Uint8Array;
}

export function detectContours(mask: RgbaImage): ContourDetection {
  const { width, height } = mask;
  const fg = foregroundOf(mask);
  const filled = fillHoles(fg.binary, width, height, P.MAX_SPOT_HOLE_PX);
  const all = connectedComponents(filled, width, height);
  return { comps: all.filter((c) => c.area >= P.MIN_SPOT_AREA_PX), footprint: footprintOf(all, width * height) };
}

export function measureContours(concern: ConcernId, comps: Component[], ctx: MeasureContext): FeatureDraft[] {
  return comps.map((comp) => {
    const dPx = 2 * Math.sqrt(comp.area / Math.PI);
    const inner = Math.max(P.RING_INNER_MIN_PX, P.RING_INNER_FRAC * dPx);
    const width = Math.max(P.RING_WIDTH_MIN_PX, P.RING_WIDTH_FRAC * dPx);
    const feature = meanStat(ctx.planes, comp.pixels)!;
    const surround = ringSurround(comp, inner, width, ctx);
    return {
      concern,
      shape: "spot",
      centroid: comp.centroid,
      bbox: comp.bbox,
      areaPx: comp.area,
      diameterMm: dPx * ctx.mmPerPx,
      sizeSource: "mask",
      contrast: surround ? contrastBetween(feature, surround) : ZERO,
    };
  });
}

// ---------------------------------------------------------------------------------------------------
// polyline (wrinkles)
// ---------------------------------------------------------------------------------------------------

export interface LineDetection {
  comp: Component;
  /** Local crop geometry: global origin of local (0,0) and size. */
  ox: number;
  oy: number;
  w: number;
  h: number;
  skeleton: Uint8Array;
  info: SkeletonInfo;
  /** Stroke width in the mask (px): median over the skeleton of 2 x inside-distance - 1. */
  maskWidthPx: number;
}

export interface PolylineDetection {
  lines: LineDetection[];
  /** Every stroke in the mask (also dropped fragments), for the exclusion map. */
  footprint: Uint8Array;
  dropped: number;
}

export function detectPolylines(mask: RgbaImage): PolylineDetection {
  const { width, height } = mask;
  const fg = foregroundOf(mask);
  const all = connectedComponents(fg.binary, width, height);
  const lines: LineDetection[] = [];
  for (const comp of all) {
    if (comp.area < P.MIN_LINE_AREA_PX) continue;
    const { ox, oy, w, h, bin } = localCrop(comp, width, 2);
    const skeleton = skeletonise(bin, w, h);
    const info = analyseSkeleton(skeleton, w, h);
    if (info.longestPath < P.MIN_LINE_LENGTH_PX) continue;
    const inside = insideDistance(bin, w, h);
    const widths = Array.from(info.pixels, (p) => Math.max(1, 2 * inside[p] - 1));
    lines.push({ comp, ox, oy, w, h, skeleton, info, maskWidthPx: median(widths) });
  }
  return { lines, footprint: footprintOf(all, width * height), dropped: all.length - lines.length };
}

interface LineProfile {
  widthPx: number;
  depth: number;
  rg: number;
}

const LINE_STEP = 0.5;
const LINE_PROFILE_HALF = 6;

interface Section {
  y: Float32Array;
  l: Float32Array;
  m: Float32Array;
  /** 1 where the sample is inside the image and not on another feature (usable as baseline). */
  free: Uint8Array;
}

/**
 * Mean luminance profile across a wrinkle in the photo, with ONE lateral offset per wrinkle.
 * At each (degree-2) skeleton pixel the photo is sampled along the local normal. The YouCam line can sit
 * a few px off the visible crease, so the wrinkle gets a single offset t0 within +-LINE_ALIGN_PX of the
 * mask line: the one at which the mean dip below the flank baseline (flanks at LINE_FLANK_INNER_PX to
 * LINE_HALF_SPAN_PX from t0, other features skipped) is deepest. A single offset, not one per
 * cross-section, because picking the darkest point of every cross-section inflates depth by about as much
 * as the real signal (measured with shifted-photo controls). Width is the full width at half depth of the
 * mean profile at t0. Null when the dip is shallower than LINE_MIN_DEPTH or not clearly above its
 * standard error.
 */
function linePhotoProfile(det: LineDetection, ctx: MeasureContext): LineProfile | null {
  const { planes, occupied } = ctx;
  const { skeleton, w, h, ox, oy, info } = det;
  const at = (x: number, y: number) => (x >= 0 && y >= 0 && x < w && y < h ? skeleton[y * w + x] : 0);
  const span = P.LINE_ALIGN_PX + P.LINE_HALF_SPAN_PX;
  const nt = Math.round((2 * span) / LINE_STEP) + 1;
  const sections: Section[] = [];
  let eligible = 0;
  for (let k = 0; k < info.pixels.length; k++) {
    if (info.degree[k] !== 2) continue;
    if (eligible++ % P.LINE_SAMPLE_STEP_PX !== 0) continue;
    const lx = info.pixels[k] % w;
    const ly = (info.pixels[k] - lx) / w;
    // Local direction: principal axis of the skeleton pixels within 3 px.
    let n = 0;
    let mx = 0;
    let my = 0;
    for (let dy = -3; dy <= 3; dy++) for (let dx = -3; dx <= 3; dx++) if (at(lx + dx, ly + dy)) { n++; mx += lx + dx; my += ly + dy; }
    if (n < 5) continue;
    mx /= n;
    my /= n;
    let sxx = 0;
    let syy = 0;
    let sxy = 0;
    for (let dy = -3; dy <= 3; dy++) {
      for (let dx = -3; dx <= 3; dx++) {
        if (!at(lx + dx, ly + dy)) continue;
        const ax = lx + dx - mx;
        const ay = ly + dy - my;
        sxx += ax * ax;
        syy += ay * ay;
        sxy += ax * ay;
      }
    }
    const theta = 0.5 * Math.atan2(2 * sxy, sxx - syy);
    const nx = -Math.sin(theta);
    const ny = Math.cos(theta);
    const gx = ox + lx;
    const gy = oy + ly;
    const s: Section = { y: new Float32Array(nt), l: new Float32Array(nt), m: new Float32Array(nt), free: new Uint8Array(nt) };
    for (let i = 0; i < nt; i++) {
      const t = -span + i * LINE_STEP;
      const x = gx + t * nx;
      const y = gy + t * ny;
      s.y[i] = bilinear(planes.y, planes.width, planes.height, x, y);
      s.l[i] = bilinear(planes.l, planes.width, planes.height, x, y);
      s.m[i] = bilinear(planes.m, planes.width, planes.height, x, y);
      const ix = Math.round(x);
      const iy = Math.round(y);
      const inside = ix >= 0 && iy >= 0 && ix < planes.width && iy < planes.height;
      s.free[i] = inside && !occupied[iy * planes.width + ix] && Number.isFinite(s.y[i]) ? 1 : 0;
    }
    sections.push(s);
  }
  if (sections.length < P.LINE_MIN_SECTIONS) return null;

  const idx = (t: number) => Math.round((t + span) / LINE_STEP);
  // Dip and baseline of one section at lateral offset t0, or null when the flanks are unusable.
  const evaluate = (s: Section, t0: number) => {
    let b = 0;
    let bl = 0;
    let bm = 0;
    let nb = 0;
    for (let u = P.LINE_FLANK_INNER_PX; u <= P.LINE_HALF_SPAN_PX; u += 1) {
      for (const sgn of [-1, 1]) {
        const i = idx(t0 + sgn * u);
        if (!s.free[i]) continue;
        b += s.y[i];
        bl += s.l[i];
        bm += s.m[i];
        nb++;
      }
    }
    const c = idx(t0);
    if (nb < 6 || !Number.isFinite(s.y[c])) return null;
    return { b: b / nb, bl: bl / nb, bm: bm / nb, c };
  };

  let bestT = 0;
  let bestDepth = -Infinity;
  for (let t0 = -P.LINE_ALIGN_PX; t0 <= P.LINE_ALIGN_PX + 1e-9; t0 += LINE_STEP) {
    let sum = 0;
    let cnt = 0;
    for (const s of sections) {
      const e = evaluate(s, t0);
      if (!e) continue;
      sum += (e.b - s.y[e.c]) / e.b;
      cnt++;
    }
    if (cnt >= P.LINE_MIN_SECTIONS && sum / cnt > bestDepth + 1e-9) {
      bestDepth = sum / cnt;
      bestT = t0;
    }
  }
  if (!Number.isFinite(bestDepth)) return null;

  const nBins = Math.round((2 * LINE_PROFILE_HALF) / LINE_STEP) + 1;
  const sum = new Float64Array(nBins);
  const cnt = new Uint32Array(nBins);
  const depths: number[] = [];
  let rgSum = 0;
  for (const s of sections) {
    const e = evaluate(s, bestT);
    if (!e) continue;
    for (let i = 0; i < nBins; i++) {
      const v = s.y[idx(bestT - LINE_PROFILE_HALF + i * LINE_STEP)];
      if (!Number.isFinite(v)) continue;
      sum[i] += (v - e.b) / e.b;
      cnt[i]++;
    }
    depths.push((e.b - s.y[e.c]) / e.b);
    rgSum += (s.l[e.c] - e.bl) / Math.max(e.bl, 1e-6) - (s.m[e.c] - e.bm) / Math.max(e.bm, 1e-6);
  }
  const nSec = depths.length;
  if (nSec < P.LINE_MIN_SECTIONS) return null;
  const depth = depths.reduce((a, b) => a + b, 0) / nSec;
  const sd = Math.sqrt(depths.reduce((a, d) => a + (d - depth) ** 2, 0) / Math.max(1, nSec - 1));
  // Neighbouring cross-sections are correlated (skeleton step 2 px, texture scale a few px): n/2 independent.
  const se = sd / Math.sqrt(Math.max(1, nSec / 2));
  if (!(depth >= P.LINE_MIN_DEPTH) || depth < P.LINE_MIN_SIGMA * se) return null;

  const mean = Array.from(sum, (s, i) => (cnt[i] ? s / cnt[i] : NaN));
  const centre = (nBins - 1) / 2;
  const half = -depth / 2;
  const cross = (dir: 1 | -1): number | null => {
    for (let i = centre + dir; i >= 0 && i < nBins; i += dir) {
      if (mean[i] > half) {
        const prev = mean[i - dir];
        const f = (half - prev) / (mean[i] - prev);
        return (Math.abs(i - dir - centre) + f) * LINE_STEP;
      }
    }
    return null;
  };
  const right = cross(1);
  const left = cross(-1);
  if (right === null || left === null) return null;
  return { widthPx: left + right, depth, rg: rgSum / nSec };
}

export function measurePolylines(concern: ConcernId, lines: LineDetection[], ctx: MeasureContext): FeatureDraft[] {
  return lines.map((det) => {
    const { comp } = det;
    const photo = linePhotoProfile(det, ctx);
    const widthPx = photo ? photo.widthPx : det.maskWidthPx;
    let contrast = ZERO;
    if (photo) {
      contrast = { lum: -photo.depth, rg: photo.rg };
    } else {
      const surround = ringSurround(comp, 3, 6, ctx);
      const feature = meanStat(ctx.planes, comp.pixels)!;
      if (surround) contrast = contrastBetween(feature, surround);
    }
    return {
      concern,
      shape: "line",
      centroid: comp.centroid,
      bbox: comp.bbox,
      areaPx: comp.area,
      lengthMm: det.info.longestPath * ctx.mmPerPx,
      widthMm: widthPx * ctx.mmPerPx,
      sizeSource: photo ? "photo" : "mask",
      contrast,
    };
  });
}

// ---------------------------------------------------------------------------------------------------
// marker (pores, acne)
// ---------------------------------------------------------------------------------------------------

export interface Marker {
  /** Integer pixel position. */
  x: number;
  y: number;
  /** Mask pixels attributed to this marker. */
  area: number;
  bbox: Box;
}

export interface MarkerDetection {
  markers: Marker[];
  /** Typical inside-distance peak of one marker (px): about the marker radius + 0.5. */
  unitPeak: number;
  /** Filled marker footprint, for the exclusion map. */
  footprint: Uint8Array;
  components: number;
}

export function detectMarkers(mask: RgbaImage, kind: "pore" | "acne"): MarkerDetection {
  const { width, height } = mask;
  const p = P.MARKER_PARAMS[kind];
  const fg = foregroundOf(mask);
  const filled = fillHoles(fg.binary, width, height, p.maxHolePx);
  const comps = connectedComponents(filled, width, height);
  if (comps.length === 0) return { markers: [], unitPeak: 0, footprint: filled, components: 0 };
  const crops = comps.map((c) => localCrop(c, width, 1));
  const edts = crops.map((c) => insideDistance(c.bin, c.w, c.h));
  const unitPeak = median(edts.map((e) => Math.max(...e)));
  const medArea = median(comps.map((c) => c.area));
  const markers: Marker[] = [];
  const r = Math.max(1, Math.round(unitPeak - 0.5));
  const unitBox = (x: number, y: number): Box => ({ x: x - r, y: y - r, w: 2 * r + 1, h: 2 * r + 1 });
  comps.forEach((c, i) => {
    const single = (): void => {
      markers.push({ x: Math.round(c.centroid.x), y: Math.round(c.centroid.y), area: c.area, bbox: c.bbox });
    };
    if (c.area <= p.splitAreaFactor * medArea) return single();
    // Merged dots: greedy non-maximum suppression on the inside-distance transform.
    const { ox, oy, w, bin } = crops[i];
    const edt = edts[i];
    const cand: number[] = [];
    for (let k = 0; k < bin.length; k++) if (bin[k] && edt[k] >= 0.6 * unitPeak) cand.push(k);
    cand.sort((a, b) => edt[b] - edt[a] || a - b);
    const sep = 1.1 * unitPeak;
    const picks: { x: number; y: number }[] = [];
    for (const k of cand) {
      const x = k % w;
      const y = (k - x) / w;
      if (picks.every((q) => Math.hypot(q.x - x, q.y - y) >= sep)) picks.push({ x, y });
    }
    if (picks.length === 0) return single();
    for (const q of picks) {
      markers.push({ x: ox + q.x, y: oy + q.y, area: Math.round(c.area / picks.length), bbox: unitBox(ox + q.x, oy + q.y) });
    }
  });
  return { markers, unitPeak, footprint: filled, components: comps.length };
}

/**
 * YouCam tags some age spots (and papules) as pores or acne as well. A marker whose centre sits inside a measured
 * age spot is dropped, because the spot already counts that mark. Mutates `det.markers`; returns how many were dropped.
 */
export function dropMarkersInside(det: MarkerDetection, spots: Component[], width: number, height: number): number {
  const inside = footprintOf(spots, width * height);
  const kept = det.markers.filter((m) => !inside[m.y * width + m.x]);
  const dropped = det.markers.length - kept.length;
  det.markers = kept;
  return dropped;
}

/**
 * A photo-measured pore wider than this is not an enlarged pore but another mark (a papule, a spot) that sits at a pore
 * location. Flament et al. (2015), Clin Cosmet Investig Dermatol 8:85-93, count facial pores from 250 um upward, and
 * enlarged pores are typically up to about 0.5 mm (an order-of-magnitude assumption, not a figure from that paper), so 1.2 mm is
 * more than twice the upper end. Such a feature is kept but its size becomes the 0.5 mm prior, flagged sizeSource "prior".
 * (Would sit in params.ts with the other marker parameters.)
 */
export const PORE_MAX_PLAUSIBLE_MM = 1.2;
export const PORE_IMPLAUSIBLE_PRIOR_MM = 0.5;

/**
 * Size and contrast of one marker from the photo. Contrast is the 3x3 box at the mask location against a
 * robust surround annulus (the box absorbs the ~1 px mask registration error; a wider search for the
 * strongest position inflates contrast, see MARKER_PARAMS.searchRadiusPx). Size is the full width at
 * half the peak of the radial profile, on the luminance channel or (acne) the red-green channel,
 * whichever stands further above the noise. When neither does, the size is a stated prior
 * (sizeSource "prior") and the contrast is still reported; so it is for a pore wider than PORE_MAX_PLAUSIBLE_MM.
 * Photo sizes are blur-limited (about 2 px minimum), so they are upper bounds on the physical size, with contrast
 * diluted correspondingly.
 */
function measureMarker(m: Marker, kind: "pore" | "acne", unitR: number, ctx: MeasureContext): FeatureDraft {
  const p = P.MARKER_PARAMS[kind];
  const { planes } = ctx;
  const { width, height } = planes;
  const chromatic = kind === "acne";
  const rIn = p.profileRadiusFactor * unitR;
  const K = Math.max(2, Math.ceil(rIn));
  let surround: Surround | null = null;
  let band = p.surroundWidthFactor * unitR;
  for (let attempt = 0; attempt < 4 && !surround; attempt++) {
    const pix = annulusPixels(m.x, m.y, rIn, rIn + band, width, height, ctx.occupied);
    if (pix.length >= P.MIN_RING_PIXELS) {
      const s = surroundStat(planes, pix);
      if (s && s.n >= P.MIN_RING_PIXELS / 2) surround = s;
    }
    band *= 1.6;
  }
  surround ??= ctx.skin;
  const markerDiameterPx = 2 * unitR;
  const priorPx = Math.max(
    p.priorMinPx,
    kind === "acne" ? P.ACNE_PRIOR_FRACTION * markerDiameterPx : p.priorDiameterMm / ctx.mmPerPx,
  );
  const base = { concern: kind, shape: "spot" as const, centroid: { x: m.x, y: m.y }, bbox: m.bbox, areaPx: m.area };
  if (!surround) {
    return { ...base, diameterMm: priorPx * ctx.mmPerPx, sizeSource: "prior", contrast: ZERO };
  }

  const s = p.searchRadiusPx;
  let cx = m.x;
  let cy = m.y;
  let bestC = weberContrast(boxStat(planes, cx, cy).y, surround.y);
  for (let dy = -s; dy <= s; dy++) {
    for (let dx = -s; dx <= s; dx++) {
      const c = weberContrast(boxStat(planes, m.x + dx, m.y + dy).y, surround.y);
      if (Math.abs(c) > Math.abs(bestC) + 1e-9) {
        bestC = c;
        cx = m.x + dx;
        cy = m.y + dy;
      }
    }
  }
  const box = boxStat(planes, cx, cy);
  const contrast = contrastBetween(box, surround);
  // A 3x3 box of correlated pixels carries about 4 independent samples of the surround's pixel noise.
  const zLum = Math.abs(contrast.lum) / Math.max(surround.sdRel / 2, 1e-4);
  const zRg = chromatic ? Math.abs(contrast.rg) / Math.max(surround.sdRg / 2, 1e-4) : 0;
  if (Math.max(zLum, zRg) < p.flatSigma) {
    return { ...base, diameterMm: priorPx * ctx.mmPerPx, sizeSource: "prior", contrast };
  }
  const useRg = zRg > zLum;
  const sign = Math.sign(useRg ? contrast.rg : contrast.lum) || 1;
  const prof = radialProfile(planes, cx, cy, K);
  const raw = prof.map((b) => (useRg ? coneContrastRg(b, surround) : weberContrast(b.y, surround.y)) * sign);
  for (let k = 0; k < raw.length; k++) if (!Number.isFinite(raw[k])) raw[k] = k > 0 ? raw[k - 1] : 0;
  const sm = raw.map((v, k) => 0.25 * (k === 0 ? raw[1] : raw[k - 1]) + 0.5 * v + 0.25 * (k === K ? raw[K] : raw[k + 1]));
  const peak = sm[0];
  let rHalf = rIn;
  if (peak > 0) {
    for (let k = 1; k < sm.length; k++) {
      if (sm[k] < 0.5 * peak) {
        rHalf = k - 1 + (sm[k - 1] - 0.5 * peak) / (sm[k - 1] - sm[k]);
        break;
      }
    }
  } else {
    return { ...base, diameterMm: priorPx * ctx.mmPerPx, sizeSource: "prior", contrast };
  }
  const dPx = Math.max(p.priorMinPx, 2 * rHalf);
  if (kind === "pore" && dPx * ctx.mmPerPx > PORE_MAX_PLAUSIBLE_MM) {
    return { ...base, diameterMm: PORE_IMPLAUSIBLE_PRIOR_MM, sizeSource: "prior", contrast };
  }
  return { ...base, diameterMm: dPx * ctx.mmPerPx, sizeSource: "photo", contrast };
}

export function measureMarkers(kind: "pore" | "acne", det: MarkerDetection, ctx: MeasureContext): FeatureDraft[] {
  const unitR = Math.max(1.5, det.unitPeak - 0.5);
  return det.markers.map((m) => measureMarker(m, kind, unitR, ctx));
}

// ---------------------------------------------------------------------------------------------------
// region (dark circle, eye bag, redness)
// ---------------------------------------------------------------------------------------------------

export interface RegionDetection {
  comps: Component[];
  fg: Foreground;
  /** Union of the kept regions. */
  footprint: Uint8Array;
}

/**
 * Regions are graded, so the extent is where the mask exceeds REGION_EXTENT_FRACTION of its maximum
 * difference from the background (and at least REGION_MIN_DIFF). A mask whose foreground never reaches
 * REGION_MIN_DIFF is empty (the p2b redness mask is a single alpha value).
 */
export function detectRegions(mask: RgbaImage): RegionDetection {
  const { width, height } = mask;
  const fg = foregroundOf(mask, 1);
  if (fg.maxDiff < P.REGION_MIN_DIFF) return { comps: [], fg, footprint: new Uint8Array(width * height) };
  const threshold = Math.max(P.REGION_MIN_DIFF, P.REGION_EXTENT_FRACTION * fg.maxDiff);
  const comps = connectedComponents(binariseDiff(fg.diff, threshold), width, height).filter((c) => c.area >= P.MIN_REGION_AREA_PX);
  return { comps, fg, footprint: footprintOf(comps, width * height) };
}

/** Alpha-weighted mean colour of a region against a reference surround. */
export function measureRegion(
  concern: ConcernId,
  comp: Component,
  fg: Foreground,
  reference: ColorStat,
  ctx: MeasureContext,
): RegionDraft {
  const stat = weightedStat(ctx.planes, comp.pixels, fg.diff)!;
  return {
    concern,
    bbox: comp.bbox,
    areaPx: comp.area,
    widthMm: comp.bbox.w * ctx.mmPerPx,
    heightMm: comp.bbox.h * ctx.mmPerPx,
    contrast: contrastBetween(stat, reference),
  };
}
