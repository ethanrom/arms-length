/**
 * "No need to cover": among the concerns people usually cover with makeup, the ones a typical viewer would not notice at
 * a moment. Deterministic, from the observe result, with the same 10% goal the free fix and the lightest touch use.
 */
import type { ConcernId } from "../contracts";
import type { DayPlan, ObserveResult, PlannedMoment } from "../contracts/rehearse";
import { FREE_FIX_GOAL } from "./fix";

/** Concealer, foundation and primer territory. Fine lines, puffiness and texture are not "covered", so they are left out. */
export const COVERABLE: readonly ConcernId[] = ["acne", "age_spot", "pore", "dark_circle", "redness"];

const EPS = 1e-9;

/** Coverable concerns this face has that a typical viewer would not notice here. A soft area counts only when fully out of sight. */
export function noNeedToCover(observe: ObserveResult): ConcernId[] {
  return COVERABLE.filter((concern) => {
    const c = observe.concerns.find((x) => x.concern === concern);
    if (!c || c.targetCount === 0) return false;
    return c.soft ? c.typicalShare <= EPS : c.typicalShare <= FREE_FIX_GOAL + EPS;
  });
}

const isObserve = (r: unknown): r is ObserveResult => typeof r === "object" && r !== null && Array.isArray((r as ObserveResult).concerns);

/** The ObserveResult a moment rests on, or null if the plan doesn't carry it. */
export function observeOf(plan: DayPlan, moment: PlannedMoment): ObserveResult | null {
  const r = plan.results[moment.observeRef];
  return isObserve(r) ? r : null;
}

export interface CoverDay {
  concern: ConcernId;
  /** Moment ids, in plan order, where it needs no cover. */
  momentIds: string[];
  /** True when that holds for every moment of the day. */
  allDay: boolean;
}

/** Across a plan: each coverable concern that needs no cover in at least one moment, all-day ones first. */
export function noNeedToCoverDay(plan: DayPlan): CoverDay[] {
  const moments = plan.moments.filter((m) => observeOf(plan, m));
  const out: CoverDay[] = [];
  for (const concern of COVERABLE) {
    const momentIds = moments.filter((m) => noNeedToCover(observeOf(plan, m)!).includes(concern)).map((m) => m.id);
    if (momentIds.length) out.push({ concern, momentIds, allDay: momentIds.length === moments.length });
  }
  return out.sort((a, b) => Number(b.allDay) - Number(a.allDay));
}
