/**
 * "Step back" renderer: the photo as an ideal observer perceives it at a viewing distance (research 6 and 9.7).
 *
 * Method (Peli 1990 pyramid, Peli 1996 simulation):
 *  1. Linear luminance Y of the photo. Cosine-log band-pass images a_j (octave bands, centre 2^j cycles/picture, a
 *     partition of unity) plus a low-pass residual l_0, obtained in the Fourier domain. They are computed once per
 *     photo and cached, so moving the distance slider only re-thresholds.
 *  2. Local band contrast c_j = a_j / l_j, l_j = l_0 + sum of the bands below j (Peli's low-pass image).
 *  3. Each band's centre frequency in cpd is 2^j / (N * p), p = degrees per pixel at the viewing distance (from the
 *     scale estimate) divided by the acuity scale, N the padded grid size. Its threshold is the Standard A "patch
 *     CSF" (1-octave Gabor patch, tables/patch.json), divided by the luminance factor g(L, f) at the viewing
 *     luminance (max(1, g) in the bound view) and by 10^(marginDb/20): the same margin as the distances, so picture
 *     and numbers agree. Detail above threshold keeps its full contrast; below it fades (soft knee, below).
 *  4. Reconstruct Y' = l_0 + sum a_j * w(|c_j| / threshold_j) and apply the ratio Y'/Y to linear RGB: colour is
 *     preserved, alpha is copied.
 *
 * Choices of ours: the weight w is a smoothstep from 0 at 0.7x to 1 at 1.3x threshold instead of Peli's hard step
 * (no banding when the slider moves; the knee is +/-30% of the threshold); l_j is floored at 0.02 of white.
 *
 * Speed. Photos larger than 512 px on the long side are processed at <= 512 px (area-averaged), padded by mirror
 * reflection to powers of two for the FFT. The luminance detail above the working Nyquist frequency is not lost: it
 * is the residual Y - upsample(Y_work), gated as one extra band centred at 1.5x the working Nyquist and added back
 * at full resolution. A 512 x 512 photo takes about 150 ms the first time and about 25 ms per slider move after that.
 */
import type { RgbaImage, ScaleEstimate } from "../contracts/measure";
import type { DistanceRenderer, ViewingConditions } from "../contracts/vision";
import { luminanceGain } from "./castle";
import { fft2d, nextPow2 } from "./fft";
import { angleDeg } from "./geometry";
import { DEFAULT_MARGIN_DB, RENDERER } from "./params";
import { patchThresholdLookup } from "./tables";

const SRGB_DECODE = new Float32Array(256);
for (let i = 0; i < 256; i++) {
  const c = i / 255;
  SRGB_DECODE[i] = c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
}
const ENCODE_STEPS = 8192;
const SRGB_ENCODE = new Uint8ClampedArray(ENCODE_STEPS + 1);
for (let i = 0; i <= ENCODE_STEPS; i++) {
  const v = i / ENCODE_STEPS;
  SRGB_ENCODE[i] = Math.round(255 * (v <= 0.0031308 ? 12.92 * v : 1.055 * Math.pow(v, 1 / 2.4) - 0.055));
}

const encode = (v: number): number => SRGB_ENCODE[v <= 0 ? 0 : v >= 1 ? ENCODE_STEPS : Math.round(v * ENCODE_STEPS)];

function luminanceOf(data: Uint8ClampedArray, n: number): Float32Array {
  const y = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    y[i] = 0.2126729 * SRGB_DECODE[data[i * 4]] + 0.7151522 * SRGB_DECODE[data[i * 4 + 1]] + 0.072175 * SRGB_DECODE[data[i * 4 + 2]];
  }
  return y;
}

/** Area-average resize of a width x height plane to dw x dh (dw <= width, dh <= height). */
function boxResize(src: Float32Array, width: number, height: number, dw: number, dh: number): Float32Array {
  if (dw === width && dh === height) return src;
  const along = (len: number, dlen: number) => {
    const r = len / dlen;
    const start = new Int32Array(dlen);
    const weights: Float64Array[] = new Array(dlen);
    for (let i = 0; i < dlen; i++) {
      const s0 = i * r;
      const s1 = (i + 1) * r;
      const j0 = Math.floor(s0);
      const j1 = Math.min(len, Math.ceil(s1));
      const w = new Float64Array(j1 - j0);
      for (let j = j0; j < j1; j++) w[j - j0] = (Math.min(s1, j + 1) - Math.max(s0, j)) / r;
      start[i] = j0;
      weights[i] = w;
    }
    return { start, weights };
  };
  const ax = along(width, dw);
  const ay = along(height, dh);
  const tmp = new Float32Array(height * dw);
  for (let y = 0; y < height; y++) {
    for (let i = 0; i < dw; i++) {
      const w = ax.weights[i];
      let s = 0;
      for (let k = 0; k < w.length; k++) s += w[k] * src[y * width + ax.start[i] + k];
      tmp[y * dw + i] = s;
    }
  }
  const out = new Float32Array(dw * dh);
  for (let j = 0; j < dh; j++) {
    const w = ay.weights[j];
    for (let k = 0; k < w.length; k++) {
      const row = (ay.start[j] + k) * dw;
      const wk = w[k];
      for (let i = 0; i < dw; i++) out[j * dw + i] += wk * tmp[row + i];
    }
  }
  return out;
}

/** Index of x mirrored into [0, n) (symmetric reflection, period 2n). */
function reflect(i: number, n: number): number {
  const m = ((i % (2 * n)) + 2 * n) % (2 * n);
  return m < n ? m : 2 * n - 1 - m;
}

/** Cosine-log band weight (Peli 1990, A2) for band j with centres at j * delta octaves; bands 0 and J are open-ended. */
function bandWeight(j: number, last: number, delta: number, u: number): number {
  const cj = j * delta;
  if (j === 0 && u <= 0) return 1;
  if (j === last && u >= cj) return 1;
  const d = (u - cj) / delta;
  return d > -1 && d < 1 ? 0.5 * (1 + Math.cos(Math.PI * d)) : 0;
}

interface Pyramid {
  /** Band images at working size: [0] is the low-pass residual l_0, [1..last] the band-pass images. */
  bands: Float32Array[];
  last: number;
  delta: number;
  /** Padded FFT size along the longer side (cycles/picture reference). */
  nRef: number;
}

function buildPyramid(y: Float32Array, w: number, h: number): Pyramid {
  const padW = nextPow2(w);
  const padH = nextPow2(h);
  const re = new Float64Array(padW * padH);
  const im = new Float64Array(padW * padH);
  for (let py = 0; py < padH; py++) {
    const sy = reflect(py, h) * w;
    for (let px = 0; px < padW; px++) re[py * padW + px] = y[sy + reflect(px, w)];
  }
  fft2d(re, im, padW, padH, false);

  const nRef = Math.max(padW, padH);
  const delta = 1 / RENDERER.bandsPerOctave;
  const last = Math.max(1, Math.round(Math.log2(nRef / 2) / delta));

  // u = log2(cycles per picture) per DFT bin.
  const u = new Float32Array(padW * padH);
  for (let ky = 0; ky < padH; ky++) {
    const fy = (ky < padH / 2 ? ky : ky - padH) / padH;
    for (let kx = 0; kx < padW; kx++) {
      const fx = (kx < padW / 2 ? kx : kx - padW) / padW;
      u[ky * padW + kx] = Math.log2(nRef * Math.hypot(fx, fy));
    }
  }

  const bands: Float32Array[] = new Array(last + 1);
  const zr = new Float64Array(padW * padH);
  const zi = new Float64Array(padW * padH);
  for (let j = 0; j <= last; j += 2) {
    const hasNext = j + 1 <= last;
    for (let i = 0; i < zr.length; i++) {
      const wa = bandWeight(j, last, delta, u[i]);
      const wb = hasNext ? bandWeight(j + 1, last, delta, u[i]) : 0;
      zr[i] = re[i] * wa - im[i] * wb;
      zi[i] = im[i] * wa + re[i] * wb;
    }
    fft2d(zr, zi, padW, padH, true);
    const a = new Float32Array(w * h);
    const b = hasNext ? new Float32Array(w * h) : null;
    for (let py = 0; py < h; py++) {
      for (let px = 0; px < w; px++) {
        a[py * w + px] = zr[py * padW + px];
        if (b) b[py * w + px] = zi[py * padW + px];
      }
    }
    bands[j] = a;
    if (b) bands[j + 1] = b;
  }
  return { bands, last, delta, nRef };
}

interface Prepared {
  width: number;
  height: number;
  workW: number;
  workH: number;
  yFull: Float32Array;
  yWork: Float32Array;
  pyramid: Pyramid;
  photo: RgbaImage;
  fingerprint: number;
}

function fingerprint(photo: RgbaImage): number {
  let h = (photo.width * 73856093) ^ (photo.height * 19349663);
  const d = photo.data;
  for (let i = 0; i < d.length; i += 7) h = (Math.imul(h, 16777619) ^ d[i]) | 0;
  return h;
}

function prepare(photo: RgbaImage): Prepared {
  const { width, height } = photo;
  const s = Math.min(1, RENDERER.maxWorkSide / Math.max(width, height));
  const workW = Math.max(1, Math.round(width * s));
  const workH = Math.max(1, Math.round(height * s));
  const yFull = luminanceOf(photo.data, width * height);
  const yWork = boxResize(yFull, width, height, workW, workH);
  return {
    width,
    height,
    workW,
    workH,
    yFull,
    yWork,
    pyramid: buildPyramid(yWork, workW, workH),
    photo,
    fingerprint: fingerprint(photo),
  };
}

const smooth = (q: number): number => {
  const t = (q - RENDERER.kneeLo) / (RENDERER.kneeHi - RENDERER.kneeLo);
  return t <= 0 ? 0 : t >= 1 ? 1 : t * t * (3 - 2 * t);
};

/** Bilinear sampling positions for upsampling a work-size plane to full size along one axis. */
function upAxis(full: number, work: number): { i0: Int32Array; t: Float32Array } {
  const i0 = new Int32Array(full);
  const t = new Float32Array(full);
  for (let x = 0; x < full; x++) {
    const s = Math.min(work - 1, Math.max(0, ((x + 0.5) * work) / full - 0.5));
    const f = Math.min(work - 2, Math.floor(s));
    i0[x] = Math.max(0, f);
    t[x] = work > 1 ? s - i0[x] : 0;
  }
  return { i0, t };
}

function render(
  p: Prepared,
  scale: ScaleEstimate,
  viewing: ViewingConditions,
  distanceM: number,
): RgbaImage {
  const { width, height, workW, workH, pyramid } = p;
  const marginDb = viewing.marginDb ?? DEFAULT_MARGIN_DB;
  const bound = marginDb > 0;
  const a = viewing.acuityScale > 0 ? viewing.acuityScale : 1;
  const d = Math.max(distanceM, 0.01);
  // Degrees per working pixel (one working pixel spans width / workW photo pixels).
  const pxDeg = angleDeg(scale.mmPerPx * (width / workW), d) / a;
  const marginGain = Math.pow(10, -marginDb / 20);

  const thresholdAt = (fCpd: number): number => {
    let g = luminanceGain(viewing.luminanceCdM2, fCpd);
    if (bound) g = Math.max(1, g);
    return (patchThresholdLookup(fCpd) / g) * marginGain;
  };

  // Reconstruct luminance at working size.
  const n = workW * workH;
  const lowPass = pyramid.bands[0];
  const local = Float32Array.from(lowPass);
  const out = Float32Array.from(lowPass);
  const floor = RENDERER.localMeanFloor;
  for (let j = 1; j <= pyramid.last; j++) {
    const f = Math.pow(2, j * pyramid.delta) / (pyramid.nRef * pxDeg);
    const inv = 1 / thresholdAt(f);
    const band = pyramid.bands[j];
    for (let i = 0; i < n; i++) {
      const v = band[i];
      const l = local[i] > floor ? local[i] : floor;
      out[i] += v * smooth((Math.abs(v) / l) * inv);
      local[i] += v;
    }
  }

  const src = p.photo.data;
  const dst = new Uint8ClampedArray(src.length);
  const full = width === workW && height === workH;
  const gateHigh = full ? 0 : 1 / thresholdAt(0.75 / pxDeg); // residual band centred at 1.5 x working Nyquist
  const ax = full ? null : upAxis(width, workW);
  const ay = full ? null : upAxis(height, workH);

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const i = y * width + x;
      let yNew: number;
      if (full) {
        yNew = out[i];
      } else {
        const x0 = ax!.i0[x];
        const y0 = ay!.i0[y];
        const tx = ax!.t[x];
        const ty = ay!.t[y];
        const x1 = Math.min(workW - 1, x0 + 1);
        const y1 = Math.min(workH - 1, y0 + 1);
        const a00 = y0 * workW + x0;
        const a01 = y0 * workW + x1;
        const a10 = y1 * workW + x0;
        const a11 = y1 * workW + x1;
        const w00 = (1 - tx) * (1 - ty);
        const w01 = tx * (1 - ty);
        const w10 = (1 - tx) * ty;
        const w11 = tx * ty;
        const upOut = out[a00] * w00 + out[a01] * w01 + out[a10] * w10 + out[a11] * w11;
        const upSrc = p.yWork[a00] * w00 + p.yWork[a01] * w01 + p.yWork[a10] * w10 + p.yWork[a11] * w11;
        const resid = p.yFull[i] - upSrc;
        const l = upSrc > floor ? upSrc : floor;
        yNew = upOut + resid * smooth((Math.abs(resid) / l) * gateHigh);
      }
      const yOld = p.yFull[i];
      let ratio = yOld > 1e-4 ? (yNew > 0 ? yNew : 0) / yOld : 1;
      if (ratio > 4) ratio = 4;
      const o = i * 4;
      dst[o] = encode(SRGB_DECODE[src[o]] * ratio);
      dst[o + 1] = encode(SRGB_DECODE[src[o + 1]] * ratio);
      dst[o + 2] = encode(SRGB_DECODE[src[o + 2]] * ratio);
      dst[o + 3] = src[o + 3];
    }
  }
  return { width, height, data: dst };
}

/** Prepare a photo once (pyramid) and get a function that renders it at any distance. */
export function prepareDistanceView(photo: RgbaImage): (scale: ScaleEstimate, viewing: ViewingConditions, distanceM: number) => RgbaImage {
  const prepared = prepare(photo);
  return (scale, viewing, distanceM) => render(prepared, scale, viewing, distanceM);
}

let cached: Prepared | null = null;

/**
 * The contract's DistanceRenderer. The pyramid of the last photo is kept (matched by object identity and a content
 * fingerprint), so repeated calls on the same photo, as when the slider moves, only re-threshold.
 */
export const renderDistanceView: DistanceRenderer = (photo, scale, viewing, distanceM) => {
  if (!cached || cached.photo !== photo || cached.fingerprint !== fingerprint(photo)) cached = prepare(photo);
  return render(cached, scale, viewing, distanceM);
};
