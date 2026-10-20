/**
 * "How we know": the chain behind one distance, with real numbers (PLAN 1.4).
 *
 *   1. YouCam found it (the mask outline; see outline.ts)
 *   2. its size in mm, with the iris as the ruler
 *   3. its contrast in %, measured in the photo (or against YouCam's simulation without it)
 *   4. the visual angle it covers at distance d, and the contrast the model needs at that angle
 *
 * Two observers, as everywhere else (lib/copy/describe.ts): a typical sharp-eyed person looking right at it (the
 * nominal detector, margin 0) and even perfect eyes (the one-sided bound, 6 dB margin and the luminance gain floored at
 * 1; the ratio `targetVisibility` scans). `visible` is the bound's verdict, `typicalVisible` the nominal one; the
 * latter implies the former. Each threshold shown is the contrast that would put that ratio at exactly 1, so `has >=
 * needed` and the verdict always agree; for a luminance-driven spot the bound's threshold is the shape-table threshold
 * divided by the luminance gain and the margin.
 */
import { CONCERNS, type ConcernId, type Feature, type RegionMeasure, type ScaleEstimate, type ViewingConditions } from "@/lib/contracts";
import { formatDistance } from "@/lib/copy";
import { angleDeg } from "@/lib/vision/geometry";
import { DEFAULT_MARGIN_DB } from "@/lib/vision/params";
import { specFromTarget, targetVisibility, visibilityRatio } from "@/lib/vision/visibility";

export interface ReceiptNumbers {
  concern: ConcernId;
  targetId: string;
  distanceM: number;
  kind: "spot" | "line" | "area";
  /** Width of a line, diameter of a spot, equal-area diameter of an area (mm). */
  sizeMm: number;
  /**
   * Where `sizeMm` comes from: the outline YouCam drew (spots, areas), a measurement in the photo, or an assumed size.
   * Pore and breakout masks are fixed-size markers, so a marker's drawing size is never reported as measured.
   */
  sizeSource: "mask" | "photo" | "prior";
  /** Lines only. */
  lengthMm?: number;
  /** The contrast that drives the verdict, in percent. */
  contrastPct: number;
  direction: "darker" | "lighter" | "redder" | "greener";
  driver: "luminance" | "colour";
  basis: "surround" | "counterfactual";
  angleArcmin: number;
  /** Contrast (same channel as `contrastPct`) at which the bound's ratio would be exactly 1, percent, capped at 100: even perfect eyes. */
  thresholdPct: number;
  /** The same for a typical sharp-eyed person (margin 0, no luminance-gain floor). Never below `thresholdPct`. */
  typicalThresholdPct: number;
  /** Detector ratio at d with the margin (the bound); >= 1 is detectable by even perfect eyes. */
  ratio: number;
  /** Even perfect eyes could pick it out from d. False means they could not. */
  visible: boolean;
  /** A typical sharp-eyed person looking right at it could pick it out from d. */
  typicalVisible: boolean;
  /** `targetVisibility(...).distanceM` for the same target: the farthest d at which `visible` holds. */
  boundM: number;
  /** `targetVisibility(...).nominalM`: the farthest d at which `typicalVisible` holds. */
  typicalM: number;
}

const ARCMIN_PER_DEG = 60;

/** Pores and breakouts are drawn as fixed-size markers: a location, not a size. */
const isMarker = (concern: ConcernId) => CONCERNS[concern].maskKind === "marker";

function sizeSourceOf(target: Feature | RegionMeasure): ReceiptNumbers["sizeSource"] {
  if (!("shape" in target)) return "mask";
  return isMarker(target.concern) && target.sizeSource === "mask" ? "prior" : target.sizeSource;
}

/** The receipt numbers for `target` at `distanceM`, or null when the target has no usable size or contrast. */
export function buildReceipt(
  target: Feature | RegionMeasure,
  scale: ScaleEstimate,
  viewing: ViewingConditions,
  distanceM: number,
): ReceiptNumbers | null {
  const spec = specFromTarget(target, scale);
  if (!spec) return null;
  const opts = { marginDb: viewing.marginDb ?? DEFAULT_MARGIN_DB, bound: true };
  const total = visibilityRatio(spec, viewing, distanceM, opts);
  const lumOnly = visibilityRatio({ ...spec, chromatic: false }, viewing, distanceM, opts);
  const colourShare = Math.sqrt(Math.max(0, total * total - lumOnly * lumOnly));
  const driver: ReceiptNumbers["driver"] = CONCERNS[target.concern].chromatic && colourShare > lumOnly ? "colour" : "luminance";

  const has = driver === "colour" ? Math.abs(spec.rg) : Math.abs(spec.lum);
  const signed = driver === "colour" ? spec.rg : spec.lum;
  const direction: ReceiptNumbers["direction"] =
    driver === "colour" ? (signed >= 0 ? "redder" : "greener") : signed <= 0 ? "darker" : "lighter";
  const needed = total > 0 ? has / total : 1;
  const typical = visibilityRatio(spec, viewing, distanceM, { marginDb: 0, bound: false });
  const typicalNeeded = typical > 0 ? has / typical : 1;
  const seen = targetVisibility(target, scale, viewing);

  const isFeature = "shape" in target;
  const kind: ReceiptNumbers["kind"] = !isFeature ? "area" : target.shape === "line" ? "line" : "spot";
  // The size the viewer would measure: a pore's FWHM, a spot's diameter, a line's width, an area's equal-area diameter.
  const sizeMm = isFeature ? (target.shape === "line" ? (target.widthMm ?? spec.sizeMm) : (target.diameterMm ?? spec.sizeMm)) : spec.sizeMm;

  return {
    concern: target.concern,
    targetId: target.id,
    distanceM,
    kind,
    sizeMm,
    sizeSource: sizeSourceOf(target),
    ...(isFeature && target.shape === "line" && target.lengthMm !== undefined ? { lengthMm: target.lengthMm } : {}),
    contrastPct: has * 100,
    direction,
    driver,
    basis: target.contrastBasis ?? "surround",
    angleArcmin: angleDeg(sizeMm, distanceM) * ARCMIN_PER_DEG,
    thresholdPct: Math.min(100, needed * 100),
    typicalThresholdPct: Math.min(100, typicalNeeded * 100),
    ratio: total,
    visible: total >= 1,
    typicalVisible: typical >= 1,
    boundM: seen.distanceM,
    typicalM: seen.nominalM ?? 0,
  };
}

// ---------------------------------------------------------------------------------------------------
// sentences
// ---------------------------------------------------------------------------------------------------

export interface ReceiptSentences {
  found: string;
  /** Only for markers (pores, breakouts): their drawing is a fixed-size dot, so say so. */
  foundNote?: string;
  size: string;
  /** "Measured from the mask outline" and its two siblings: the label beside the size. */
  sizeSource: string;
  contrast: string;
  angle: string;
  verdict: string;
  model: string;
}

const mm = (v: number) => (v < 1 ? v.toFixed(2) : v < 10 ? v.toFixed(1) : String(Math.round(v)));
const pct = (v: number) => (v < 10 ? v.toFixed(1) : String(Math.round(v)));
const arcmin = (v: number) => (v < 10 ? v.toFixed(1) : String(Math.round(v)));

const AREA_WORD: Partial<Record<ConcernId, string>> = { redness: "zone" };
const CONCERN_NOUN: Partial<Record<ConcernId, string>> = { pore: "pore", acne: "breakout" };

export const SIZE_SOURCE_LABEL: Record<ReceiptNumbers["sizeSource"], string> = {
  mask: "Measured from the mask outline",
  photo: "Measured in the photo",
  prior: "Assumed size",
};

export function receiptSentences(r: ReceiptNumbers): ReceiptSentences {
  const area = r.kind === "area";
  const against =
    r.basis === "counterfactual"
      ? "the same face without it, as YouCam Skin Simulation draws it"
      : area
        ? "the skin next to it"
        : "the skin around it";
  const noun = r.kind === "line" ? "line" : area ? (AREA_WORD[r.concern] ?? "area") : CONCERNS[r.concern].maskKind === "marker" ? CONCERN_NOUN[r.concern] : "mark";
  const across =
    r.kind === "line" ? `${mm(r.sizeMm)} mm wide${r.lengthMm ? ` and ${mm(r.lengthMm)} mm long` : ""}` : `about ${mm(r.sizeMm)} mm across`;
  const size =
    r.sizeSource === "prior"
      ? `YouCam marks where a ${noun} is, not how big it is, and the photo around this one was too flat to measure, so we assume ${across}, with the iris as the ruler for scale.`
      : r.sizeSource === "photo"
        ? `It's ${across}, measured in the photo around YouCam's marker, with the iris as the ruler.`
        : r.kind === "line"
          ? `It's ${across}, measured from the line YouCam drew, with the iris as the ruler.`
          : area
            ? `This ${noun} is ${across}, measured from the outline YouCam drew, with the iris as the ruler.`
            : `It's ${across}, measured from the outline YouCam drew, with the iris as the ruler.`;
  const from = formatDistance(r.distanceM);
  const has = `${pct(r.contrastPct)}%`;
  const verdict = r.typicalVisible
    ? `It has ${has}, so a typical sharp-eyed person looking right at it could see it from ${from}.`
    : r.visible
      ? `It has ${has}: enough for perfect eyes, but a typical person would probably not pick it out from ${from}.`
      : `It has ${has}, which is under both, so even perfect eyes couldn't pick it out from ${from}.`;
  const marker = isMarker(r.concern);
  return {
    found: area ? "YouCam found this area here." : "YouCam found it here.",
    ...(marker ? { foundNote: "The outline is a fixed-size marker that shows where YouCam found it. Its size is a drawing size, not a measurement." } : {}),
    size,
    sizeSource: SIZE_SOURCE_LABEL[r.sizeSource],
    contrast: `It's ${pct(r.contrastPct)}% ${r.direction} than ${against}.`,
    angle: `At ${from} it covers ${arcmin(r.angleArcmin)} arcmin. At that size a typical sharp-eyed person needs about ${pct(r.typicalThresholdPct)}% contrast to see it, and even perfect eyes need about ${pct(r.thresholdPct)}%.`,
    verdict,
    model: "Step 4 comes from a published model of human contrast sensitivity, checked against lab measurements, not from a guess.",
  };
}
