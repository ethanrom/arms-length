/** Telling the tool results apart by shape, and reading their quotes. */
import type {
  CallFrameResult,
  FreeFixResult,
  LightestTouchResult,
  ObserveResult,
  Quotes,
  ReceiptResult,
  WorthItResult,
} from "@/lib/contracts";
import type { AnyResult } from "./types";

export const isObserve = (r: AnyResult | undefined): r is ObserveResult => !!r && "concerns" in r && "luminanceCdM2" in r;
export const isCallFrame = (r: AnyResult | undefined): r is CallFrameResult => !!r && "resolutionFloorMm" in r;
export const isFreeFix = (r: AnyResult | undefined): r is FreeFixResult => !!r && "reachable" in r && "after" in r;
export const isLightestTouch = (r: AnyResult | undefined): r is LightestTouchResult => !!r && "coveragePct" in r;
export const isWorthIt = (r: AnyResult | undefined): r is WorthItResult => !!r && "simulated" in r;
export const isReceipt = (r: AnyResult | undefined): r is ReceiptResult => !!r && "thresholdPct" in r;

/** `${ref}.after` is the scene re-observed by a free fix; it is cited through its parent. */
export const afterRef = (ref: string) => `${ref}.after`;

/**
 * The quotes a claim may use when it cites `ref`: the result's own, and for a free fix the quotes of the scene it
 * re-observed. Keys are kept so the verifier can tell a "bound" quote from a "typical" one.
 */
export function quotesFor(results: Readonly<Record<string, AnyResult>>, ref: string): Quotes {
  const own = results[ref];
  if (!own) return {};
  const out: Quotes = { ...own.quotes };
  const after = isFreeFix(own) ? (results[afterRef(ref)] ?? own.after) : undefined;
  if (after) for (const [k, v] of Object.entries(after.quotes)) out[`after:${k}`] = v;
  return out;
}

/** Per-run storage: refs r1, r2, ... and every result by ref, `${ref}.after` included for free fixes. */
export function createRunStore() {
  const results = new Map<string, AnyResult>();
  let counter = 0;
  return {
    results,
    /** The ref the next committed result gets. */
    nextRef: () => `r${counter + 1}`,
    commit(result: AnyResult): void {
      counter++;
      results.set(result.ref, result);
      if (isFreeFix(result)) results.set(afterRef(result.ref), result.after);
    },
  };
}
