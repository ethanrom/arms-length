/**
 * Photo sampling for contrast: robust surround statistics, rings, bands and radial profiles.
 * Everything works on linear-light planes (see color.ts) and linear pixel indices.
 */
import type { ColorStat, LinearPlanes } from "./color";
import { SURROUND_CLIP_SIGMA } from "./params";
import { distanceToSet, type Component } from "./masks";

export interface Surround extends ColorStat {
  /** Pixels kept after outlier rejection. */
  n: number;
  /** Standard deviation of luminance over the kept pixels, relative to their mean. */
  sdRel: number;
  /** Standard deviation of the per-pixel red-green cone contrast over the kept pixels. */
  sdRg: number;
}

function medianOf(values: Float64Array): number {
  const s = values.slice().sort();
  return s[s.length >> 1];
}

/** Plain mean of Y, L, M over a pixel set. */
export function meanStat(planes: LinearPlanes, idx: ArrayLike<number>): ColorStat | null {
  const n = idx.length;
  if (n === 0) return null;
  let y = 0;
  let l = 0;
  let m = 0;
  for (let k = 0; k < n; k++) {
    const i = idx[k];
    y += planes.y[i];
    l += planes.l[i];
    m += planes.m[i];
  }
  return { y: y / n, l: l / n, m: m / n };
}

/** Mean of Y, L, M weighted by `weights[idx[k]]` (a mask's alpha-difference map). */
export function weightedStat(planes: LinearPlanes, idx: ArrayLike<number>, weights: ArrayLike<number>): ColorStat | null {
  let w = 0;
  let y = 0;
  let l = 0;
  let m = 0;
  for (let k = 0; k < idx.length; k++) {
    const i = idx[k];
    const wi = weights[i];
    w += wi;
    y += wi * planes.y[i];
    l += wi * planes.l[i];
    m += wi * planes.m[i];
  }
  return w > 0 ? { y: y / w, l: l / w, m: m / w } : null;
}

/**
 * Mean colour of a surround pixel set after rejecting outliers (hair, specular spots, neighbouring
 * marks) further than `clipSigma` robust sigmas (1.4826 x MAD of luminance) from the median.
 */
export function surroundStat(planes: LinearPlanes, idx: ArrayLike<number>, clipSigma = SURROUND_CLIP_SIGMA): Surround | null {
  const n = idx.length;
  if (n === 0) return null;
  const ys = new Float64Array(n);
  for (let k = 0; k < n; k++) ys[k] = planes.y[idx[k]];
  const med = medianOf(ys);
  const dev = new Float64Array(n);
  for (let k = 0; k < n; k++) dev[k] = Math.abs(ys[k] - med);
  const sigma = 1.4826 * medianOf(dev);
  const limit = sigma > 0 ? clipSigma * sigma : Infinity;
  let kept = 0;
  let y = 0;
  let l = 0;
  let m = 0;
  for (let k = 0; k < n; k++) {
    if (dev[k] > limit) continue;
    const i = idx[k];
    kept++;
    y += planes.y[i];
    l += planes.l[i];
    m += planes.m[i];
  }
  if (kept === 0) return null;
  const ym = y / kept;
  const lm = l / kept;
  const mm = m / kept;
  let vy = 0;
  let vr = 0;
  for (let k = 0; k < n; k++) {
    if (dev[k] > limit) continue;
    const i = idx[k];
    vy += (planes.y[i] - ym) ** 2;
    const rg = (planes.l[i] - lm) / Math.max(lm, 1e-6) - (planes.m[i] - mm) / Math.max(mm, 1e-6);
    vr += rg * rg;
  }
  return { y: ym, l: lm, m: mm, n: kept, sdRel: Math.sqrt(vy / kept) / Math.max(ym, 1e-6), sdRg: Math.sqrt(vr / kept) };
}

/**
 * Pixels whose distance to `comp` lies in (innerPx, outerPx], skipping `excluded` pixels. Distances are
 * exact Euclidean, from the nearest component pixel.
 */
export function ringPixels(
  comp: Component,
  innerPx: number,
  outerPx: number,
  width: number,
  height: number,
  excluded?: Uint8Array,
): Int32Array {
  const pad = Math.ceil(outerPx) + 1;
  const x0 = Math.max(0, comp.bbox.x - pad);
  const y0 = Math.max(0, comp.bbox.y - pad);
  const x1 = Math.min(width - 1, comp.bbox.x + comp.bbox.w - 1 + pad);
  const y1 = Math.min(height - 1, comp.bbox.y + comp.bbox.h - 1 + pad);
  const w = x1 - x0 + 1;
  const h = y1 - y0 + 1;
  const local = new Uint8Array(w * h);
  for (let k = 0; k < comp.pixels.length; k++) {
    const p = comp.pixels[k];
    const px = p % width;
    local[(Math.floor(p / width) - y0) * w + (px - x0)] = 1;
  }
  const dist = distanceToSet(local, w, h);
  const out: number[] = [];
  for (let ly = 0; ly < h; ly++) {
    for (let lx = 0; lx < w; lx++) {
      const d = dist[ly * w + lx];
      if (d <= innerPx || d > outerPx) continue;
      const gi = (y0 + ly) * width + x0 + lx;
      if (!excluded || !excluded[gi]) out.push(gi);
    }
  }
  return Int32Array.from(out);
}

/**
 * The band directly below a region: for each column the region covers, rows from `gap` to `gap + band`
 * below its lowest pixel in that column, skipping `excluded` pixels.
 */
export function bandBelow(
  comp: Component,
  width: number,
  height: number,
  gapFrac: number,
  heightFrac: number,
  excluded?: Uint8Array,
): Int32Array {
  const bottom = new Int32Array(comp.bbox.w).fill(-1);
  for (let k = 0; k < comp.pixels.length; k++) {
    const p = comp.pixels[k];
    const x = (p % width) - comp.bbox.x;
    const y = Math.floor(p / width);
    if (y > bottom[x]) bottom[x] = y;
  }
  const gap = Math.max(2, Math.round(gapFrac * comp.bbox.h));
  const band = Math.max(8, Math.round(heightFrac * comp.bbox.h));
  const out: number[] = [];
  for (let cx = 0; cx < comp.bbox.w; cx++) {
    if (bottom[cx] < 0) continue;
    const x = comp.bbox.x + cx;
    for (let y = bottom[cx] + gap; y < bottom[cx] + gap + band && y < height; y++) {
      const i = y * width + x;
      if (!excluded || !excluded[i]) out.push(i);
    }
  }
  return Int32Array.from(out);
}

/** Pixels of a pixel-disc annulus (inner < r <= outer) around an integer centre, skipping `excluded`. */
export function annulusPixels(
  cx: number,
  cy: number,
  innerR: number,
  outerR: number,
  width: number,
  height: number,
  excluded?: Uint8Array,
): Int32Array {
  const out: number[] = [];
  const R = Math.ceil(outerR);
  for (let y = Math.max(0, cy - R); y <= Math.min(height - 1, cy + R); y++) {
    for (let x = Math.max(0, cx - R); x <= Math.min(width - 1, cx + R); x++) {
      const r = Math.hypot(x - cx, y - cy);
      if (r <= innerR || r > outerR) continue;
      const i = y * width + x;
      if (!excluded || !excluded[i]) out.push(i);
    }
  }
  return Int32Array.from(out);
}

/** Mean colour of the (2k+1)^2 box around an integer centre (clipped to the image). */
export function boxStat(planes: LinearPlanes, cx: number, cy: number, k = 1): ColorStat {
  let n = 0;
  let y = 0;
  let l = 0;
  let m = 0;
  for (let yy = Math.max(0, cy - k); yy <= Math.min(planes.height - 1, cy + k); yy++) {
    for (let xx = Math.max(0, cx - k); xx <= Math.min(planes.width - 1, cx + k); xx++) {
      const i = yy * planes.width + xx;
      n++;
      y += planes.y[i];
      l += planes.l[i];
      m += planes.m[i];
    }
  }
  return { y: y / n, l: l / n, m: m / n };
}

/** Per-radius mean colour around an integer centre; bin k holds pixels with k - 0.5 <= r < k + 0.5. */
export function radialProfile(planes: LinearPlanes, cx: number, cy: number, maxR: number): ColorStat[] {
  const bins = maxR + 1;
  const sy = new Float64Array(bins);
  const sl = new Float64Array(bins);
  const sm = new Float64Array(bins);
  const cnt = new Uint32Array(bins);
  for (let y = Math.max(0, cy - maxR); y <= Math.min(planes.height - 1, cy + maxR); y++) {
    for (let x = Math.max(0, cx - maxR); x <= Math.min(planes.width - 1, cx + maxR); x++) {
      const k = Math.round(Math.hypot(x - cx, y - cy));
      if (k > maxR) continue;
      const i = y * planes.width + x;
      sy[k] += planes.y[i];
      sl[k] += planes.l[i];
      sm[k] += planes.m[i];
      cnt[k]++;
    }
  }
  return Array.from({ length: bins }, (_, k) =>
    cnt[k] ? { y: sy[k] / cnt[k], l: sl[k] / cnt[k], m: sm[k] / cnt[k] } : { y: NaN, l: NaN, m: NaN },
  );
}

/** Bilinear sample of a plane at fractional coordinates; NaN outside the image. */
export function bilinear(plane: Float32Array, width: number, height: number, x: number, y: number): number {
  if (x < 0 || y < 0 || x > width - 1 || y > height - 1) return NaN;
  const x0 = Math.floor(x);
  const y0 = Math.floor(y);
  const x1 = Math.min(width - 1, x0 + 1);
  const y1 = Math.min(height - 1, y0 + 1);
  const fx = x - x0;
  const fy = y - y0;
  const top = plane[y0 * width + x0] * (1 - fx) + plane[y0 * width + x1] * fx;
  const bot = plane[y1 * width + x0] * (1 - fx) + plane[y1 * width + x1] * fx;
  return top * (1 - fy) + bot * fy;
}
