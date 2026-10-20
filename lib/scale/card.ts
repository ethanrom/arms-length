/**
 * Optional calibration with a bank card held flat against the forehead, so it lies in the same plane as the
 * skin we measure. ID-1 cards are 85.60 x 53.98 mm (ISO/IEC 7810). The corners come from the user or a detector.
 */
import type { Point, ScaleEstimate } from "@/lib/contracts";

export const CARD_LONG_MM = 85.6;
export const CARD_SHORT_MM = 53.98;
const CARD_ASPECT = CARD_LONG_MM / CARD_SHORT_MM;

/** Assumed SD of one corner position in px (hand-placed or detected corners). */
export const CARD_CORNER_SD_PX = 1.5;
/** Reject quads whose aspect ratio is this far (relative) from an ID-1 card: wrong object or strongly tilted. */
export const CARD_ASPECT_TOLERANCE = 0.15;

/**
 * Millimetres per pixel from the four card corners, in order around the card (either direction).
 *
 * Edge-length fit: opposite edges are averaged, the long pair gives px/mm from 85.60 mm and the short pair from
 * 53.98 mm. A tilted card shrinks one axis, so the two disagree; we use their mean and put half the
 * disagreement into the uncertainty, together with the corner error. For a card within about 15 degrees of
 * facing the camera this is accurate to a few tenths of a percent; the iris alone is 3.7%.
 */
export function estimateCardScale(
  corners: readonly [Point, Point, Point, Point],
): ScaleEstimate | null {
  const edge = (i: number) => {
    const a = corners[i];
    const b = corners[(i + 1) % 4];
    return Math.hypot(a.x - b.x, a.y - b.y);
  };
  const edges = [edge(0), edge(1), edge(2), edge(3)];
  if (edges.some((e) => !Number.isFinite(e) || e <= 0)) return null;

  const pairA = (edges[0] + edges[2]) / 2;
  const pairB = (edges[1] + edges[3]) / 2;
  const long = Math.max(pairA, pairB);
  const short = Math.min(pairA, pairB);
  if (Math.abs(long / short / CARD_ASPECT - 1) > CARD_ASPECT_TOLERANCE) return null;

  const pxPerMmLong = long / CARD_LONG_MM;
  const pxPerMmShort = short / CARD_SHORT_MM;
  const pxPerMm = (pxPerMmLong + pxPerMmShort) / 2;
  const disagreement = Math.abs(pxPerMmLong - pxPerMmShort) / (2 * pxPerMm);
  // Each edge length carries sqrt(2) * sigma; four independent edges averaged.
  const cornerRel =
    Math.sqrt(edges.reduce((s, e) => s + ((CARD_CORNER_SD_PX * Math.SQRT2) / e) ** 2, 0)) / 4;
  return {
    mmPerPx: 1 / pxPerMm,
    relSd: Math.hypot(cornerRel, disagreement),
    source: "card",
  };
}
