/**
 * Static, foveal port of castleCSF (Ashraf, Mantiuk, Chapiro & Wuerger 2024, "castleCSF - a contrast sensitivity
 * function of color, area, spatio-temporal frequency, luminance and eccentricity", J. Vision 24(4):5).
 * Ported from the MATLAB classes CSF_castleCSF, CSF_castleCSF_chrom and CSF_stelaCSF_lum_peak at
 * https://github.com/gfxdisp/castleCSF (v0.2.4). Only what a static, centrally fixated target needs: temporal
 * response = 1, eccentricity drop = 1, achromatic transient channel dropped (below 1e-5 for L >= 0.02 cd/m^2).
 *
 * castleCSF is distributed under the MIT License:
 *
 *   Copyright (c) 2023 Graphics and Displays group - University of Cambridge
 *
 *   Permission is hereby granted, free of charge, to any person obtaining a copy of this software and associated
 *   documentation files (the "Software"), to deal in the Software without restriction, including without
 *   limitation the rights to use, copy, modify, merge, publish, distribute, sublicense, and/or sell copies of the
 *   Software, and to permit persons to whom the Software is furnished to do so, subject to the following
 *   conditions:
 *
 *   The above copyright notice and this permission notice shall be included in all copies or substantial portions
 *   of the Software.
 *
 *   THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED
 *   TO THE WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL
 *   THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF
 *   CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER
 *   DEALINGS IN THE SOFTWARE.
 *
 * Bit-exactness against the MATLAB code is not tested (no MATLAB here); castle.test.ts checks rows of the repo's own
 * data files against a Python port that reproduces the paper's per-dataset errors (research 4.3.1).
 */
import {
  CASTLE_ACH,
  CASTLE_COLMAT,
  CASTLE_DISC,
  CASTLE_RG,
  CASTLE_YV,
  LUMINANCE_FACTOR_FREQ_RANGE,
  MODELFEST_LUMINANCE,
  RG_CONTRAST_MAP,
  SRGB_TO_CASTLE_LMS,
  type CastleChromatic,
} from "./params";

export type Vec3 = readonly [number, number, number];

/** Luminance dependence of a parameter: 3 params p1 (1 + p2/L)^-p3, optionally x (1 - (1 + p4/L)^-p5). */
export function lumDep(p: readonly number[], L: number): number {
  const base = p[0] * Math.pow(1 + p[1] / L, -p[2]);
  if (p.length === 3) return base;
  // (1 + p4/L)^-p5 with p5 ~ 1e10 needs log1p to stay accurate.
  return base * (1 - Math.exp(-p[4] * Math.log1p(p[3] / L)));
}

/** Rovamo et al. (1993) area model factor: sqrt(Ac / (1 + Ac/A)) * rho, Ac = A0 / (1 + (rho/f0)^2). */
function areaTerm(rho: number, area: number, area0: number, f0: number): number {
  const ac = area0 / (1 + (rho / f0) * (rho / f0));
  return Math.sqrt(ac / (1 + ac / area)) * rho;
}

/** Peak sensitivity of the achromatic sustained channel before the area term: S_max(L) * truncated log-parabola. */
export function achromaticPeak(rho: number, L: number): number {
  const P = CASTLE_ACH;
  const sMax = lumDep(P.sMax, L);
  const fMax = lumDep(P.fMax, L);
  const d = Math.log10(rho) - Math.log10(fMax);
  let slp = Math.pow(10, -(d * d) / Math.pow(2, P.bw));
  if (rho < fMax && slp < 1 - P.a) slp = 1 - P.a;
  return sMax * slp;
}

/** Achromatic sustained sensitivity S_A(rho, A, L): 1 / (Weber contrast threshold) of a Gabor, static, fovea. */
export function achromaticSensitivity(rho: number, area: number, L: number): number {
  return achromaticPeak(rho, L) * areaTerm(rho, area, CASTLE_ACH.area0, CASTLE_ACH.f0);
}

function chromaticPeak(P: CastleChromatic, rho: number, L: number): number {
  const sMax = lumDep(P.sMax, L);
  let slp = 1;
  if (rho >= P.fMax) {
    const d = Math.log10(rho) - Math.log10(P.fMax);
    slp = Math.pow(10, -(d * d) / Math.pow(2, P.bw));
  }
  return sMax * slp;
}

export type ChromaticChannel = "rg" | "yv";
const CHANNELS: Record<ChromaticChannel, CastleChromatic> = { rg: CASTLE_RG, yv: CASTLE_YV };

/** Red-green or yellow-violet sustained sensitivity S_c(rho, A, L), static, fovea. */
export function chromaticSensitivity(channel: ChromaticChannel, rho: number, area: number, L: number): number {
  const P = CHANNELS[channel];
  return chromaticPeak(P, rho, L) * areaTerm(rho, area, P.area0, P.f0);
}

export interface ChannelSensitivities {
  ach: number;
  rg: number;
  yv: number;
}

export function channelSensitivities(rho: number, area: number, L: number): ChannelSensitivities {
  return {
    ach: achromaticSensitivity(rho, area, L),
    rg: chromaticSensitivity("rg", rho, area, L),
    yv: chromaticSensitivity("yv", rho, area, L),
  };
}

// ---- discs (small isolated features), castleCSF `sensitivity_edge` -------------------------------------------

const peakCache = new Map<string, number>();

/**
 * max over rho in [0.125, 16] cpd (64 log-spaced) of the channel sensitivity at the disc model's fixed area.
 * Independent of the disc radius, so cached per (channel, L).
 */
export function discPeakSensitivity(channel: "ach" | ChromaticChannel, L: number): number {
  const key = `${channel}|${L}`;
  const hit = peakCache.get(key);
  if (hit !== undefined) return hit;
  const { rhoMin, rhoMax, rhoSteps, area } = CASTLE_DISC;
  let best = 0;
  for (let i = 0; i < rhoSteps; i++) {
    const rho = rhoMin * Math.pow(rhoMax / rhoMin, i / (rhoSteps - 1));
    const s = channel === "ach" ? achromaticSensitivity(rho, area, L) : chromaticSensitivity(channel, rho, area, L);
    if (s > best) best = s;
  }
  if (peakCache.size > 512) peakCache.clear();
  peakCache.set(key, best);
  return best;
}

/**
 * Channel sensitivity for a disc of radius `radiusDeg`: k_r r^(1/beta) max_rho S(rho, A_disc, L) (paper Eq. 31),
 * valid from the smallest measured radius (0.083 deg). Below it the heuristic S proportional to r^2 (Ricco's law)
 * is used instead, anchored at 0.083 deg (research 4.3.3, UNVERIFIED), because r^(1/beta) falls far too slowly.
 */
export function discSensitivity(channel: "ach" | ChromaticChannel, radiusDeg: number, L: number): number {
  const { beta, kr, validRadiusDeg } = CASTLE_DISC;
  const peak = discPeakSensitivity(channel, L);
  if (radiusDeg >= validRadiusDeg) return peak * Math.pow(kr * radiusDeg, 1 / beta);
  const atEdge = peak * Math.pow(kr * validRadiusDeg, 1 / beta);
  const q = radiusDeg / validRadiusDeg;
  return atEdge * q * q;
}

// ---- luminance factor (research 9.2) ------------------------------------------------------------------------

/**
 * g(L, f*) = achromatic sustained sensitivity at (f*, L) over the same at (f*, 30 cd/m^2). The area term does not
 * depend on L, so it cancels. f* is clipped to 1-16 cpd. Moves the ModelFest-calibrated (30 cd/m^2) thresholds to
 * the viewing luminance: thresholds divide by g. UNVERIFIED heuristic; the bound uses max(1, g).
 */
export function luminanceGain(L: number, fStar: number): number {
  const [lo, hi] = LUMINANCE_FACTOR_FREQ_RANGE;
  const f = Math.min(hi, Math.max(lo, fStar));
  const lum = Math.max(L, 0.02);
  return achromaticPeak(f, lum) / achromaticPeak(f, MODELFEST_LUMINANCE);
}

// ---- cone space and channel contrasts -----------------------------------------------------------------------

/** Linear sRGB (0..1) to castleCSF cone space (L + M = Y). */
export function srgbLinearToCastleLms(r: number, g: number, b: number): [number, number, number] {
  const m = SRGB_TO_CASTLE_LMS;
  return [
    m[0] * r + m[1] * g + m[2] * b,
    m[3] * r + m[4] * g + m[5] * b,
    m[6] * r + m[7] * g + m[8] * b,
  ];
}

/** Absolute post-receptoral channel responses |A|, |RG|, |YV| of an LMS triple (castleCSF `get_lms2acc`). */
function postReceptoral(lms: Vec3): [number, number, number] {
  const [L, M, S] = lms;
  return [Math.abs(L + M), Math.abs(L - CASTLE_COLMAT.rg * M), Math.abs(-L - M + CASTLE_COLMAT.yv * S)];
}

/** Channel contrasts C_A, C_RG, C_YV of a modulation `delta` on background `bg`, all over the achromatic background. */
export function channelContrasts(bg: Vec3, delta: Vec3): ChannelSensitivities {
  const b = postReceptoral(bg);
  const d = postReceptoral(delta);
  return { ach: d[0] / b[0], rg: d[1] / b[0], yv: d[2] / b[0] };
}

/**
 * The detection scale k such that k * delta is at threshold (castleCSF `det_threshold`): channels are combined by
 * energy summation, k = 1 / sqrt((S_A C_A)^2 + (S_RG C_RG)^2 + (S_YV C_YV)^2).
 */
function detectionScale(rho: number, area: number, bg: Vec3, delta: Vec3): number {
  const L = bg[0] + bg[1];
  const c = channelContrasts(bg, delta);
  const s = channelSensitivities(rho, area, L);
  return 1 / Math.hypot(c.ach * s.ach, c.rg * s.rg, c.yv * s.yv);
}

/** Cone-contrast sensitivity of a Gabor of spatial frequency `rho` (cpd) and area (deg^2): castleCSF `sensitivity`. */
export function coneSensitivity(rho: number, area: number, bg: Vec3, delta: Vec3): number {
  const k = detectionScale(rho, area, bg, delta);
  const sum = (k * delta[0]) ** 2 / bg[0] ** 2 + (k * delta[1]) ** 2 / bg[1] ** 2 + (k * delta[2]) ** 2 / bg[2] ** 2;
  return 1 / (Math.sqrt(sum) / Math.sqrt(3));
}

/** Cone-contrast sensitivity of a disc of the given radius: castleCSF `sensitivity_edge` (k_r = 2 pi). */
export function discConeSensitivity(radiusDeg: number, bg: Vec3, delta: Vec3): number {
  const { rhoMin, rhoMax, rhoSteps, area, beta, kr } = CASTLE_DISC;
  let best = 0;
  for (let i = 0; i < rhoSteps; i++) {
    const rho = rhoMin * Math.pow(rhoMax / rhoMin, i / (rhoSteps - 1));
    best = Math.max(best, coneSensitivity(rho, area, bg, delta));
  }
  return best * Math.pow(kr * radiusDeg, 1 / beta);
}

/**
 * castleCSF red-green channel contrast C_RG from the contract's `Contrast` pair (Weber luminance contrast and
 * cone-contrast difference dL/L - dM/M), see RG_CONTRAST_MAP in params.ts.
 */
export function castleRgContrast(lum: number, rg: number): number {
  return Math.abs(RG_CONTRAST_MAP.lum * lum + RG_CONTRAST_MAP.rg * rg);
}
