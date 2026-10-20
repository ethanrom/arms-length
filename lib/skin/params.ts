/**
 * Every tunable number of the skin-measurement stage, with why it has that value.
 * "Heuristic" means chosen from the recorded masks/photos (internal/research/spike.md) and not taken
 * from a published model; none of these feed the vision model's parameters.
 */

/** Components smaller than this (px) are not features: rendering specks (spike: age-spot p10 is 47 px). */
export const MIN_SPOT_AREA_PX = 6;

/** Closed contours enclosing more than this many px are not spots (largest HD spot seen: 2,492 px). */
export const MAX_SPOT_HOLE_PX = 20_000;

/**
 * Wrinkle fragments are dropped when their skeleton path is shorter than this (px) or their area is
 * under MIN_LINE_AREA_PX. Strokes are drawn about 3 px wide, so anything shorter than 8 px is a dot-like
 * artefact (roughly a fifth of the 229/242 HD components on p2b/p3a).
 */
export const MIN_LINE_LENGTH_PX = 8;
export const MIN_LINE_AREA_PX = 12;

/** Region fragments under this area (px) are dropped: eye-bag outline dashes are about 28 px. */
export const MIN_REGION_AREA_PX = 400;

/** Region masks are graded; the region extent is where the mask exceeds this share of its maximum. */
export const REGION_EXTENT_FRACTION = 0.15;
/** ... but never below this absolute alpha step. */
export const REGION_MIN_DIFF = 6;

/**
 * Surround ring for contour features (age spots), measured outward from the spot boundary:
 * from max(INNER_MIN_PX, INNER_FRAC * d) to inner + max(RING_MIN_PX, RING_FRAC * d), where d is the
 * equivalent diameter. About 0.75-1.75 diameters from the spot centre for a typical 13 px spot.
 * Heuristic: near enough to share the local skin tone, far enough to skip the anti-aliased edge.
 */
export const RING_INNER_MIN_PX = 2;
export const RING_INNER_FRAC = 0.25;
export const RING_WIDTH_MIN_PX = 4;
export const RING_WIDTH_FRAC = 0.75;
/** A ring with fewer usable pixels than this is widened (x1.6, three times) before falling back. */
export const MIN_RING_PIXELS = 24;

/** Surround statistics reject pixels further than this many robust sigmas (MAD) from the median. */
export const SURROUND_CLIP_SIGMA = 3;

/** Dark-circle / eye-bag reference band below the region: gap and height as fractions of region height. */
export const BAND_GAP_FRAC = 0.12;
export const BAND_HEIGHT_FRAC = 0.4;
export const MIN_BAND_PIXELS = 400;

/** Smallest skin reference sample (px) for redness and as the global fallback. */
export const MIN_REFERENCE_PIXELS = 2_000;

/**
 * Markers (pores, acne). The mask gives location only; the dot/ring size (7-9 px dots, 17 px rings) is
 * a drawing size. Size and contrast come from a radial profile of the photo around each location.
 */
export interface MarkerParams {
  /** Holes up to this many px are filled (acne rings have a transparent interior; pore dots are solid). */
  maxHolePx: number;
  /** Components larger than this multiple of the median marker area are split into several markers. */
  splitAreaFactor: number;
  /**
   * Extra search window (px, Chebyshev) for the strongest 3x3 contrast around the mask centroid. 0: the 3x3 box
   * already covers the mask registration error (about 1 px, spike section 3), and searching inflates contrast:
   * with the photo shifted off the mask, the strongest-of-9 median |Weber| was 0.20 against 0.095 for a fixed box (p2b pores).
   */
  searchRadiusPx: number;
  /** Profile extent as a multiple of the marker radius; the surround annulus starts here. */
  profileRadiusFactor: number;
  /** Surround annulus width as a multiple of the marker radius. */
  surroundWidthFactor: number;
  /** Fallback physical diameter when the photo profile is below the noise floor (a prior, not measured). */
  priorDiameterMm: number;
  /** ... and never smaller than this many photo pixels (blur-limited resolution). */
  priorMinPx: number;
  /** Profile peak must exceed this many noise standard errors to count as a measurement. */
  flatSigma: number;
}

export const MARKER_PARAMS: Record<"pore" | "acne", MarkerParams> = {
  pore: {
    maxHolePx: 40,
    splitAreaFactor: 1.6,
    searchRadiusPx: 0,
    profileRadiusFactor: 1.2,
    surroundWidthFactor: 1.2,
    // Assumption: visible facial pore openings are a few tenths of a millimetre across. Order of
    // magnitude only; flagged sizeSource "prior" wherever used.
    priorDiameterMm: 0.3,
    priorMinPx: 2,
    flatSigma: 2,
  },
  acne: {
    maxHolePx: 600,
    splitAreaFactor: 1.6,
    searchRadiusPx: 0,
    profileRadiusFactor: 1,
    surroundWidthFactor: 0.8,
    // Assumption: the lesion fills about half of the 17 px ring drawn around it (ring diameter x 0.5).
    priorDiameterMm: 0,
    priorMinPx: 3,
    flatSigma: 2,
  },
};
/** Acne prior diameter as a fraction of the marker (ring) diameter. */
export const ACNE_PRIOR_FRACTION = 0.5;

/**
 * Wrinkle cross-sections: sampled along the skeleton every STEP px, profile out to HALF_SPAN px each
 * side of the line, flanks (baseline) from FLANK_INNER to HALF_SPAN of the crease. One lateral offset per wrinkle is chosen within
 * +-ALIGN_PX of the mask line (YouCam lines can sit a few px off the visible crease).
 */
export const LINE_SAMPLE_STEP_PX = 2;
export const LINE_HALF_SPAN_PX = 9;
export const LINE_FLANK_INNER_PX = 5;
export const LINE_ALIGN_PX = 3;
/** Minimum cross-sections for a photo-based width and the depth (Weber) below which the dip is noise. */
export const LINE_MIN_SECTIONS = 4;
export const LINE_MIN_DEPTH = 0.03;
/** ... and the mean dip must exceed this many standard errors (cross-sections counted at half weight). */
export const LINE_MIN_SIGMA = 3;
