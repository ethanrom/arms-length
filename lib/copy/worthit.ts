/**
 * "Worth it?" sentences: how far away the change a half-strength improvement would make stays detectable
 * (lib/vision/worthIt.ts). Deterministic templates, kind, and bound-based: "wouldn't show beyond X" for the near ones,
 * "could show from up to X" and "at most N" for the far ones. The credit goes with every sentence.
 */
import { CONCERNS, type ConcernId } from "@/lib/contracts/concerns";
import { MAX_DISTANCE_M, MIN_DISTANCE_M } from "@/lib/contracts/vision";
import { concernNoun } from "./concerns";
import { anchorFor, formatDistance } from "./distance";
import { profileAt, type Profile } from "./profile";

/** The simulation behind every "Worth it?" number, credited next to it. */
export const WORTH_IT_CREDIT = "(YouCam Skin Simulation, half strength)";

export interface WorthItInput {
  concern: ConcernId;
  targetCount: number;
  /** Bound: how far the farthest single change stays detectable. */
  differenceMaxDistanceM: number;
  /** Share of the concern's changes detectable at fixed distances; used for many-feature concerns. */
  differenceProfile?: Profile;
}

export interface WorthItDescription {
  /** At most 60 characters. */
  headline: string;
  detail: string;
}

/** What the half-strength simulation does to each concern, said as an improvement and without judging the starting point. */
const IMPROVEMENT: Record<ConcernId, string> = {
  pore: "Refining your pores by half",
  age_spot: "Softening your dark spots by half",
  acne: "Calming your breakouts by half",
  wrinkle: "Softening your lines by half",
  dark_circle: "Brightening your under-eye shadows by half",
  eye_bag: "Smoothing your under-eye puffiness by half",
  redness: "Evening out your redness by half",
  texture: "Smoothing your skin texture by half",
};

/** Up to this far a change counts as near: it "wouldn't show beyond X". Across a table, like the rest of the copy. */
const NEAR_MAX_M = 1.5;
/** Up to this far it is the mirror and selfie view, which is mostly your own. */
const MIRROR_MAX_M = 0.35;
const TABLE_M = 1.5;
const MIN_PROFILE_TARGETS = 5;

const join = (parts: string[]) => parts.filter(Boolean).join(" ");

export function describeWorthIt(w: WorthItInput): WorthItDescription {
  const noun = concernNoun(w.concern);
  if (!CONCERNS[w.concern].visibility || w.targetCount === 0) {
    return {
      headline: "There's no change to compare for this one.",
      detail: join([`We didn't find any ${noun} to measure, so there's nothing to simulate.`, WORTH_IT_CREDIT]),
    };
  }
  const phrase = IMPROVEMENT[w.concern];
  const d = w.differenceMaxDistanceM;

  if (d < MIN_DISTANCE_M) {
    return {
      headline: "A half-strength change wouldn't show, even up close.",
      detail: join([`${phrase} wouldn't show, even from ${formatDistance(MIN_DISTANCE_M)}.`, WORTH_IT_CREDIT]),
    };
  }
  if (d <= NEAR_MAX_M) {
    return {
      headline: `A half-strength change wouldn't show beyond ${formatDistance(d)}.`,
      detail: join([
        `${phrase} wouldn't show beyond ${formatDistance(d)}.`,
        d <= MIRROR_MAX_M ? "That's a change for the mirror, not for other people." : "",
        WORTH_IT_CREDIT,
      ]),
    };
  }

  const many = w.differenceProfile !== undefined && w.targetCount >= MIN_PROFILE_TARGETS && CONCERNS[w.concern].maskKind !== "region";
  if (many) {
    const count = Math.round(profileAt(w.differenceProfile!, TABLE_M).count);
    return {
      headline: `The change shows on at most ${count} of ${w.targetCount} ${noun}.`,
      detail: join([
        `${phrase} could show on at most ${count} of your ${w.targetCount} ${noun} from ${anchorFor(TABLE_M)}, even for sharp eyes looking right at them.`,
        WORTH_IT_CREDIT,
      ]),
    };
  }

  const capped = d >= MAX_DISTANCE_M;
  const upTo = capped ? "10 m or more" : formatDistance(d);
  return {
    headline: `A half-strength change could show from up to ${upTo}.`,
    detail: join([
      `${phrase} could show from up to ${upTo}, ${capped ? "across a room and beyond" : anchorFor(d)}, for sharp eyes looking right at it.`,
      w.concern === "dark_circle" || w.concern === "eye_bag" ? "It's a large, soft area, so even a small change reaches far." : "",
      WORTH_IT_CREDIT,
    ]),
  };
}
