/**
 * Exact counts for receipts. Headlines and cards use words ("most", "about a third", "a few"); the numbers live here, one
 * row per distance, with both observers side by side: a typical sharp-eyed person (nominal) and even perfect eyes (the bound).
 * The nominal counts are estimated from the bound when a report carries no nominal profile, and say so.
 */
import type { ConcernId } from "@/lib/contracts/concerns";
import { PROFILE_DISTANCES_M } from "@/lib/contracts/vision";
import type { ConcernVisibilityExt } from "@/lib/vision/report";
import { concernName } from "./concerns";
import { safetyLineFor } from "./disclaimers";
import { formatDistance } from "./distance";
import { boundCountAt, nominalCountAt } from "./profile";

/** Conversation distance, across a table, across a room. Any of the profile distances is allowed. */
export const RECEIPT_DISTANCES_M: readonly number[] = [1, 1.5, 4];

export interface ReceiptCountRow {
  distanceM: number;
  /** "1.5 m". */
  label: string;
  total: number;
  /** A typical sharp-eyed person looking right at them. */
  nominalCount: number;
  /** Even perfect eyes: the ceiling. */
  boundCount: number;
  /** One receipt sentence for this row. */
  sentence: string;
}

export interface ReceiptCounts {
  concern: ConcernId;
  total: number;
  rows: ReceiptCountRow[];
  /** True when the nominal counts were estimated from the bound (the report had no nominal profile). */
  nominalEstimated: boolean;
  /** The mark-safety line for dark spots and breakouts, to print on their receipts. */
  safety: string | null;
}

/**
 * Null when the concern has no profile to count from (a single area, or nothing found). Distances snap to what the report
 * can answer: the profile is read on a log axis between its fixed distances.
 */
export function receiptCounts(cv: ConcernVisibilityExt, distancesM: readonly number[] = RECEIPT_DISTANCES_M): ReceiptCounts | null {
  if (!cv.profile || cv.targetCount === 0) return null;
  const total = cv.targetCount;
  const noun = concernName(cv.concern, total === 1 ? "singular" : "plural");
  const [first, last] = [PROFILE_DISTANCES_M[0], PROFILE_DISTANCES_M[PROFILE_DISTANCES_M.length - 1]];
  const rows = distancesM
    .filter((d) => d >= first && d <= last)
    .map((distanceM): ReceiptCountRow => {
      const nominalCount = Math.min(nominalCountAt(cv, distanceM), boundCountAt(cv, distanceM));
      const boundCount = boundCountAt(cv, distanceM);
      const label = formatDistance(distanceM);
      return {
        distanceM,
        label,
        total,
        nominalCount,
        boundCount,
        sentence:
          `At ${label}: about ${nominalCount} of ${total} ${noun} for a typical sharp-eyed person looking right at them; ` +
          `at most ${boundCount} for even perfect eyes.`,
      };
    });
  return { concern: cv.concern, total, rows, nominalEstimated: cv.nominalProfile === undefined, safety: safetyLineFor(cv.concern) };
}
