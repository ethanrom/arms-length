/**
 * "Worth it?" sentences, worded as a simulation (expert panel, 2026-10-21): how far away the difference a half-strength
 * YouCam Skin Simulation would make stays detectable (lib/vision/worthIt.ts). The sentence describes the picture, never an
 * action or a result: "If your pores looked noticeably softer (YouCam Skin Simulation, half strength), a typical person
 * wouldn't see the difference beyond 40 cm." It never says "half as", "refine", "calm" or "brighten", and it makes no claim
 * about any product or routine.
 *
 * Two observers: "wouldn't see it beyond X" uses the bound (it holds for even sharper eyes, so it is safe to say of a typical
 * person); "could see it from X" uses the nominal distance, a typical sharp-eyed person looking right at it. Large soft areas
 * state no distance. Deterministic templates; the credit goes with every sentence.
 */
import { CONCERNS, type ConcernId } from "@/lib/contracts/concerns";
import { MAX_DISTANCE_M, MIN_DISTANCE_M } from "@/lib/contracts/vision";
import { concernNoun, concernThem } from "./concerns";
import { anchorFor, formatDistance } from "./distance";
import { BOUND_TO_NOMINAL_RATIO, profileAt, shareWord, type Profile } from "./profile";

/** The simulation behind every "Worth it?" number, credited next to it. */
export const WORTH_IT_CREDIT = "(YouCam Skin Simulation, half strength)";

export interface WorthItInput {
  concern: ConcernId;
  targetCount: number;
  /** Bound: how far the farthest single change stays detectable. */
  differenceMaxDistanceM: number;
  /** Share of the concern's changes detectable (bound) at fixed distances; used for many-feature concerns. */
  differenceProfile?: Profile;
  /** Average observer: the farthest single change. Estimated from the bound when absent. */
  differenceNominalMaxDistanceM?: number;
  /** Average observer: share of the changes detectable at fixed distances. Estimated from the bound when absent. */
  differenceNominalProfile?: Profile;
}

export interface WorthItDescription {
  /** At most 60 characters. */
  headline: string;
  detail: string;
}

/** What the simulation does to the picture of each concern, said as the picture and without judging the starting point. */
const IF_IT_LOOKED: Record<ConcernId, string> = {
  pore: "If your pores looked noticeably softer",
  age_spot: "If your dark spots looked noticeably lighter",
  acne: "If your breakouts looked noticeably fainter",
  wrinkle: "If your fine lines looked noticeably softer",
  dark_circle: "If your under-eye shadows looked noticeably lighter",
  eye_bag: "If your under-eye puffiness looked noticeably smoother",
  redness: "If your redness looked noticeably fainter",
  texture: "If your skin texture looked noticeably smoother",
};

/** Up to this far a change counts as near: it "wouldn't show beyond X". Across a table, like the rest of the copy. */
const NEAR_MAX_M = 1.5;
/** Up to this far it is the mirror and selfie view, which is mostly your own. */
const MIRROR_MAX_M = 0.35;
const TABLE_M = 1.5;
/** From here a broad flush of redness counts as a soft area, as in describeConcern. */
const ROOM_M = 4;
const MIN_PROFILE_TARGETS = 5;
const MAX_HEADLINE_CHARS = 60;

const join = (parts: string[]) => parts.filter(Boolean).join(" ");
const fit = (...candidates: string[]) => candidates.find((c) => c.length <= MAX_HEADLINE_CHARS) ?? candidates[candidates.length - 1];

function nominalMax(w: WorthItInput): number {
  return w.differenceNominalMaxDistanceM ?? w.differenceMaxDistanceM / BOUND_TO_NOMINAL_RATIO;
}

/** Share of the changes a typical sharp-eyed person could see across a table. */
function nominalShareAtTable(w: WorthItInput): number {
  if (w.differenceNominalProfile) return profileAt(w.differenceNominalProfile, TABLE_M).fraction;
  if (w.differenceProfile) return profileAt(w.differenceProfile, TABLE_M * BOUND_TO_NOMINAL_RATIO).fraction;
  return 0;
}

function isSoft(w: WorthItInput): boolean {
  return w.concern === "dark_circle" || w.concern === "eye_bag" || (w.concern === "redness" && nominalMax(w) >= ROOM_M);
}

export function describeWorthIt(w: WorthItInput): WorthItDescription {
  const noun = concernNoun(w.concern);
  const them = concernThem(w.concern);
  if (!CONCERNS[w.concern].visibility || w.targetCount === 0) {
    return {
      headline: "There's no change to compare for this one.",
      detail: `We didn't find any ${noun} to measure, so there's nothing to simulate.`,
    };
  }
  const picture = `${IF_IT_LOOKED[w.concern]} ${WORTH_IT_CREDIT}`;
  const d = w.differenceMaxDistanceM;

  if (d < MIN_DISTANCE_M) {
    return {
      headline: "A typical person wouldn't see the change, even up close.",
      detail: `${picture}, a typical person wouldn't see the difference, even from ${formatDistance(MIN_DISTANCE_M)}.`,
    };
  }
  if (d <= NEAR_MAX_M) {
    return {
      headline: `A typical person wouldn't see the change beyond ${formatDistance(d)}.`,
      detail: join([
        `${picture}, a typical person wouldn't see the difference beyond ${formatDistance(d)}.`,
        d <= MIRROR_MAX_M ? "That's a difference for the mirror, more than for anyone else." : "",
      ]),
    };
  }

  if (isSoft(w)) {
    return {
      headline: "A large, soft area shows even a small change.",
      detail: `Because it's a large area, even a small change can be seen from a distance. ${picture}, a typical person could tell the difference on any face.`,
    };
  }

  const many =
    (w.differenceProfile !== undefined || w.differenceNominalProfile !== undefined) &&
    w.targetCount >= MIN_PROFILE_TARGETS &&
    CONCERNS[w.concern].maskKind !== "region";
  if (many) {
    const word = shareWord(nominalShareAtTable(w));
    const table = anchorFor(TABLE_M);
    if (word === "none") {
      return {
        headline: `A typical person wouldn't see the change ${table}.`,
        detail: `${picture}, a typical person wouldn't pick out the difference on your ${noun} from ${table}.`,
      };
    }
    return {
      headline: fit(`The change could show on ${word} of your ${noun}.`, `The change could show on ${word} of them.`),
      detail: `${picture}, a typical sharp-eyed person looking right at ${them} could see the difference on ${word} of your ${noun} from ${table}.`,
    };
  }

  const nominal = nominalMax(w);
  const capped = nominal >= MAX_DISTANCE_M;
  const from = capped ? "across a room or farther" : `about ${formatDistance(nominal)}`;
  return {
    headline: `The change could show from ${from}.`,
    detail: `${picture}, a typical sharp-eyed person looking right at ${them} could see the difference from ${from}${capped ? "" : `, ${anchorFor(nominal)}`}.`,
  };
}
