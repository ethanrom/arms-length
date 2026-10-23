import { concernTitle } from "@/lib/copy/concerns";
import type {
  CallFrameResult,
  Claim,
  DayPlan,
  FreeFixResult,
  LightestTouchResult,
  ObserveResult,
  PlannedMoment,
  ReceiptResult,
  WorthItResult,
} from "@/lib/contracts/rehearse";

export type AnyResult = DayPlan["results"][string];

export const isObserve = (r: AnyResult | undefined): r is ObserveResult => !!r && "concerns" in r && "luminanceCdM2" in r;
export const isReceipt = (r: AnyResult | undefined): r is ReceiptResult => !!r && "sizeMm" in r;
export const isCallFrame = (r: AnyResult | undefined): r is CallFrameResult => !!r && "equivalentDistanceM" in r;
export const isFreeFix = (r: AnyResult | undefined): r is FreeFixResult => !!r && "reachable" in r;
export const isLightestTouch = (r: AnyResult | undefined): r is LightestTouchResult => !!r && "coveragePct" in r;
export const isWorthIt = (r: AnyResult | undefined): r is WorthItResult => !!r && "typicalShareOfChange" in r;

export const observeOf = (plan: DayPlan, moment: PlannedMoment): ObserveResult | null => {
  const r = plan.results[moment.observeRef];
  return isObserve(r) ? r : null;
};

/** Every result the moment cites, in the order a reader meets them: the scene, then what its sentences rest on. */
export function citedRefs(moment: PlannedMoment): string[] {
  const claims: Claim[] = [...moment.notice, ...moment.outOfSight, moment.action.claim];
  const refs = [moment.observeRef];
  if (moment.action.kind !== "none") refs.push(moment.action.ref);
  for (const c of claims) refs.push(...c.refs);
  return [...new Set(refs)];
}

/** "0.42 mm": two significant figures below 10, whole numbers above. */
const sig = (v: number): string => (v >= 10 ? String(Math.round(v)) : String(Number(v.toPrecision(2))));

export interface ReceiptFacts {
  concern: string;
  rows: { label: string; value: string }[];
  verdict: string;
}

/** The numbers of a receipt, formatted for "How we know". Values come straight from the tool result. */
export function receiptFacts(r: ReceiptResult): ReceiptFacts {
  const verdict = r.visibleTypical
    ? "A typical viewer could pick it out from here."
    : r.visibleBound
      ? "Out of sight for a typical viewer; the sharpest eyes could still find it."
      : "Out of sight from here, even for the sharpest eyes.";
  return {
    concern: concernTitle(r.concern),
    rows: [
      { label: "Distance", value: `${sig(r.distanceM)} m` },
      { label: "Size on the face", value: `${sig(r.sizeMm)} mm` },
      { label: "Contrast with the skin around it", value: `${sig(r.contrastPct)}%` },
      { label: "Size to the eye", value: `${sig(r.angleArcmin)} arcmin` },
      { label: "Contrast needed, sharpest eyes", value: `${sig(r.thresholdPct)}%` },
      { label: "Contrast needed, typical viewer", value: `${sig(r.typicalThresholdPct)}%` },
    ],
    verdict,
  };
}
