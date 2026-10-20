/**
 * Walk-back self-test, step 1: screen calibration with a bank card.
 *
 * The user drags an on-screen rectangle until it matches the width of an ID-1 card (ISO/IEC 7810: 85.60 x 53.98 mm,
 * the size of nearly every bank card). The rectangle's width in px then gives the screen's px per mm.
 * Use the same pixel unit everywhere (CSS px in the browser): the target is drawn in the same unit, so the
 * browser's devicePixelRatio drops out.
 */

export const ID1_CARD_WIDTH_MM = 85.6;

export function pxPerMmFromCard(cardWidthPx: number): number {
  if (!Number.isFinite(cardWidthPx) || cardWidthPx <= 0) throw new Error("card width must be a positive number of px");
  return cardWidthPx / ID1_CARD_WIDTH_MM;
}

export const mmToPx = (mm: number, pxPerMm: number): number => mm * pxPerMm;
