/** Turning a checked draft into the DayPlan the UI receives: ids, the observed scene, explicit refs, and the results cited. */
import type { Claim, DayPlan, MomentAction, PlannedMoment, RunStats, SceneInput, VerifierIssue } from "@/lib/contracts";
import { afterRef, isFreeFix, isObserve } from "./results";
import type { AnyResult } from "./types";
import { withExplicitRefs, type PlanDraft } from "./verify";

const refsOfClaim = (c: Claim) => c.refs;

/** The scene as it was actually observed, so a re-run from the plan reproduces the numbers. */
function observedScene(draftScene: SceneInput, observe: AnyResult | undefined): SceneInput {
  if (!isObserve(observe)) return draftScene;
  const { scene, light, viewer, call } = observe.input;
  return call ? { scene, light, viewer, call } : { scene, light, viewer, distanceM: observe.distanceM };
}

export function assemblePlan(args: {
  day: string;
  draft: PlanDraft;
  results: ReadonlyMap<string, AnyResult>;
  verified: boolean;
  issues: VerifierIssue[];
  stats: RunStats;
}): DayPlan {
  const draft = withExplicitRefs(args.draft);
  const cited = new Set<string>();
  const cite = (ref: string | undefined) => {
    if (!ref || !args.results.has(ref)) return;
    cited.add(ref);
    const result = args.results.get(ref);
    if (isFreeFix(result)) cited.add(afterRef(ref));
  };

  const moments: PlannedMoment[] = draft.moments.map((m, i) => {
    cite(m.observeRef);
    [...m.notice, ...m.outOfSight, m.action.claim, ...(m.headline ? [m.headline] : [])].flatMap(refsOfClaim).forEach(cite);
    if ("ref" in m.action) cite(m.action.ref);
    return { ...m, id: `m${i + 1}`, time: m.time ?? null, scene: observedScene(m.scene, args.results.get(m.observeRef)), action: m.action as MomentAction };
  });
  draft.summary.refs.forEach(cite);

  const results: DayPlan["results"] = {};
  for (const ref of cited) {
    const r = args.results.get(ref);
    if (r) results[ref] = r;
  }
  return { day: args.day, moments, summary: draft.summary, results, verified: args.verified, issues: args.issues, stats: args.stats };
}
