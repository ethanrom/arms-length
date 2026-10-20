/**
 * The parameter tables of docs/MODEL.md, generated from the code so the doc cannot drift from it.
 *
 *   npx tsx scripts/docs/params-table.ts            print the markdown
 *   npx tsx scripts/docs/params-table.ts --write    rewrite the blocks in docs/MODEL.md
 *
 * Values are read from the constants themselves; the unit and source columns are written here. Every export of
 * lib/vision/params.ts must appear in a row (lib/vision/params.doc.test.ts checks), so a new constant cannot be
 * added without saying where it comes from.
 */
import { DEFAULT_VIEWING, MAX_DISTANCE_M, MIN_DISTANCE_M, PROFILE_DISTANCES_M } from "../../lib/contracts/vision";
import { CARD_ASPECT_TOLERANCE, CARD_CORNER_SD_PX, CARD_LONG_MM, CARD_SHORT_MM } from "../../lib/scale/card";
import { IRIS_DIAMETER_MM, IRIS_DIAMETER_SD_MM, IRIS_EDGE_SD_PX, IRIS_POPULATION_REL_SD } from "../../lib/scale/iris";
import { LINEAR_SRGB_TO_XYZ, XYZ_TO_LMS_HPE_D65 } from "../../lib/skin/color";
import { DEFAULT_MIN_DIFF } from "../../lib/skin/masks";
import * as S from "../../lib/skin/params";
import * as V from "../../lib/vision/params";
import { isMain, ROOT, syncFile, table } from "./blocks";

export interface ParamRow {
  /** Name of the export in the source file that this row documents. */
  src: string;
  name: string;
  value: string;
  unit: string;
  source: string;
}

/** Numbers as people write them: no float noise, exponent form for very large or very small values. */
export function fmt(x: number): string {
  if (x === 0) return "0";
  const a = Math.abs(x);
  if (a >= 1e6 || a < 1e-3) return x.toExponential().replace("e+", "e");
  return String(Number(x.toPrecision(10)));
}

/** Round to `digits` significant digits, for derived values. */
const round = (x: number, digits: number): number => Number(x.toPrecision(digits));
const list = (xs: readonly number[]): string => xs.map(fmt).join(", ");
const code = (s: string): string => `\`${s}\``;

const row = (src: string, name: string, value: number | string, unit: string, source: string): ParamRow => ({
  src,
  name,
  value: typeof value === "number" ? fmt(value) : value,
  unit,
  source,
});

const WA = "Watson & Ahumada 2005, Table 5 (Standard A)";
const CASTLE = "castleCSF default parameters (MIT licence), Ashraf et al. 2024";
const LUX = "Lambertian skin, L = rho E / pi with rho = 0.35 (the light-skin patch of a standard colour chart, Y = 35.8%)";
const MASKS = "Heuristic from recorded HD masks";

export interface ParamGroup {
  id: string;
  title: string;
  intro: string;
  rows: ParamRow[];
}

function visionGroups(): ParamGroup[] {
  const A = V.STANDARD_A;
  const B = V.STANDARD_B;
  const ach = V.CASTLE_ACH;
  const rg = V.CASTLE_RG;
  const yv = V.CASTLE_YV;
  const disc = V.CASTLE_DISC;
  return [
    {
      id: "standard",
      title: "Detector: Watson & Ahumada Standard A",
      intro: "Taken from the paper as published. Nothing here is fitted by us.",
      rows: [
        row("STANDARD_A", "STANDARD_A.gain", A.gain, "", `${WA}. CSF gain G; the DC gain is G(1 - a) = ${fmt(round(A.gain * (1 - A.a), 4))}`),
        row("STANDARD_A", "STANDARD_A.f0", A.f0, "cycles/deg", WA),
        row("STANDARD_A", "STANDARD_A.f1", A.f1, "cycles/deg", WA),
        row("STANDARD_A", "STANDARD_A.a", A.a, "", WA),
        row("STANDARD_A", "STANDARD_A.p", A.p, "", `${WA}. CSF peaks at 217.3, at 3.45 cycles/deg`),
        row("STANDARD_A", "STANDARD_A.beta", A.beta, "", `${WA}. Minkowski pooling exponent (2 would be energy summation)`),
        row("STANDARD_A", "STANDARD_A.sigma", A.sigma, "deg", `${WA}. Sd of the Gaussian aperture centred on the fixated feature`),
        row("OBLIQUE", "OBLIQUE.gamma", V.OBLIQUE.gamma, "cycles/deg", "Watson & Ahumada 2005, Eq. 5; fixed from Berkley et al. 1975, not fitted"),
        row("OBLIQUE", "OBLIQUE.lambda", V.OBLIQUE.lambda, "cycles/deg", "As above"),
        row("MODEL_GRID", "MODEL_GRID.ppd", V.MODEL_GRID.ppd, "pixels/deg", "ModelFest and Watson & Ahumada convention: 1 pixel = 0.5 arcmin"),
        row("MODEL_GRID", "MODEL_GRID.n", V.MODEL_GRID.n, "pixels", "ModelFest convention: 256 x 256 images"),
        row("STANDARD_FIELD_DEG", "STANDARD_FIELD_DEG", round(V.STANDARD_FIELD_DEG, 5), "deg", "Derived: n / ppd"),
        row("MODELFEST_LUMINANCE", "MODELFEST_LUMINANCE", V.MODELFEST_LUMINANCE, "cd/m^2", "ModelFest mean luminance, 30 +/- 5; the tables are for this luminance"),
        row(
          "STANDARD_B",
          "STANDARD_B (gain, f0, f1, a, p, beta, sigma)",
          list([B.gain, B.f0, B.f1, B.a, B.p, B.beta, B.sigma]),
          "",
          "Watson & Ahumada 2005, Table 5 (Standard B, beta fixed at 2). Fallback only; the distances use Standard A",
        ),
      ],
    },
    {
      id: "bound",
      title: "The bound, the distance scan and the report",
      intro: "",
      rows: [
        row("DEFAULT_MARGIN_DB", "DEFAULT_MARGIN_DB", V.DEFAULT_MARGIN_DB, "dB", "Ours, from ModelFest: best of 16 observers 4.2 dB below the mean, plus up to 1.9 dB model residual on skin-like shapes. Range 0 to 9"),
        row("SCAN", "SCAN.minM", V.SCAN.minM, "m", "Ours (numerical): nearest distance scanned"),
        row("SCAN", "SCAN.maxM", V.SCAN.maxM, "m", "Ours (numerical): farthest distance scanned"),
        row("SCAN", "SCAN.pointsPerDecade", V.SCAN.pointsPerDecade, "", "Ours (numerical): log grid, then bisection on the last crossing"),
        row("MIN_DISTANCE_M", "MIN_DISTANCE_M", MIN_DISTANCE_M, "m", "Contract (lib/contracts/vision.ts): below this the report says 0"),
        row("MAX_DISTANCE_M", "MAX_DISTANCE_M", MAX_DISTANCE_M, "m", "Contract: the report caps distances here"),
        row("PROFILE_DISTANCES_M", "PROFILE_DISTANCES_M", list(PROFILE_DISTANCES_M), "m", "Contract: fixed distances of the detectability profile (mirror, selfie, arm's length, conversation, table, room, far)"),
        row(
          "DEFAULT_VIEWING",
          "DEFAULT_VIEWING",
          `${fmt(DEFAULT_VIEWING.luminanceCdM2)} cd/m^2, acuityScale ${fmt(DEFAULT_VIEWING.acuityScale)}, margin ${fmt(DEFAULT_VIEWING.marginDb ?? 0)} dB`,
          "",
          "Contract: indoor light, 20/20 observer, default margin",
        ),
      ],
    },
    {
      id: "luminance",
      title: "Viewing luminance and the luminance factor",
      intro: "",
      rows: [
        row("LUMINANCE_PRESETS", "LUMINANCE_PRESETS.home", V.LUMINANCE_PRESETS.home, "cd/m^2", `${LUX}; 50-150 lx (home, evening)`),
        row("LUMINANCE_PRESETS", "LUMINANCE_PRESETS.indoor", V.LUMINANCE_PRESETS.indoor, "cd/m^2", `As above; about 400 lx (office, EN 12464-1 range 300-500)`),
        row("LUMINANCE_PRESETS", "LUMINANCE_PRESETS.overcast", V.LUMINANCE_PRESETS.overcast, "cd/m^2", `As above; 1,000-5,000 lx (overcast, window light)`),
        row("LUMINANCE_PRESETS", "LUMINANCE_PRESETS.daylight", V.LUMINANCE_PRESETS.daylight, "cd/m^2", `As above; 10,000-25,000 lx (daylight, not direct sun)`),
        row("LUMINANCE_PRESETS", "LUMINANCE_PRESETS.videoCall", V.LUMINANCE_PRESETS.videoCall, "cd/m^2", "Adapted to a 200-300 cd/m^2 screen; face at about 0.35 of white"),
        row(
          "LUMINANCE_FACTOR_FREQ_RANGE",
          "LUMINANCE_FACTOR_FREQ_RANGE",
          list(V.LUMINANCE_FACTOR_FREQ_RANGE),
          "cycles/deg",
          "Ours (heuristic): the luminance factor g(L, f*) uses f* = 1/(4 s), clipped to this range; the bound uses max(1, g)",
        ),
      ],
    },
    {
      id: "shapes",
      title: "Feature shapes",
      intro: "",
      rows: [
        row("FWHM_PER_SD", "FWHM_PER_SD", round(V.FWHM_PER_SD, 5), "", "2 sqrt(2 ln 2). A pore's measured diameter is read as the full width at half maximum of a Gaussian blob"),
        row("SOFT_DISK_EDGE_SD_FRACTION", "SOFT_DISK_EDGE_SD_FRACTION", V.SOFT_DISK_EDGE_SD_FRACTION, "of diameter", "Ours: regions are equal-area disks blurred by a Gaussian of this sd (a 10-90% edge width of 26% of the diameter)"),
        row("PATCH_GABOR_SD_CYCLES", "PATCH_GABOR_SD_CYCLES", V.PATCH_GABOR_SD_CYCLES, "cycles", "Peli 1996 patch CSF: a Gabor with sd = this / f0 degrees has a 1-octave bandwidth (ModelFest #11-14)"),
      ],
    },
    {
      id: "castle",
      title: "Chromatic channel: castleCSF, static and foveal",
      intro: "Used only for concerns where red-green contrast matters (acne, redness).",
      rows: [
        row("CASTLE_ACH", "CASTLE_ACH.sMax", list(ach.sMax), "", `${CASTLE}. Achromatic S_max(L) = p1 (1 + p2/L)^-p3 (1 - (1 + p4/L)^-p5). Used by the luminance factor only`),
        row("CASTLE_ACH", "CASTLE_ACH.fMax", list(ach.fMax), "", `${CASTLE}. f_max(L) = p1 (1 + p2/L)^-p3`),
        row("CASTLE_ACH", "CASTLE_ACH.bw, a", `${fmt(ach.bw)}, ${fmt(ach.a)}`, "", CASTLE),
        row("CASTLE_ACH", "CASTLE_ACH.area0, f0", `${fmt(ach.area0)}, ${fmt(ach.f0)}`, "deg^2, cycles/deg", `${CASTLE}. Critical area A0 and frequency f0 of the Rovamo et al. (1993) area model`),
        row("CASTLE_RG", "CASTLE_RG.sMax", list(rg.sMax), "", `${CASTLE}. Red-green S_max(L) = p1 (1 + p2/L)^-p3`),
        row("CASTLE_RG", "CASTLE_RG.fMax", rg.fMax, "cycles/deg", `${CASTLE}. Constant`),
        row("CASTLE_RG", "CASTLE_RG.bw", rg.bw, "", CASTLE),
        row("CASTLE_RG", "CASTLE_RG.area0, f0", `${fmt(rg.area0)}, ${fmt(rg.f0)}`, "deg^2, cycles/deg", CASTLE),
        row("CASTLE_YV", "CASTLE_YV (sMax; fMax; bw; area0; f0)", `${list(yv.sMax)}; ${fmt(yv.fMax)}; ${fmt(yv.bw)}; ${fmt(yv.area0)}; ${fmt(yv.f0)}`, "", `${CASTLE}. Yellow-violet channel; the code path exists but no yellow-violet contrast is measured, so it adds nothing`),
        row("CASTLE_DISC", "CASTLE_DISC.beta", disc.beta, "", "castleCSF paper Eq. 31, `sensitivity_edge`: S_disc = k_r r^(1/beta) max over rho of S(rho, A)"),
        row("CASTLE_DISC", "CASTLE_DISC.area", disc.area, "deg^2", "As above: the fixed area at which the Gabor sensitivity is maximised"),
        row("CASTLE_DISC", "CASTLE_DISC.kr", disc.kr, "", "2 pi, the paper's circumference form. The repository code uses 1; the paper's form fits castleCSF's own disc data (RMS 3.17 dB against 5.54 dB)"),
        row("CASTLE_DISC", "CASTLE_DISC.rhoMin, rhoMax", `${fmt(disc.rhoMin)}, ${fmt(disc.rhoMax)}`, "cycles/deg", "castleCSF `sensitivity_edge`: the frequency range searched"),
        row("CASTLE_DISC", "CASTLE_DISC.rhoSteps", disc.rhoSteps, "", "Ours (numerical): log-spaced samples over that range"),
        row("CASTLE_DISC", "CASTLE_DISC.validRadiusDeg", disc.validRadiusDeg, "deg", "Smallest disc radius in castleCSF's disc data; below it sensitivity falls as r^2 (Ricco's law, ours, unverified)"),
        row("CASTLE_COLMAT", "CASTLE_COLMAT.rg", V.CASTLE_COLMAT.rg, "", "castleCSF `colmat` (Wuerger et al. 2020): red-green channel is L - this x M"),
        row("CASTLE_COLMAT", "CASTLE_COLMAT.yv", V.CASTLE_COLMAT.yv, "", "castleCSF `colmat`: yellow-violet channel is this x S - L - M"),
        row("SRGB_TO_CASTLE_LMS", "SRGB_TO_CASTLE_LMS", list(V.SRGB_TO_CASTLE_LMS), "", "castleCSF `xyz2lms2006` (CIE 2006 2-degree cone fundamentals, Stockman & Sharpe) times the sRGB-to-XYZ matrix; row-major, L + M = Y"),
        row(
          "RG_CONTRAST_MAP",
          "RG_CONTRAST_MAP (lum, rg)",
          `${fmt(round(V.RG_CONTRAST_MAP.lum, 4))}, ${fmt(round(V.RG_CONTRAST_MAP.rg, 4))}`,
          "",
          "Ours: C_RG = abs(lum x first + rg x second), for a skin colour with L/(L+M) = 0.7285. Reproduces castleCSF's C_RG to 3% on four skin pairs",
        ),
      ],
    },
    {
      id: "renderer",
      title: "Step-back renderer",
      intro: "",
      rows: [
        row("RENDERER", "RENDERER.maxWorkSide", V.RENDERER.maxWorkSide, "pixels", "Ours (speed): larger photos are processed at this size and the finer detail is added back as one extra gated band"),
        row("RENDERER", "RENDERER.bandsPerOctave", V.RENDERER.bandsPerOctave, "", "Peli 1990: one-octave cosine-log bands"),
        row("RENDERER", "RENDERER.kneeLo", V.RENDERER.kneeLo, "x threshold", "Ours: detail fades in smoothly between kneeLo and kneeHi (Peli used a hard step), so the slider shows no banding"),
        row("RENDERER", "RENDERER.kneeHi", V.RENDERER.kneeHi, "x threshold", "Ours, as above"),
        row("RENDERER", "RENDERER.localMeanFloor", V.RENDERER.localMeanFloor, "of white", "Ours: floor on the local mean luminance in the band-contrast denominator"),
      ],
    },
  ];
}

function scaleAndColourGroups(): ParamGroup[] {
  return [
    {
      id: "scale",
      title: "Scale: the iris ruler and the card",
      intro: "",
      rows: [
        row("IRIS_DIAMETER_MM", "IRIS_DIAMETER_MM", IRIS_DIAMETER_MM, "mm", "Rüfer, Schröder & Erb 2005: white-to-white corneal diameter, population mean"),
        row("IRIS_DIAMETER_SD_MM", "IRIS_DIAMETER_SD_MM", IRIS_DIAMETER_SD_MM, "mm", "Rüfer et al. 2005: population standard deviation"),
        row("IRIS_POPULATION_REL_SD", "IRIS_POPULATION_REL_SD", round(IRIS_POPULATION_REL_SD, 4), "", "Derived: 0.42 / 11.71. The floor on the scale uncertainty"),
        row("IRIS_EDGE_SD_PX", "IRIS_EDGE_SD_PX", IRIS_EDGE_SD_PX, "pixels", "Assumption: sd of each iris-edge landmark. Two edges per eye, averaged over the eyes found"),
        row("CARD_LONG_MM", "CARD_LONG_MM", CARD_LONG_MM, "mm", "ISO/IEC 7810 ID-1 bank card, long side"),
        row("CARD_SHORT_MM", "CARD_SHORT_MM", CARD_SHORT_MM, "mm", "ISO/IEC 7810 ID-1, short side"),
        row("CARD_CORNER_SD_PX", "CARD_CORNER_SD_PX", CARD_CORNER_SD_PX, "pixels", "Assumption: sd of one corner position"),
        row("CARD_ASPECT_TOLERANCE", "CARD_ASPECT_TOLERANCE", CARD_ASPECT_TOLERANCE, "relative", "Ours: a quad whose aspect ratio is further than this from a card's is rejected (wrong object or too tilted)"),
      ],
    },
    {
      id: "colour",
      title: "Colour maths",
      intro: "",
      rows: [
        row("LINEAR_SRGB_TO_XYZ", "LINEAR_SRGB_TO_XYZ", list(LINEAR_SRGB_TO_XYZ), "", "IEC 61966-2-1 (sRGB, D65) as tabulated by B. Lindbloom; row-major. The middle row is the luminance weights"),
        row("XYZ_TO_LMS_HPE_D65", "XYZ_TO_LMS_HPE_D65", list(XYZ_TO_LMS_HPE_D65), "", "Hunt-Pointer-Estevez matrix normalised to D65 (Hunt, The Reproduction of Colour; Fairchild, Color Appearance Models); row-major. Only ratios (dL/L, dM/M) are used, so each cone's gain cancels"),
      ],
    },
  ];
}

function measurementGroup(): ParamGroup {
  const pore = S.MARKER_PARAMS.pore;
  const acne = S.MARKER_PARAMS.acne;
  const both = (pick: (p: S.MarkerParams) => number): string => `pore ${fmt(pick(pore))}, acne ${fmt(pick(acne))}`;
  return {
    id: "measurement",
    title: "Measurement stage: reading masks and photos",
    intro:
      "These are heuristics chosen from the recorded masks and photos (docs/YOUCAM.md, section 3), not published model parameters. None of them feeds the vision model's constants.",
    rows: [
      row("DEFAULT_MIN_DIFF", "DEFAULT_MIN_DIFF", DEFAULT_MIN_DIFF, "alpha steps", "A pixel is foreground when its alpha differs from the mask's modal alpha by at least this much. Sits above the HD pore mask's near-background values (94-101 on 102) and below the faintest age-spot contour"),
      row("MIN_SPOT_AREA_PX", "MIN_SPOT_AREA_PX", S.MIN_SPOT_AREA_PX, "pixels", `${MASKS}: smaller age-spot components are rendering specks`),
      row("MAX_SPOT_HOLE_PX", "MAX_SPOT_HOLE_PX", S.MAX_SPOT_HOLE_PX, "pixels", `${MASKS}: closed outlines enclosing more are not spots (largest seen: 2,492)`),
      row("MIN_LINE_LENGTH_PX", "MIN_LINE_LENGTH_PX", S.MIN_LINE_LENGTH_PX, "pixels", `${MASKS}: wrinkle strokes are about 3 px wide, so shorter skeleton paths are dot-like artefacts`),
      row("MIN_LINE_AREA_PX", "MIN_LINE_AREA_PX", S.MIN_LINE_AREA_PX, "pixels", MASKS),
      row("MIN_REGION_AREA_PX", "MIN_REGION_AREA_PX", S.MIN_REGION_AREA_PX, "pixels", `${MASKS}: eye-bag outline dashes are about 28 px`),
      row("REGION_EXTENT_FRACTION", "REGION_EXTENT_FRACTION", S.REGION_EXTENT_FRACTION, "of max alpha step", `${MASKS}: a graded region's extent is where the mask exceeds this share of its maximum`),
      row("REGION_MIN_DIFF", "REGION_MIN_DIFF", S.REGION_MIN_DIFF, "alpha steps", `${MASKS}: a mask that never reaches this is empty (the deep-skin redness mask)`),
      row("RING_INNER_MIN_PX", "RING_INNER_MIN_PX", S.RING_INNER_MIN_PX, "pixels", "Heuristic: the surround ring starts this far from a spot's edge, to skip the anti-aliased outline"),
      row("RING_INNER_FRAC", "RING_INNER_FRAC", S.RING_INNER_FRAC, "of diameter", "Heuristic, as above (the larger of the two applies)"),
      row("RING_WIDTH_MIN_PX", "RING_WIDTH_MIN_PX", S.RING_WIDTH_MIN_PX, "pixels", "Heuristic: ring width, the larger of this and the fraction below"),
      row("RING_WIDTH_FRAC", "RING_WIDTH_FRAC", S.RING_WIDTH_FRAC, "of diameter", "Heuristic, as above"),
      row("MIN_RING_PIXELS", "MIN_RING_PIXELS", S.MIN_RING_PIXELS, "pixels", "Heuristic: a ring with fewer usable pixels is widened x1.6, up to three times, before falling back to face skin"),
      row("SURROUND_CLIP_SIGMA", "SURROUND_CLIP_SIGMA", S.SURROUND_CLIP_SIGMA, "robust sigmas", "Heuristic: surround pixels beyond this (1.4826 x MAD from the median) are rejected as hair, glints or neighbouring marks"),
      row("BAND_GAP_FRAC", "BAND_GAP_FRAC", S.BAND_GAP_FRAC, "of region height", "Heuristic: the cheek reference band for dark circles and eye bags starts this far below the region"),
      row("BAND_HEIGHT_FRAC", "BAND_HEIGHT_FRAC", S.BAND_HEIGHT_FRAC, "of region height", "Heuristic: height of that band"),
      row("MIN_BAND_PIXELS", "MIN_BAND_PIXELS", S.MIN_BAND_PIXELS, "pixels", "Heuristic: with fewer usable pixels the face-skin reference is used instead"),
      row("MIN_REFERENCE_PIXELS", "MIN_REFERENCE_PIXELS", S.MIN_REFERENCE_PIXELS, "pixels", "Heuristic: smallest skin reference sample"),
      row("MARKER_PARAMS", "MARKER_PARAMS.priorDiameterMm", both((p) => p.priorDiameterMm), "mm", "Assumption: a pore opening is a few tenths of a millimetre; used only when the photo gives no measurable size, and flagged as a prior. Acne uses a fraction of the ring, below"),
      row("ACNE_PRIOR_FRACTION", "ACNE_PRIOR_FRACTION", S.ACNE_PRIOR_FRACTION, "of ring diameter", "Assumption: the lesion fills about half of the 17 px ring YouCam draws"),
      row("MARKER_PARAMS", "MARKER_PARAMS.priorMinPx", both((p) => p.priorMinPx), "pixels", "Photo-measured marker sizes are blur-limited; never smaller than this"),
      row("MARKER_PARAMS", "MARKER_PARAMS.flatSigma", both((p) => p.flatSigma), "standard errors", "Heuristic: a marker's contrast must exceed this many noise standard errors to count as a measurement"),
      row("MARKER_PARAMS", "MARKER_PARAMS.splitAreaFactor", both((p) => p.splitAreaFactor), "x median area", "Heuristic: larger components are split into several markers (merged neighbours)"),
      row(
        "MARKER_PARAMS",
        "MARKER_PARAMS (maxHolePx; profileRadiusFactor; surroundWidthFactor; searchRadiusPx)",
        `pore ${[pore.maxHolePx, pore.profileRadiusFactor, pore.surroundWidthFactor, pore.searchRadiusPx].map(fmt).join("; ")}, acne ${[acne.maxHolePx, acne.profileRadiusFactor, acne.surroundWidthFactor, acne.searchRadiusPx].map(fmt).join("; ")}`,
        "pixels, x marker radius",
        "Heuristic geometry of the radial profile and surround annulus. searchRadiusPx is 0 on purpose: searching for the strongest position inflates contrast",
      ),
      row("LINE_SAMPLE_STEP_PX", "LINE_SAMPLE_STEP_PX", S.LINE_SAMPLE_STEP_PX, "pixels", "Heuristic: a wrinkle is sampled across its width every this many pixels along the skeleton"),
      row("LINE_HALF_SPAN_PX", "LINE_HALF_SPAN_PX", S.LINE_HALF_SPAN_PX, "pixels", "Heuristic: profile extent each side of the line"),
      row("LINE_FLANK_INNER_PX", "LINE_FLANK_INNER_PX", S.LINE_FLANK_INNER_PX, "pixels", "Heuristic: the baseline flanks start this far from the crease"),
      row("LINE_ALIGN_PX", "LINE_ALIGN_PX", S.LINE_ALIGN_PX, "pixels", "Heuristic: YouCam lines can sit a few pixels off the visible crease; one offset per wrinkle is searched within this"),
      row("LINE_MIN_SECTIONS", "LINE_MIN_SECTIONS", S.LINE_MIN_SECTIONS, "", "Heuristic: fewest cross-sections for a photo-based width"),
      row("LINE_MIN_DEPTH", "LINE_MIN_DEPTH", S.LINE_MIN_DEPTH, "Weber", "Heuristic: a dip shallower than this is noise, and the mask width is used instead"),
      row("LINE_MIN_SIGMA", "LINE_MIN_SIGMA", S.LINE_MIN_SIGMA, "standard errors", "Heuristic: the mean dip must exceed this many standard errors"),
    ],
  };
}

export const PARAM_BLOCKS: { name: string; groups: () => ParamGroup[] }[] = [
  { name: "params-model", groups: visionGroups },
  { name: "params-scale", groups: scaleAndColourGroups },
  { name: "params-measurement", groups: () => [measurementGroup()] },
];

function render(groups: ParamGroup[]): string {
  return groups
    .map((g) => {
      const body = table(
        ["Parameter", "Value", "Unit", "Source"],
        g.rows.map((r) => [code(r.name), r.value, r.unit || "-", r.source]),
      );
      return [`### ${g.title}`, g.intro, body].filter(Boolean).join("\n\n");
    })
    .join("\n\n");
}

/** The markdown of one generated block of docs/MODEL.md. */
export function paramsTable(name: string = PARAM_BLOCKS[0].name): string {
  const block = PARAM_BLOCKS.find((b) => b.name === name);
  if (!block) throw new Error(`unknown block "${name}"`);
  return render(block.groups());
}

/** Every generated block of docs/MODEL.md by name. */
export function allParamsBlocks(): Record<string, string> {
  return Object.fromEntries(PARAM_BLOCKS.map((b) => [b.name, render(b.groups())]));
}

/** Names of the exports of lib/vision/params.ts that no row documents. Must be empty. */
export function undocumentedVisionExports(): string[] {
  const covered = new Set(visionGroups().flatMap((g) => g.rows.map((r) => r.src)));
  return Object.keys(V).filter((k) => !covered.has(k));
}

if (isMain(import.meta.url)) {
  if (process.argv.includes("--write")) {
    const changed = syncFile(`${ROOT}docs/MODEL.md`, allParamsBlocks());
    console.log(changed.length ? `docs/MODEL.md: updated ${changed.join(", ")}` : "docs/MODEL.md: already up to date");
  } else {
    console.log(Object.values(allParamsBlocks()).join("\n\n"));
  }
}
