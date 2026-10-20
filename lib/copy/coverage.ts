/**
 * "The lightest touch": sentences for the least-coverage search (lib/coverage/plan.ts), worded as a virtual try-on and
 * never as a product result. Templates are status-true:
 *   met      at this coverage, a typical person across a table wouldn't pick the concern out (checked on a try-on).
 *   not_met  nothing reaches that; what we show is the knee, "most of the effect at 50%; more adds little".
 *   no_lever no makeup setting we tried moved it, or we did not test one.
 * Coverage is the try-on's own 0-100 scale, not a property of any product on a shelf.
 */
import type { ConcernId } from "@/lib/contracts/concerns";
import type { CoveragePlan } from "@/lib/contracts/render";
import { concernNoun, concernThem } from "./concerns";
import { anchorFor } from "./distance";
import { shareWord } from "./profile";

export const COVERAGE_TITLE = "The lightest touch";

export const COVERAGE_INTRO =
  "Pick a distance. We look for the lightest layer that puts them out of sight there, and check it on a virtual try-on.";

/** The concerns where a foundation coverage lever was found to work (spike 9.3). */
export const COVERAGE_LEVER_CONCERNS: readonly ConcernId[] = ["age_spot", "pore", "acne"];

export function hasCoverageLever(concern: ConcernId): boolean {
  return COVERAGE_LEVER_CONCERNS.includes(concern);
}

/**
 * The pointer from a visible card to this section. Empty for concerns without a lever, so it never promises a step that
 * does not exist.
 */
export function coverageHook(concern: ConcernId): string {
  if (!hasCoverageLever(concern)) return "";
  return `See the lightest touch that puts ${concernThem(concern)} out of sight, on a virtual try-on.`;
}

export interface CoverageDescription {
  /** At most 60 characters. */
  headline: string;
  detail: string;
}

const TRY_ON_CHECK = "Checked on a virtual try-on; real makeup, shade and light will differ.";

/** The try-on scale in words: its four grid steps are 25, 50, 75 and 100. */
function layer(coverage: number): string {
  if (coverage <= 25) return "very light";
  if (coverage <= 50) return "light";
  if (coverage <= 75) return "medium";
  return "full";
}

const join = (parts: string[]) => parts.filter(Boolean).join(" ");

type PlanForCopy = Pick<CoveragePlan, "concern" | "status" | "reason" | "chosen" | "targetDistanceM" | "steps">;

export function describeCoverage(plan: PlanForCopy): CoverageDescription {
  const { concern } = plan;
  const noun = concernNoun(concern);
  const them = concernThem(concern);
  const table = anchorFor(plan.targetDistanceM);

  if (plan.status === "no_lever") {
    const detail: Record<string, string> = {
      no_makeup_lever: `In the try-on, neither concealer nor foundation changed ${them}, so there's no lighter touch to suggest.`,
      lever_not_tested: "We haven't tested makeup on this one, so there's no lighter touch to suggest.",
      not_a_visible_mark: "This isn't a mark, so there's nothing to cover.",
    };
    return {
      headline: plan.reason === "lever_not_tested" ? "We haven't tested makeup on this one." : "No makeup setting we tried changed this one.",
      detail: detail[plan.reason ?? "no_makeup_lever"] ?? detail.no_makeup_lever,
    };
  }

  if (plan.status === "met") {
    if (plan.reason === "no_targets") {
      return { headline: "There's nothing to cover here.", detail: `We didn't find any ${noun} to measure.` };
    }
    if (!plan.chosen) {
      return {
        headline: "Already out of sight, with no makeup.",
        detail: `With no makeup at all, a typical person ${table} wouldn't pick ${them} out.`,
      };
    }
    const coverage = Math.round(plan.chosen.lever.value);
    return {
      headline: `A ${layer(coverage)} layer is enough in the try-on.`,
      detail: join([
        `At about ${coverage} on the try-on's scale, a typical person ${table} wouldn't pick ${them} out.`,
        TRY_ON_CHECK,
      ]),
    };
  }

  if (!plan.chosen) {
    return {
      headline: "Makeup didn't change this one in the try-on.",
      detail: "We tried several coverage levels and the try-on showed no change, so there's no lighter touch to suggest.",
    };
  }
  // Not met: the knee. The share left at full coverage comes from the 100 render the search always makes by then.
  const coverage = Math.round(plan.chosen.lever.value);
  const full = plan.steps.find((s) => s.lever.value >= 100) ?? plan.chosen;
  const left = shareWord(full.fractionAtTarget ?? 0);
  const leftover =
    left === "none"
      ? ""
      : `Even at full coverage, sharp eyes could still pick out ${left} of your ${noun} ${table.startsWith("across") ? `from ${table}` : table}.`;
  return {
    headline: `Most of the effect comes at ${coverage}%; more adds little.`,
    detail: join([`In the try-on, most of the effect arrives by about ${coverage}% coverage; more adds little.`, leftover, TRY_ON_CHECK]),
  };
}
