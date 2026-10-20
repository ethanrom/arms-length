/**
 * Every constant of the visibility model, with its source.
 * Research notes: internal/research/vision-science.md (section numbers below refer to it).
 * Nothing here is fitted by us; the only choices we made are marked "ours".
 */

/** Watson & Ahumada (2005) standard-model parameters (Table 5), HPmH CSF + Gaussian aperture + Minkowski pooling. */
export interface StandardParams {
  /** CSF gain G (DC gain is G * (1 - a)). */
  gain: number;
  /** HPmH CSF: S(f) = G * (sech[(f/f0)^p] - a * sech[f/f1]), f in cycles/degree. */
  f0: number;
  f1: number;
  a: number;
  p: number;
  /** Minkowski pooling exponent. */
  beta: number;
  /** Gaussian aperture sd in degrees. */
  sigma: number;
}

/**
 * Standard A (beta free): RMS error 1.0329 dB over the 43 ModelFest stimuli; CSF peak 217.3 at 3.45 cpd.
 * Source: Watson & Ahumada (2005), J. Vision 5(9):6, Table 5 (research 1.4). Reproduced to 1.0328 dB (research 1.6).
 */
export const STANDARD_A: StandardParams = {
  gain: 373.08,
  f0: 4.1726,
  f1: 1.3625,
  a: 0.8493,
  p: 0.7786,
  beta: 2.4081,
  sigma: 0.6273,
};

/** Standard B (beta = 2, the fallback): RMS 1.1216 dB; CSF peak 289.0 at 3.62 cpd. Same source as A. */
export const STANDARD_B: StandardParams = {
  gain: 501.2,
  f0: 4.3469,
  f1: 1.4476,
  a: 0.8514,
  p: 0.7929,
  beta: 2,
  sigma: 0.3652,
};

/** Oblique effect (Watson & Ahumada 2005, Eq. 5): fixed from Berkley et al. 1975, not fitted (research 1.3). */
export const OBLIQUE = { gamma: 3.48, lambda: 13.57 } as const;

/** Model conventions (research 1.5): 120 pixels/degree, 256 x 256 grid, DC gain kept. */
export const MODEL_GRID = { ppd: 120, n: 256 } as const;
/** Field of the standard grid in degrees (256 / 120). */
export const STANDARD_FIELD_DEG = MODEL_GRID.n / MODEL_GRID.ppd;

/**
 * Luminance at which ModelFest thresholds were measured, cd/m^2 (research 1.5: 30 +/- 5).
 * The tables are for this luminance; `luminanceGain` in castle.ts moves them to the viewing luminance.
 */
export const MODELFEST_LUMINANCE = 30;

/**
 * Bound margin in dB: the detector is assumed this much more sensitive than Standard A (research 9.4: best of
 * 16 ModelFest observers 4.2 dB + model residual on skin-like shapes). Range 0..9 dB.
 */
export const DEFAULT_MARGIN_DB = 6;

/** Viewing luminance presets for the face, cd/m^2 (research 7; Lambertian skin at rho 0.35). */
export const LUMINANCE_PRESETS = {
  /** Home, evening: 50-150 lx. */
  home: 12,
  /** Indoor / office: about 400 lx. (The contract's DEFAULT_VIEWING uses 100, a documented difference.) */
  indoor: 45,
  /** Overcast / window light: 1,000-5,000 lx. */
  overcast: 300,
  /** Daylight, shade or bright: 10,000-25,000 lx. */
  daylight: 1000,
  /** Video call: adapted to a 200-300 cd/m^2 screen, face luminance about 0.35 of white. */
  videoCall: 80,
} as const;

/** Pore: `diameterMm` is read as the FWHM of the blob (research 9.3); sd = FWHM / (2 sqrt(2 ln 2)). */
export const FWHM_PER_SD = 2 * Math.sqrt(2 * Math.LN2);

/**
 * Soft-edged disk used for region concerns (dark circles, eye bags, redness): an equal-area disk blurred with a
 * Gaussian whose sd is this fraction of the diameter. Ours (research 9.3 says "soft-edged disk", no number).
 * 0.1 gives a 10-90% edge width of 26% of the diameter; the centre stays within 1e-5 of the plateau.
 */
export const SOFT_DISK_EDGE_SD_FRACTION = 0.1;

/** Gabor patch used for the Peli "patch CSF": sd = 0.5621 / f0 degrees is a 1-octave bandwidth (research 6.3). */
export const PATCH_GABOR_SD_CYCLES = 0.5621;

/** Distance scan (research 9.4): 1 cm to 50 m at about 40 points per decade, then bisection. */
export const SCAN = { minM: 0.01, maxM: 50, pointsPerDecade: 40 } as const;

/**
 * Luminance factor g(L, f*) (research 9.2): f* = 1/(4 s) cpd for a blob of angular sd s, clipped to this range.
 * UNVERIFIED heuristic (research 10, item 9); for the bound `max(1, g)` is used.
 */
export const LUMINANCE_FACTOR_FREQ_RANGE = [1, 16] as const;

// ---------------------------------------------------------------------------------------------
// castleCSF static, foveal parameters (MATLAB `CSF_castleCSF.get_default_par`, MIT; research 4.3.1).
// Ashraf, Mantiuk, Chapiro, Wuerger (2024) J. Vision 24(4):5.
// ---------------------------------------------------------------------------------------------

export interface CastleAchromatic {
  /** S_max(L) = p1 (1 + p2/L)^-p3 (1 - (1 + p4/L)^-p5) */
  sMax: readonly [number, number, number, number, number];
  /** f_max(L) = p1 (1 + p2/L)^-p3 */
  fMax: readonly [number, number, number];
  bw: number;
  a: number;
  /** Critical area A0 (deg^2) and frequency f0 (cpd) of the Rovamo et al. (1993) area model. */
  area0: number;
  f0: number;
}

export interface CastleChromatic {
  sMax: readonly [number, number, number];
  /** Constant f_max (cpd). */
  fMax: number;
  bw: number;
  area0: number;
  f0: number;
}

export const CASTLE_ACH: CastleAchromatic = {
  sMax: [56.4947, 7.54726, 0.144532, 5.58341e-7, 9.66862e9],
  fMax: [1.78119, 91.5718, 0.256682],
  bw: 0.000213047,
  a: 0.100207,
  area0: 157.103,
  f0: 0.702338,
};

export const CASTLE_RG: CastleChromatic = {
  sMax: [681.434, 38.0038, 0.480386],
  fMax: 0.0178364,
  bw: 2.42104,
  area0: 2816.44,
  f0: 0.0711058,
};

export const CASTLE_YV: CastleChromatic = {
  sMax: [166.683, 62.8974, 0.41193],
  fMax: 0.00425753,
  bw: 2.68197,
  area0: 2.82789e7,
  f0: 0.000635093,
};

/**
 * Disc extension (castleCSF `sensitivity_edge`, paper Eq. 31): S_disc = k_r r^(1/beta) max_rho S(rho, A = discArea).
 * beta and area are the paper's fitted values. k_r = 2 pi: the paper's circumference form, which fits the
 * repo's own hdr_csf_disc data (RMS 3.17 dB vs 5.54 dB for the repo code's k_r = 1; research 4.3.3).
 */
export const CASTLE_DISC = {
  beta: 3.01142,
  area: 2.42437,
  kr: 2 * Math.PI,
  rhoMin: 0.125,
  rhoMax: 16,
  rhoSteps: 64,
  /** Smallest disc radius (deg) in the castleCSF disc data; below it S scales as r^2 (Ricco; research 4.3.3). */
  validRadiusDeg: 0.083,
} as const;

/** castleCSF colour mechanism matrix entries (`colmat` in CSF_castleCSF.m; Wuerger et al. 2020). */
export const CASTLE_COLMAT = { rg: 2.3112, yv: 50.9875 } as const;

/**
 * Linear sRGB -> castleCSF cone space (CIE 2006 2-degree LMS, L + M = Y): xyz2lms2006 * sRGB->XYZ (research 5.1).
 * Row-major 3x3.
 */
export const SRGB_TO_CASTLE_LMS = [
  0.201315, 0.48242, 0.051011, //
  0.031887, 0.246411, 0.037985, //
  0.000361, 0.002012, 0.018447,
] as const;

/**
 * Mapping from the contract's `Contrast` pair to castleCSF's red-green channel contrast
 * C_RG = |dL - 2.3112 dM| / (L0 + M0). With w_L = L0 / (L0 + M0) and cone contrasts cL, cM:
 *   C_RG = |(w_L - 2.3112 w_M) * lum + 3.3112 * w_L * w_M * rg|,   lum = w_L cL + w_M cM,  rg = cL - cM.
 * w_L = 0.7285 is the skin exemplar sRGB (205, 155, 135) in castle cone space (research 5.3). Checked: this
 * reproduces castleCSF's C_RG to 3% on four skin / redder-patch pairs. Ours.
 */
export const RG_CONTRAST_MAP = (() => {
  const wL = 0.7285;
  const wM = 1 - wL;
  return { lum: wL - CASTLE_COLMAT.rg * wM, rg: (1 + CASTLE_COLMAT.rg) * wL * wM };
})();

// ---------------------------------------------------------------------------------------------
// Renderer (Peli pyramid)
// ---------------------------------------------------------------------------------------------

export const RENDERER = {
  /** Longest side of the working image; larger photos are processed at this size (documented in renderer.ts). */
  maxWorkSide: 512,
  /** Octaves per band: 1 = Peli (1990) octave bands, 2 = half-octave bands. */
  bandsPerOctave: 1,
  /** Soft knee on |contrast| / threshold: weight rises from 0 at kneeLo to 1 at kneeHi. Ours (Peli: hard step at 1). */
  kneeLo: 0.7,
  kneeHi: 1.3,
  /** Floor on the local mean luminance (linear, 0..1) in the contrast denominator. Ours. */
  localMeanFloor: 0.02,
} as const;
