/**
 * Last-resort repairs that need no model: when the only things wrong with a plan are single supporting sentences (notice, out of sight,
 * an assumption), leave those out;
 * after the repair round, when a headline or the summary is still wrong, give it its template. A plan with a few fewer sentences
 * is better than the whole-plan fallback. Nothing is invented: the template is built from the moment's own observation, and the
 * result must pass the verifier or it is not used.
 */
import type { RehearsePrefs } from "@/lib/contracts";
import { templateHeadline, templateSummary } from "./fallback";
import { isObserve } from "./results";
import type { AnyResult } from "./types";
import { verifyPlan, type Located, type PlanDraft, type VerifyContext } from "./verify";

export interface Salvaged {
  draft: PlanDraft;
  /** Notice and out-of-sight sentences left out. */
  dropped: number;
  /** Headlines (and the summary) replaced by the template. */
  replaced: number;
}

/**
 * Returns the repaired draft, or null when something other than a notice or out-of-sight sentence (or, if allowed, a headline) is
 * wrong, or when the repaired draft still does not pass.
 */
export function salvage(
  draft: PlanDraft,
  located: Located[],
  results: Readonly<Record<string, AnyResult>>,
  prefs: RehearsePrefs,
  options: { replaceHeadlines: boolean; context?: VerifyContext },
): Salvaged | null {
  if (located.length === 0) return null;
  const drop = new Set<string>();
  const replace = new Set<number>();
  let replaceSummary = false;
  for (const l of located) {
    if (l.field === "summary" && options.replaceHeadlines) {
      replaceSummary = true;
      continue;
    }
    if (l.moment === null) return null;
    if (l.field === "notice" || l.field === "outOfSight" || l.field === "assumption") drop.add(`${l.moment}:${l.field}:${l.index}`);
    else if (l.field === "headline" && options.replaceHeadlines) replace.add(l.moment);
    else return null;
  }

  let replaced = 0;
  const moments = draft.moments.map((m, i) => {
    let headline = m.headline;
    if (replace.has(i)) {
      const observe = results[m.observeRef];
      if (!isObserve(observe)) return null;
      headline = templateHeadline(observe, m.action, i);
      replaced++;
    }
    return {
      ...m,
      headline,
      notice: m.notice.filter((_, j) => !drop.has(`${i}:notice:${j}`)),
      outOfSight: m.outOfSight.filter((_, j) => !drop.has(`${i}:outOfSight:${j}`)),
      assumptions: m.assumptions.filter((_, j) => !drop.has(`${i}:assumption:${j}`)),
    };
  });
  if (moments.some((m) => m === null)) return null;

  const kept = moments as PlanDraft["moments"];
  const fixed: PlanDraft = { ...draft, moments: kept, summary: replaceSummary ? templateSummary(kept) : draft.summary };
  if (replaceSummary) replaced++;
  if (verifyPlan(fixed, results, prefs, options.context).length > 0) return null;
  return { draft: fixed, dropped: drop.size, replaced };
}
