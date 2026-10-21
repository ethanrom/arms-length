/**
 * The sentences lib/copy does not cover, in the same register: kind, factual, two observers (a typical sharp-eyed person
 * for what can be picked out, the one-sided bound for what cannot), words rather than counts on the main surface.
 * Everything with a number in it is filled from the report; nothing is written per persona. Candidates to move into
 * lib/copy; the copy linter (app/_lib/copy.test.ts and lib/copy/copy.test.ts) reads this file too.
 */
import { CONCERNS, type ConcernId, type ConcernVisibility, type CoveragePlan, type Measurements } from "@/lib/contracts";
import {
  anchorFor,
  concernBe,
  concernNoun,
  concernThem,
  concernTitle,
  describeCoverage as describeCoverageCopy,
  DISCLAIMERS,
  DISTANCE_ANCHORS,
  formatDistance,
  formatInterval,
  nominalFractionAt,
  isSoftArea,
  reachM,
  shareWord,
  TABLE_M,
} from "@/lib/copy";

/** "Dark spots", "Redness". */
export const titleOf = (id: ConcernId): string => concernTitle(id);

/** Sits on the face while the slider crosses the threshold: "pores fade here". */
export const fadeLabelOf = (id: ConcernId): string => `${concernNoun(id)} ${concernBe(id) === "are" ? "fade" : "fades"} here`;

/** Many-feature concerns (not area regions) carry a profile: the same rule lib/copy uses. */
export function hasProfile(cv: ConcernVisibility): boolean {
  return cv.profile !== undefined && cv.targetCount >= 5 && CONCERNS[cv.concern].maskKind !== "region";
}

/**
 * The distance that labels a concern on the slider: where half of its marks drop out of sight for a typical sharp-eyed
 * person (the nominal profile; the bound's when a report has none), or the single area's limit.
 */
export function keyDistanceOf(cv: ConcernVisibility): number {
  if (hasProfile(cv)) return reachM(cv.nominalProfile ?? cv.profile!, 0.5);
  return cv.nominalMaxDistanceM ?? cv.maxDistanceM;
}

/** The chip on a concern card. */
export function keyLine(cv: ConcernVisibility, tone: "relief" | "visible"): string {
  if (isSoftArea(cv)) return "A large, soft area";
  if (hasProfile(cv)) return `Half out of sight by ${formatDistance(keyDistanceOf(cv))}`;
  return tone === "relief" ? `Out of sight beyond ${formatDistance(cv.maxDistanceM)}` : `Can be picked out up to ${formatDistance(keyDistanceOf(cv))}`;
}

/** "What this number means", in plain words: a typical sharp-eyed person, and the ceiling of perfect eyes. */
export function numberMeaning(cv: ConcernVisibility): string {
  const noun = titleOf(cv.concern).toLowerCase();
  const them = concernThem(cv.concern);
  if (isSoftArea(cv)) {
    return `It is a large area, so even a small difference carries far, on any face. The bar and the curve are left out because a distance here would say how big it is, not how strong. Real viewers glance and see less.`;
  }
  if (hasProfile(cv)) {
    return `The filled curve is the share of your ${noun} that a typical sharp-eyed person, looking right at each one, could pick out at each distance. The dashed line is the ceiling: even perfect eyes cannot pick out more than that. Real viewers glance, so they see less.`;
  }
  const reach = formatDistance(keyDistanceOf(cv));
  return `A typical sharp-eyed person, looking right at ${them}, could pick ${them} out up to about ${reach}. Even perfect eyes lose ${them} beyond ${formatDistance(cv.maxDistanceM)}. Real viewers glance, so they see less.`;
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

const capitalise = (text: string) => text.charAt(0).toUpperCase() + text.slice(1);

/** The confidence line with its reason, the scale source and, where a distance is stated, its plausible range. */
export function confidenceLine(cv: ConcernVisibility, measurements: Measurements): string {
  const { scale } = measurements;
  const source =
    scale.source === "iris"
      ? `Scale comes from the width of the iris (about ${Math.round(scale.relSd * 100)}% uncertainty).`
      : scale.source === "card"
        ? "Scale comes from the bank card in the photo."
        : "Scale is an estimate: there was no iris or card to measure.";
  const range = isSoftArea(cv) ? "" : ` Range for the farthest-carrying one, for even perfect eyes: ${formatInterval(cv.intervalM)}.`;
  return `${capitalise(cv.confidence)} confidence. ${SIZE_REASON[cv.concern]} ${source}${range}`;
}

/** One short line for the share card: words, not counts. */
export function shareSentence(cv: ConcernVisibility, tone: "relief" | "visible"): string {
  if (isSoftArea(cv)) return "a large, soft area: shows on any face";
  if (hasProfile(cv)) {
    const word = shareWord(nominalFractionAt(cv, TABLE_M));
    return word === "none" ? `none can be picked out ${anchorFor(TABLE_M)}` : `${word} can be picked out ${anchorFor(TABLE_M)}`;
  }
  return tone === "relief"
    ? `out of sight beyond ${formatDistance(cv.maxDistanceM)}`
    : `can be picked out up to ${formatDistance(keyDistanceOf(cv))}`;
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
// the lightest touch
// ---------------------------------------------------------------------------------------------------

export interface CoverageSentences {
  headline: string;
  detail: string;
  /** "foundation coverage 50%"; null when no lever is needed or none works. */
  leverLabel: string | null;
  leverName: string | null;
}

/** lib/copy's sentences for a plan, plus the lever label the UI prints beside the big number. */
export function coverageSentences(plan: CoveragePlan): CoverageSentences {
  const said = describeCoverageCopy(plan);
  const chosen = plan.chosen;
  return {
    ...said,
    leverLabel: chosen ? `foundation coverage ${chosen.lever.value}%` : null,
    leverName: chosen ? "foundation coverage" : null,
  };
}

export const COVERAGE_LEDE = (targetM: number) =>
  `Pick a concern. We look for the lightest layer that puts it out of sight ${anchorFor(targetM) === "across a table" ? "from across a table" : anchorFor(targetM)}, and check it on a virtual try-on, measured the same way as everything above. ${DISCLAIMERS.tryOn}`;

// ---------------------------------------------------------------------------------------------------
// page furniture
// ---------------------------------------------------------------------------------------------------

/** Sits on the engine strip under the hero, not in it (expert panel triage, item 7). */
export const TAGLINE = "YouCam's AI finds it. Vision science measures it.";

/** What is and is not drawn on the hero, said once under the face. The photo is "Your photo" only when it is one. */
export const heroLabel = (own: boolean) =>
  `${own ? "Your photo" : "The photo"}, nothing redrawn, filtered by a model of human eyesight at this distance.`;
export const RENDERER_NOTE = "Drawn by the same model that gives the numbers: detail below a typical sharp-eyed person's threshold fades.";

export const WORTH_IT_LEDE = `These are pictures from YouCam Skin Simulation, cropped to the part of the face each change would touch. Each line says how far away a typical person could still tell the difference, so you can see which changes others could notice and which only the mirror would. ${DISCLAIMERS.simulation}`;

/** Burned into every share card and said under the preview: who the numbers are for, and that they are an estimate. */
export const SHARE_QUALIFIER = "For a typical sharp-eyed person looking right at it, in indoor light. An estimate.";
export const SYNTHETIC_TAG = "Synthetic face (AI-generated)";

// ---------------------------------------------------------------------------------------------------
// the YouCam engine strip and the validation badge
// ---------------------------------------------------------------------------------------------------

export const ENGINE_TITLE = "Built on YouCam";
export const ENGINE_PARTS = ["HD Skin Analysis", "Skin Simulation", "Makeup VTO"] as const;
/** One session on a live photo: 16 for the HD analysis, 6 for the Skin Simulation call, up to 4 for the try-on renders. */
export const ENGINE_UNITS = "16 + 6 + up to 4 units per session";

/** The badge beside the engine strip: where these results came from, and what they cost. */
export function engineBadge(source: "demo" | "replay" | "live", unitsCharged = 0): string {
  if (source === "live") return `Live (this session: ${unitsCharged} ${unitsCharged === 1 ? "unit" : "units"})`;
  if (source === "replay") return "Replay of a recording (0 units)";
  return "Recorded analysis (demo, 0 units)";
}

/** Numbers from docs/EVAL.md: 0.69 dB RMS over 41 ModelFest test patterns, measured on 16 observers. */
export const VALIDATION_BADGE = "Checked against a published eye study: ModelFest, 16 observers, 0.69 dB error";
export const VALIDATION_HREF = "/how-it-works#validation";

/** Labels on the Step back axis: the anchors that fit the slider's range, with a short form for narrow screens. */
const TAPE_IDS = ["mirror", "selfie", "conversation", "across_table", "across_room"] as const;
const SHORT: Record<(typeof TAPE_IDS)[number], string> = {
  mirror: "Mirror",
  selfie: "Selfie",
  conversation: "Talk",
  across_table: "Table",
  across_room: "Room",
};

/** The names on the buttons beside the slider. */
const LABEL: Partial<Record<(typeof TAPE_IDS)[number], string>> = { selfie: "Selfie" };

export const TAPE_ANCHORS: { distanceM: number; label: string; short: string }[] = TAPE_IDS.map((id) => {
  const a = DISTANCE_ANCHORS.find((x) => x.id === id)!;
  return { distanceM: a.m, label: LABEL[id] ?? a.label, short: SHORT[id] };
});

