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
  /** Before the camera or upload step: the data path only, so a caller can follow it with the retention lines below. */
  privacy: "Your photo goes to our server and on to YouCam (Perfect Corp) to be analysed.",
  /**
   * What happens after. Verified 2026-10-20/21 (internal/research/task-delete.md; docs/YOUCAM.md section 4, note 10): the
   * browser asks for the YouCam tasks to be deleted when the visitor leaves (analysis and makeup tasks delete). That call is
   * best effort, so YouCam's own retention is the backstop, 30 days at most.
   */
  retention: "We ask YouCam to delete your photo and its results when you leave this page. We don't store your photo.",
  /** YouCam refuses to delete a Skin Simulation task (400 OperationInvalid), so that one picture waits out its retention. */
  simulationRetention:
    "One exception: YouCam can't delete the Skin Simulation picture early, so it may keep it for up to 24 hours. It removes anything left within 30 days.",
  /** Own-photo mode only; the demo faces are for everyone. */
  adults: "Your own photo is for people aged 18 and over. The demo faces are for everyone.",
  /** Footer, every page. */
  notHealth: "Visibility, not health. Not health advice.",
  /** Dark-spot and breakout cards and receipts. */
  mark: MARK_SAFETY_LINE,
} as const;

export type DisclaimerId = keyof typeof DISCLAIMERS;
