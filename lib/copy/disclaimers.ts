/**
 * Short, fixed disclaimer lines (expert panel triage, 2026-10-21; wording from review-safety.md D1-D9, shortened). They are
 * constants rather than templates so the same words appear everywhere a claim is made. Each one passes the copy linter,
 * so "health advice" stands in for the banned word that the usual disclaimer would use.
 */
import type { ConcernId } from "@/lib/contracts/concerns";

/** Dark-spot and breakout cards and receipts: a distance can reassure about a mark that should be looked at. */
export const MARK_SAFETY_LINE =
  "This measures how visible a mark is, not what it is. If one is new, changing or worrying you, ask a doctor or pharmacist.";

/** The concerns that carry the safety line on their cards and receipts. */
export const SAFETY_CONCERNS: readonly ConcernId[] = ["age_spot", "acne"];

export function safetyLineFor(concern: ConcernId): string | null {
  return SAFETY_CONCERNS.includes(concern) ? MARK_SAFETY_LINE : null;
}

export const DISCLAIMERS = {
  /** Under the results title, visible without scrolling. An estimate, not a guarantee. */
  estimate:
    "An estimate from one photo, not a guarantee: it assumes normal indoor light and an unretouched photo, and real viewers usually see less.",
  /** Demo faces: on the page, and burned into any exported image. */
  synthetic: "Synthetic (AI-generated) face. No real person's skin is shown.",
  /** On the simulated image and beside any simulated number. */
  simulation: "A simulation. It shows a possible change in the picture, not what any product or routine would do.",
  /** Beside the coverage number in the makeup section. */
  tryOn: "A virtual try-on, one shade. Real makeup, shade and light will differ.",
  /**
   * Before the camera or upload step. This states only the data path, which is true as built. The integrator appends the
   * retention clause once the delete-endpoint check says what is true (see internal/DECISIONS.md, triage item 3).
   */
  privacy: "Your photo goes to our server and on to YouCam (Perfect Corp) to be analysed.",
  /** Footer, every page. */
  notHealth: "Visibility, not health. Not health advice.",
  /** Dark-spot and breakout cards and receipts. */
  mark: MARK_SAFETY_LINE,
} as const;

export type DisclaimerId = keyof typeof DISCLAIMERS;
