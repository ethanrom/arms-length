/** Survival curves and their sentences: how many of a concern's features are still picked out at a distance. */
import type { ConcernId } from "@/lib/contracts";
import { PROFILE_DISTANCES_M } from "@/lib/contracts/vision";
import { concernName } from "@/lib/copy/concerns";
import { formatDistance } from "@/lib/copy/distance";
import { detectabilityProfile } from "@/lib/vision/report";

/** Number of features whose distance is at least `distanceM` (the feature "survives" to there). */
export function countAtLeast(distances: ArrayLike<number>, distanceM: number): number {
  let n = 0;
  for (let i = 0; i < distances.length; i++) if (distances[i] >= distanceM) n++;
  return n;
}

/** Survival fraction at each grid distance. */
export function survivalAt(distances: ArrayLike<number>, grid: readonly number[]): number[] {
  const total = distances.length;
  return grid.map((d) => (total ? countAtLeast(distances, d) / total : 0));
}

/** A log-spaced grid of `n + 1` distances from `min` to `max`. */
export function logGrid(min: number, max: number, n: number): number[] {
  return Array.from({ length: n + 1 }, (_, i) => min * Math.pow(max / min, i / n));
}

/** The receipt wording (lib/copy/receipt.ts), for any distance: both observers side by side, the bound as "at most". */
export function survivalSentence(concern: ConcernId, total: number, typicalCount: number, perfectCount: number, distanceM: number): string {
  const noun = concernName(concern, total === 1 ? "singular" : "plural");
  return (
    `At ${formatDistance(distanceM)}: about ${typicalCount} of ${total} ${noun} for a typical sharp-eyed person looking right at them; ` +
    `at most ${perfectCount} for even perfect eyes.`
  );
}

export interface ProfileMatch {
  distanceM: number;
  recorded: number;
  recomputed: number;
}

/** The recomputed counts at the report's fixed distances, next to the counts the bundle recorded. */
export function matchRecordedProfile(
  distances: ArrayLike<number>,
  recorded: readonly { distanceM: number; count: number }[],
): { rows: ProfileMatch[]; allEqual: boolean } {
  const fresh = detectabilityProfile(Array.from(distances));
  const rows = recorded.map((r) => ({
    distanceM: r.distanceM,
    recorded: r.count,
    recomputed: fresh.find((p) => p.distanceM === r.distanceM)?.count ?? countAtLeast(distances, r.distanceM),
  }));
  return { rows, allEqual: rows.every((r) => r.recorded === r.recomputed) };
}

export const REPORT_DISTANCES_M: readonly number[] = PROFILE_DISTANCES_M;

/** The k-th largest value (1 = largest) of an array, without sorting the caller's copy. */
export function kthLargest(values: ArrayLike<number>, k: number): number {
  const sorted = Array.from(values).sort((a, b) => b - a);
  return sorted[Math.min(sorted.length, Math.max(1, k)) - 1] ?? 0;
}

/** Median of an array (mean of the two middle values for an even count). */
export function medianOf(values: ArrayLike<number>): number {
  const s = Array.from(values).sort((a, b) => a - b);
  const n = s.length;
  if (n === 0) return 0;
  return n % 2 ? s[(n - 1) / 2] : (s[n / 2 - 1] + s[n / 2]) / 2;
}
