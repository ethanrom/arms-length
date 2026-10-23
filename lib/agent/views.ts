/** What the model sees of an assessed moment: refs, the quotes grouped per concern, and which action each result supports. */
import type { ConcernId, ObserveResult, SceneInput } from "@/lib/contracts";
import { afterRef } from "./results";
import type { Assessment } from "./assess";

const ids = (list: { concern: ConcernId }[]) => list.map((c) => c.concern);

/** The quotes of an observation, grouped by concern: { pore: { typical, typicalCount, bound, boundCount } }. */
export function quotesByConcern(observe: ObserveResult): Record<string, Record<string, string>> {
  const out: Record<string, Record<string, string>> = {};
  for (const c of observe.concerns) {
    if (c.targetCount === 0) continue;
    const entry: Record<string, string> = {};
    for (const key of ["typical", "typicalCount", "bound", "boundCount", "belowCamera"]) {
      const quote = observe.quotes[`${c.concern}.${key}`];
      if (quote !== undefined) entry[key] = quote;
    }
    out[c.concern] = entry;
  }
  return out;
}

/** The scene exactly as it was observed, in the shape final_answer takes. */
function observedScene(observe: ObserveResult): SceneInput {
  const { scene, light, viewer, call } = observe.input;
  return call ? { scene, light, viewer, call } : { scene, light, viewer, distanceM: observe.distanceM };
}

const MAKEUP_NOTE: Record<Assessment["makeup"], string> = {
  not_needed: "Nothing is left in sight that a free change does not reach.",
  declined: "The user would rather not wear makeup: offer no lightest touch.",
  available: "A measured lightest touch exists for what no free change reaches.",
  none_measured: "No measured lightest touch exists for what no free change reaches: do not offer makeup.",
};

export function assessView(a: Assessment, title: string): Record<string, unknown> {
  const { observe } = a;
  const measured = observe.concerns.filter((c) => c.targetCount > 0);
  const moment: Record<string, string> = {};
  for (const key of ["distance", "light", "viewer", "floor"]) if (observe.quotes[key] !== undefined) moment[key] = observe.quotes[key];
  const rest = a.needs.filter((c) => !a.group.includes(c));

  return {
    moment: title,
    observeRef: observe.ref,
    scene: observedScene(observe),
    ...(a.frame ? { callFrame: { ref: a.frame.ref, quotes: a.frame.quotes } } : {}),
    quotes: moment,
    concerns: quotesByConcern(observe),
    inSight: ids(measured.filter((c) => c.typicalCount > 0)),
    outOfSight: ids(measured.filter((c) => c.typicalCount === 0)),
    seenOnlyBySharpestEyes: ids(measured.filter((c) => c.typicalCount === 0 && c.boundCount > 0)),
    noneFound: ids(observe.concerns.filter((c) => c.targetCount === 0)),
    needsAChange: a.needs,
    freeFix: a.freeFix
      ? {
          ref: a.freeFix.ref,
          reaches: a.group,
          lever: a.freeFix.lever,
          quotes: a.freeFix.quotes,
          afterThisChange: {
            ref: afterRef(a.freeFix.ref),
            typical: Object.fromEntries(a.group.map((c) => [c, a.freeFix?.after.quotes[`${c}.typical`]])),
          },
        }
      : null,
    stillInSightAfterAFreeChange: rest,
    limit: a.limit?.quotes.limit ? { ref: a.limit.ref, quote: a.limit.quotes.limit } : null,
    lightestTouch: a.touches.map((t) => ({ ref: t.ref, concern: t.concern, status: t.status, quotes: t.quotes })),
    makeup: MAKEUP_NOTE[a.makeup],
    action: "free_fix with freeFix.ref when freeFix is not null; otherwise lightest_touch with one of the lightestTouch refs; otherwise none (you may cite limit.ref).",
  };
}
