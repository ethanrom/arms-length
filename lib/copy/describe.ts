/**
 * Deterministic sentences for visibility results. No LLM: every line is a template filled from numbers.
 *
 * Register: kind, factual, relief first. Distances, not grades. The claim is one-sided (see
 * lib/contracts/vision.ts): beyond the distance, even perfect eyes cannot see it. Inside it, we only say
 * that sharp eyes looking right at it could, never that people will.
 */
import { CONCERNS, type ConcernId } from "@/lib/contracts/concerns";
import { MAX_DISTANCE_M, MIN_DISTANCE_M, type ConcernVisibility, type VisibilityReport } from "@/lib/contracts/vision";
import { CONCERN_COPY, concernBe, concernNoun, concernThem } from "./concerns";
import { anchorFor, CONVERSATION_M, formatDistance, formatInterval } from "./distance";

export type Tone = "relief" | "visible";

export interface ConcernDescription {
  /** At most 60 characters. */
  headline: string;
  detail: string;
  tone: Tone;
}

/** Headlines must fit a card line; the copy test asserts it for every template. */
export const MAX_HEADLINE_CHARS = 60;

/** Up to this far (selfie distance plus a margin) a concern is only visible at the mirror or in a selfie. */
const MIRROR_BAND_MAX_M = 0.35;

/** A concern is a relief when it is gone by conversation distance, the same target the coverage search uses. */
export const RELIEF_MAX_M = CONVERSATION_M;

type Group = "relief" | "visible" | "unmeasured";

function groupOf(cv: ConcernVisibility): Group {
  if (!CONCERNS[cv.concern].visibility || cv.targetCount === 0) return "unmeasured";
  return cv.maxDistanceM <= RELIEF_MAX_M ? "relief" : "visible";
}

export function toneOf(cv: ConcernVisibility): Tone {
  return groupOf(cv) === "visible" ? "visible" : "relief";
}

function roughEstimateNote(cv: ConcernVisibility): string {
  if (cv.confidence !== "low") return "";
  const [lo, hi] = cv.intervalM;
  const wide = Number.isFinite(lo) && Number.isFinite(hi) && formatDistance(lo) !== formatDistance(hi);
  return wide ? `This one is a rough estimate: the range is about ${formatInterval(cv.intervalM)}.` : "This one is a rough estimate.";
}

/** The conservative end: a "nobody can see it beyond X" claim must hold across the measurement interval. */
function upperBoundM(cv: ConcernVisibility): number {
  const hi = cv.intervalM[1];
  return Number.isFinite(hi) ? Math.max(cv.maxDistanceM, hi) : cv.maxDistanceM;
}

const join = (parts: string[]) => parts.filter(Boolean).join(" ");

function describeUnmeasured(cv: ConcernVisibility): ConcernDescription {
  const noun = concernNoun(cv.concern);
  if (!CONCERNS[cv.concern].visibility) {
    return {
      headline: `We don't give ${noun} a distance.`,
      detail: "It describes the whole surface rather than a single mark, so a distance wouldn't mean much.",
      tone: "relief",
    };
  }
  return {
    headline: `We didn't find any ${noun} to measure.`,
    detail: "So there's no distance to report for this one. If you expected some, a clearer, evenly lit photo can help.",
    tone: "relief",
  };
}

function describeRelief(cv: ConcernVisibility): ConcernDescription {
  const noun = concernNoun(cv.concern);
  const them = concernThem(cv.concern);
  const bound = formatDistance(upperBoundM(cv));
  const note = roughEstimateNote(cv);

  if (cv.maxDistanceM < MIN_DISTANCE_M) {
    return {
      headline: `Nobody can see your ${noun}, even up close.`,
      detail: join([`Even from ${formatDistance(MIN_DISTANCE_M)}, a person with perfect eyesight couldn't pick ${them} out.`, note]),
      tone: "relief",
    };
  }
  if (cv.maxDistanceM <= MIRROR_BAND_MAX_M) {
    return {
      headline: `Nobody can see your ${noun} beyond ${bound}.`,
      detail: join(["That's about mirror and selfie distance, a view that's mostly yours.", note]),
      tone: "relief",
    };
  }
  return {
    headline: `Nobody can see your ${noun} from across a table.`,
    detail: join([`Even someone with perfect eyesight would need to be closer than ${bound}.`, note]),
    tone: "relief",
  };
}

function describeVisible(cv: ConcernVisibility): ConcernDescription {
  const noun = concernNoun(cv.concern);
  const them = concernThem(cv.concern);
  const capped = cv.maxDistanceM >= MAX_DISTANCE_M;
  const from = capped ? "10 m or more" : `about ${formatDistance(cv.maxDistanceM)}`;

  const where = capped
    ? `That's across a room and beyond, for sharp eyes looking right at ${them}. We stop measuring at ${MAX_DISTANCE_M} m.`
    : `That's ${anchorFor(cv.maxDistanceM)}, for sharp eyes looking right at ${them}.`;

  const spread =
    CONCERN_COPY[cv.concern].agreement === "plural" && cv.targetCount >= 3 && cv.medianDistanceM > 0 && cv.medianDistanceM <= 0.6 * cv.maxDistanceM
      ? `Most of them fade from view beyond ${formatDistance(cv.medianDistanceM)}.`
      : "";

  return {
    headline: `Your ${noun} ${concernBe(cv.concern)} visible from ${from}.`,
    detail: join([where, spread, roughEstimateNote(cv), `See what would make ${them} disappear at ${formatDistance(CONVERSATION_M)}.`]),
    tone: "visible",
  };
}

export function describeConcern(cv: ConcernVisibility): ConcernDescription {
  switch (groupOf(cv)) {
    case "unmeasured":
      return describeUnmeasured(cv);
    case "relief":
      return describeRelief(cv);
    case "visible":
      return describeVisible(cv);
  }
}

const CONCERN_ORDER = Object.keys(CONCERNS) as ConcernId[];

function byGroupThenDistance(a: ConcernVisibility, b: ConcernVisibility): number {
  const rank = { relief: 0, visible: 1, unmeasured: 2 } as const;
  const ga = groupOf(a);
  const gb = groupOf(b);
  if (ga !== gb) return rank[ga] - rank[gb];
  // Relief: the biggest relief (vanishes closest) first. Visible: the most visible first.
  const sign = ga === "visible" ? -1 : 1;
  const d = sign * (a.maxDistanceM - b.maxDistanceM);
  if (d !== 0) return d;
  return CONCERN_ORDER.indexOf(a.concern) - CONCERN_ORDER.indexOf(b.concern);
}

/**
 * Relief items first, the one that vanishes closest to you leading. Then the visible ones, most visible
 * first: the top card is the one the "make it vanish at 1 m" step helps most (matching `topTargets`, most
 * visible first), and the list tapers off gently instead of ending on the biggest one. Concerns with nothing
 * measured, or that aren't about visibility, come last. Returns a new array.
 */
export function orderReliefFirst<T extends ConcernVisibility>(cvs: readonly T[]): T[] {
  return [...cvs].sort(byGroupThenDistance);
}

function listNames(items: string[], last: "and" | "or"): string {
  if (items.length <= 1) return items.join("");
  return `${items.slice(0, -1).join(", ")} ${last} ${items[items.length - 1]}`;
}

/** One sentence for the share card, e.g. "From a metre away, people see your redness, not your pores." */
export function summaryLine(report: VisibilityReport): string {
  const ordered = orderReliefFirst(report.concerns);
  const relief = ordered.filter((c) => groupOf(c) === "relief");
  const visible = ordered.filter((c) => groupOf(c) === "visible");
  const from = "From a metre away,";

  if (relief.length === 0 && visible.length === 0) return "We didn't find anything to measure this time.";

  if (visible.length === 0) {
    const shown = relief.slice(0, 3);
    const more = relief.length - shown.length;
    const names = shown.map((c) => concernNoun(c.concern));
    if (more > 0) names.push(`${more} more`);
    const unsure = shown.some((c) => c.confidence === "low");
    return `${from} ${unsure ? "we don't think anyone can see" : "nobody can see"} your ${listNames(names, "or")}.`;
  }

  const featured = visible.slice(0, 2);
  const names = featured.map((c) => concernNoun(c.concern));
  const seen = `your ${listNames(names, "and")}`;
  if (relief.length === 0) {
    const unsure = featured.some((c) => c.confidence === "low");
    return `${from} people ${unsure ? "may see" : "see"} ${seen}.`;
  }

  // Name the relief we trust most: the nearest-vanishing one that isn't a rough estimate.
  const unseen = relief.find((c) => c.confidence !== "low") ?? relief[0];
  const unsure = featured.some((c) => c.confidence === "low") || unseen.confidence === "low";
  return `${from} people ${unsure ? "may see" : "see"} ${seen}, not your ${concernNoun(unseen.concern)}.`;
}
