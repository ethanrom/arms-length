/**
 * "How we know": the chain behind one distance, with real numbers (PLAN 1.4).
 *
 *   1. YouCam found it (the mask outline; see outline.ts)
 *   2. its size in mm, with the iris as the ruler
 *   3. its contrast in %, measured in the photo (or against YouCam's simulation without it)
 *   4. the visual angle it covers at distance d, and the contrast the model needs at that angle
 *
 * The verdict is the one-sided bound of lib/vision: "visible" means a sharp-eyed observer looking right at it could
 * pick it out from d (detector response with the 6 dB margin, the same ratio `targetVisibility` scans), "not visible"
 * means nobody could, even with perfect eyes. The threshold shown is the contrast that would put the ratio at exactly 1,
 * so `has >= needed` and the verdict always agree; for a luminance-driven spot it is the shape-table threshold
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
  /** Lines only. */
  lengthMm?: number;
  /** The contrast that drives the verdict, in percent. */
  contrastPct: number;
  direction: "darker" | "lighter" | "redder" | "greener";
  driver: "luminance" | "colour";
  basis: "surround" | "counterfactual";
  angleArcmin: number;
  /** Contrast (same channel as `contrastPct`) at which the ratio would be exactly 1, percent, capped at 100. */
  thresholdPct: number;
  /** Detector ratio at d with the margin; >= 1 is detectable. */
  ratio: number;
  visible: boolean;
  /** `targetVisibility(...).distanceM` for the same target: the farthest d at which `visible` holds. */
  boundM: number;
}

const ARCMIN_PER_DEG = 60;

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
    ...(isFeature && target.shape === "line" && target.lengthMm !== undefined ? { lengthMm: target.lengthMm } : {}),
    contrastPct: has * 100,
    direction,
    driver,
    basis: target.contrastBasis ?? "surround",
    angleArcmin: angleDeg(sizeMm, distanceM) * ARCMIN_PER_DEG,
    thresholdPct: Math.min(100, needed * 100),
    ratio: total,
    visible: total >= 1,
    boundM: targetVisibility(target, scale, viewing).distanceM,
  };
}

// ---------------------------------------------------------------------------------------------------
// sentences
// ---------------------------------------------------------------------------------------------------

export interface ReceiptSentences {
  found: string;
  size: string;
  contrast: string;
  angle: string;
  verdict: string;
  model: string;
}

const mm = (v: number) => (v < 1 ? v.toFixed(2) : v < 10 ? v.toFixed(1) : String(Math.round(v)));
const pct = (v: number) => (v < 10 ? v.toFixed(1) : String(Math.round(v)));
const arcmin = (v: number) => (v < 10 ? v.toFixed(1) : String(Math.round(v)));

const AREA_WORD: Partial<Record<ConcernId, string>> = { redness: "zone" };

export function receiptSentences(r: ReceiptNumbers): ReceiptSentences {
  const area = r.kind === "area";
  const against =
    r.basis === "counterfactual"
      ? "the same face without it, as YouCam Skin Simulation draws it"
      : area
        ? "the skin next to it"
        : "the skin around it";
  const size =
    r.kind === "line"
      ? `It's ${mm(r.sizeMm)} mm wide${r.lengthMm ? ` and ${mm(r.lengthMm)} mm long` : ""}, with the iris as the ruler.`
      : area
        ? `This ${AREA_WORD[r.concern] ?? "area"} is about ${mm(r.sizeMm)} mm across, with the iris as the ruler.`
        : `It's about ${mm(r.sizeMm)} mm across, with the iris as the ruler.`;
  const verdict = r.visible
    ? `It has ${pct(r.contrastPct)}%, so sharp eyes looking right at it could see it from ${formatDistance(r.distanceM)}.`
    : `It has ${pct(r.contrastPct)}%, which is under what's needed, so nobody could see it from ${formatDistance(r.distanceM)}, even with perfect eyes.`;
  return {
    found: area ? "YouCam found this area here." : "YouCam found it here.",
    size,
    contrast: `It's ${pct(r.contrastPct)}% ${r.direction} than ${against}.`,
    angle: `At ${formatDistance(r.distanceM)} it covers ${arcmin(r.angleArcmin)} arcmin. At that size, even sharp eyes need about ${pct(r.thresholdPct)}% contrast to see it.`,
    verdict,
    model: "Step 4 comes from a published model of human contrast sensitivity, checked against lab measurements, not from a guess.",
  };
}
