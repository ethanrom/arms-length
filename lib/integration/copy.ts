/**
 * The sentences lib/copy does not cover, in the same register: kind, factual, bound-based ("at most N", never "will").
 * Everything with a number in it is filled from the report; nothing is written per persona. These are candidates to
 * move into lib/copy; the copy linter (app/_lib/copy.test.ts) reads this file too.
 */
import {
  CONCERNS,
  type ConcernId,
  type ConcernVisibility,
  type CoveragePlan,
  type Measurements,
} from "@/lib/contracts";
import {
  anchorFor,
  concernBe,
  concernName,
  concernNoun,
  concernThem,
  DISTANCE_ANCHORS,
  formatDistance,
  formatInterval,
  profileAt,
  TABLE_M,
} from "@/lib/copy";

const capitalise = (text: string) => text.charAt(0).toUpperCase() + text.slice(1);

/** "Dark spots", "Redness". */
export const titleOf = (id: ConcernId): string => capitalise(concernName(id, "plural"));

/** Sits on the face while the slider crosses the threshold: "pores fade here". */
export const fadeLabelOf = (id: ConcernId): string => `${concernNoun(id)} ${concernBe(id) === "are" ? "fade" : "fades"} here`;

/** Many-feature concerns (not area regions) carry a profile: the same rule lib/copy uses. */
export function hasProfile(cv: ConcernVisibility): boolean {
  return cv.profile !== undefined && cv.targetCount >= 5 && CONCERNS[cv.concern].maskKind !== "region";
}

/** The distance that orders a concern and labels the face: where half of its marks vanish, or the single area's limit. */
export function keyDistanceOf(cv: ConcernVisibility): number {
  return hasProfile(cv) ? cv.medianDistanceM : cv.maxDistanceM;
}

/** The chip on a concern card. */
export function keyLine(cv: ConcernVisibility, tone: "relief" | "visible"): string {
  if (hasProfile(cv)) return `Half gone by ${formatDistance(cv.medianDistanceM)}`;
  return `${tone === "relief" ? "Gone by" : "Up to"} ${formatDistance(cv.maxDistanceM)}`;
}

/** "What this number means", in plain words. */
export function numberMeaning(cv: ConcernVisibility): string {
  const noun = concernNoun(cv.concern);
  const them = concernThem(cv.concern);
  if (hasProfile(cv)) {
    return `The curve counts how many of your ${cv.targetCount} ${noun} someone with perfect eyesight, looking straight at each one, could just pick out at each distance. Beyond the line, nobody can. Closer in, read the count as a ceiling: real viewers glance and see less.`;
  }
  const reach = cv.maxDistanceM >= 10 ? "10 m or more" : formatDistance(cv.maxDistanceM);
  return `${capitalise(reach)} is the farthest distance at which someone with perfect eyesight, looking straight at ${them}, could just pick ${them} out. Beyond it, nobody can. Real viewers see less, so read it as a ceiling.`;
}

const SIZE_REASON: Record<ConcernId, string> = {
  pore: "YouCam marks where pores are, not how big they are, so each size is read from the photo around its mark.",
  acne: "YouCam marks where breakouts are, not how big they are, so each size is read from the photo around its mark.",
  age_spot: "Sizes come from the outlines YouCam drew.",
  wrinkle: "Lines are thin, so a small error in width moves the distance.",
  dark_circle: "Large areas measure well, against the cheek next to them.",
  eye_bag: "A soft change in shading, measured against the cheek next to it.",
  redness: "Broad colour differences are measured against nearby skin, in red-green contrast only.",
  texture: "Not measured.",
};

/** The confidence line with its reason, the scale source and the plausible range of the most visible one. */
export function confidenceLine(cv: ConcernVisibility, measurements: Measurements): string {
  const { scale } = measurements;
  const source =
    scale.source === "iris"
      ? `Scale comes from the width of the iris (about ${Math.round(scale.relSd * 100)}% uncertainty).`
      : scale.source === "card"
        ? "Scale comes from the bank card in the photo."
        : "Scale is an estimate: there was no iris or card to measure.";
  return `${capitalise(cv.confidence)} confidence. ${SIZE_REASON[cv.concern]} ${source} Plausible range for the most visible one: ${formatInterval(cv.intervalM)}.`;
}

/** One short line for the share card, under MAX_SHARE_CHARS. */
export function shareSentence(cv: ConcernVisibility, tone: "relief" | "visible"): string {
  if (hasProfile(cv) && cv.profile) {
    const n = Math.round(profileAt(cv.profile, TABLE_M).count);
    return `at most ${n} of ${cv.targetCount} show ${anchorFor(TABLE_M)}`;
  }
  if (cv.maxDistanceM >= 10) return "visible from 10 m or more";
  return tone === "relief" ? `out of sight beyond ${formatDistance(cv.maxDistanceM)}` : `visible from up to ${formatDistance(cv.maxDistanceM)}`;
}

/** Concerns we never turn into a distance, with the reason. */
export const NOT_ABOUT_VISIBILITY: { label: string; reason: string }[] = [
  { label: "Firmness", reason: "A matter of shape and feel, not a mark." },
  { label: "Droopy eyelids", reason: "A matter of shape, not a mark." },
  { label: "Moisture", reason: "Felt more than seen, and it changes through the day." },
  { label: "Oiliness", reason: "Changes through the day and with the light." },
  { label: "Radiance", reason: "A property of light on skin, not of the skin." },
  { label: "Skin texture", reason: "It describes the whole surface rather than a mark, so a distance wouldn't mean much." },
];

// ---------------------------------------------------------------------------------------------------
// make it disappear
// ---------------------------------------------------------------------------------------------------

export interface CoverageSentences {
  headline: string;
  detail: string;
  /** "foundation coverage 50%"; null when no lever is needed or none works. */
  leverLabel: string | null;
  leverName: string | null;
}

const fromPhrase = (phrase: string) => (phrase.startsWith("across") ? `from ${phrase}` : phrase);

const countOf = (fraction: number | undefined, total: number) => Math.round((fraction ?? 0) * total);

/**
 * Sentences for a coverage plan. `total` is the concern's target count. Every count is a bound ("at most"), because the
 * renders are judged by the same one-sided model as the report.
 */
export function describeCoverage(plan: CoveragePlan, total: number): CoverageSentences {
  const noun = concernNoun(plan.concern);
  const them = concernThem(plan.concern);
  const where = fromPhrase(anchorFor(plan.targetDistanceM));
  const none = { leverLabel: null, leverName: null };

  if (plan.status === "no_lever") {
    if (plan.reason === "lever_not_tested") {
      return {
        headline: `We haven't tested a makeup lever for ${noun}.`,
        detail: `So there is no coverage number for ${them}. The Worth it? section shows what a real improvement would change instead.`,
        ...none,
      };
    }
    return {
      headline: `Makeup doesn't move ${noun} in our tests.`,
      detail: `Neither concealer nor foundation changed how far ${them} show on a try-on render, so we don't offer a coverage number. The Worth it? section shows what a real improvement would change instead.`,
      ...none,
    };
  }
  if (plan.reason === "no_targets") {
    return { headline: `We didn't find any ${noun} to cover.`, detail: "So there's nothing to hide.", ...none };
  }
  const before = countOf(plan.baselineFraction, total);
  if (plan.reason === "already_met") {
    return {
      headline: before === 0 ? `Nobody can see your ${noun} ${where}.` : `At most ${before} of your ${total} ${noun} show ${where}.`,
      detail: "That is already a tenth or fewer, so no coverage is needed at this distance.",
      ...none,
    };
  }
  const chosen = plan.chosen;
  const full = plan.steps.find((s) => s.lever.value === 100) ?? plan.steps[plan.steps.length - 1];
  if (plan.status === "met" && chosen) {
    const n = countOf(chosen.fractionAtTarget, total);
    return {
      headline: `At ${chosen.lever.value}% coverage, at most ${n} of your ${total} ${noun} show ${where}.`,
      detail: `Checked on a try-on render with the lightest foundation that gets to a tenth or fewer. Without it, at most ${before} could be seen. Your own shade and light will shift it a little.`,
      leverLabel: `foundation coverage ${chosen.lever.value}%`,
      leverName: "foundation coverage",
    };
  }
  if (plan.status === "not_met" && chosen) {
    const n = countOf(chosen.fractionAtTarget, total);
    const nFull = countOf(full?.fractionAtTarget, total);
    return {
      headline: `Even full coverage leaves at most ${nFull} of ${total} ${noun} showing.`,
      detail: `${chosen.lever.value === 100 ? "Full coverage is the most it can do" : `Most of the effect arrives by ${chosen.lever.value}% coverage`}: at most ${n} could be seen ${where}, down from at most ${before}. Up close, someone looking closely can still pick out almost any mark.`,
      leverLabel: `foundation coverage ${chosen.lever.value}%`,
      leverName: "foundation coverage",
    };
  }
  return {
    headline: `Foundation doesn't change how far your ${noun} show.`,
    detail: `We tried it up to 100% coverage on try-on renders and the count stayed the same. The Worth it? section shows what a real improvement would change.`,
    ...none,
  };
}

// ---------------------------------------------------------------------------------------------------
// page furniture
// ---------------------------------------------------------------------------------------------------

export const TAGLINE = "YouCam's AI finds it. Vision science measures it.";
export const HERO_LABEL = "Your photo, nothing redrawn. Filtered by a model of human vision at this distance.";
export const RENDERER_NOTE = "Drawn by the same model that gives the numbers: detail below a perfect observer's threshold fades.";

export const COVERAGE_LEDE = (targetM: number) =>
  `The least foundation coverage that leaves at most a tenth of a concern's marks detectable ${fromPhrase(anchorFor(targetM))}, checked on a YouCam try-on render and measured the same way as everything above.`;

export const WORTH_IT_LEDE =
  "A realistic improvement is about half of what YouCam Skin Simulation can show. These lines say how far away someone could still tell the difference, so you can see which changes others could notice and which only the mirror would.";

/** Labels on the Step back axis: the anchors that fit the slider's range, with a short form for narrow screens. */
const TAPE_IDS = ["mirror", "selfie", "conversation", "across_table", "across_room"] as const;
const SHORT: Record<(typeof TAPE_IDS)[number], string> = {
  mirror: "Mirror",
  selfie: "Selfie",
  conversation: "Talk",
  across_table: "Table",
  across_room: "Room",
};

export const TAPE_ANCHORS: { distanceM: number; label: string; short: string }[] = TAPE_IDS.map((id) => {
  const a = DISTANCE_ANCHORS.find((x) => x.id === id)!;
  return { distanceM: a.m, label: a.label, short: SHORT[id] };
});

