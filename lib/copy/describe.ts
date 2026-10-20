/**
 * Deterministic sentences for visibility results. No LLM: every line is a template filled from numbers.
 *
 * Register: kind, factual, relief first. Distances, not grades. The claim is one-sided (see
 * lib/contracts/vision.ts): beyond the distance, even perfect eyes cannot see it. Inside it, we only say
 * that sharp eyes looking right at it could, never that people will.
 *
 * Concerns with many features (at least 5, not area regions) are summarised by the share of them detectable at
 * fixed distances (ConcernVisibility.profile), not by the farthest one, which a single outlier decides. They are a
 * relief when at most RELIEF_SHARE of them can be seen across a table. Everything else keeps the single-distance wording.
 */
import { CONCERNS, type ConcernId } from "@/lib/contracts/concerns";
import { MAX_DISTANCE_M, MIN_DISTANCE_M, type ConcernVisibility, type VisibilityReport } from "@/lib/contracts/vision";
import { CONCERN_COPY, concernBe, concernName, concernNoun, concernThem } from "./concerns";
import {
  anchorFor, CONVERSATION_M, DISTANCE_ANCHORS, formatDistance, formatInterval, type EverydayAnchor,
} from "./distance";
import { profileAt, reachM } from "./profile";

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

/** Across a table: where a many-feature concern is judged. */
export const TABLE_M = 1.5;

/** A many-feature concern is a relief when at most this share of it is detectable across a table. */
export const RELIEF_SHARE = 0.1;

/** Fewer targets than this and a share is not a useful summary: the single-distance wording is used. */
const MIN_PROFILE_TARGETS = 5;

type Group = "relief" | "visible" | "unmeasured";

/** Many-feature concerns (not area regions) with a profile are summarised by shares, not by the farthest target. */
function usesProfile(cv: ConcernVisibility): boolean {
  return cv.profile !== undefined && cv.targetCount >= MIN_PROFILE_TARGETS && CONCERNS[cv.concern].maskKind !== "region";
}

/** The share of the concern that can be seen across a table; without a profile, all or nothing from the farthest target. */
function tableShare(cv: ConcernVisibility): number {
  return cv.profile ? profileAt(cv.profile, TABLE_M).fraction : cv.maxDistanceM >= TABLE_M ? 1 : 0;
}

/** The group a concern falls in when judged from `distanceM`: relief when gone (or down to RELIEF_SHARE) by then. */
function groupAt(cv: ConcernVisibility, distanceM: number): Group {
  if (!CONCERNS[cv.concern].visibility || cv.targetCount === 0) return "unmeasured";
  if (usesProfile(cv)) return profileAt(cv.profile!, distanceM).fraction <= RELIEF_SHARE + 1e-9 ? "relief" : "visible";
  return cv.maxDistanceM <= distanceM ? "relief" : "visible";
}

/** Single-distance concerns are judged at conversation distance, many-feature ones across a table. */
function groupOf(cv: ConcernVisibility): Group {
  return groupAt(cv, usesProfile(cv) ? TABLE_M : RELIEF_MAX_M);
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
const capitalise = (text: string) => text.charAt(0).toUpperCase() + text.slice(1);

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

const EVERYDAY = DISTANCE_ANCHORS.filter((a): a is EverydayAnchor => a.phrase !== null);

/** "across a table" -> "from across a table"; the phrases that are not about a place stand alone. */
const fromPhrase = (phrase: string) => (phrase.startsWith("across") ? `from ${phrase}` : phrase);

/** A headline that is too long loses "your" rather than overflowing the card line. */
const fitHeadline = (withYour: string, without: string) => (withYour.length <= MAX_HEADLINE_CHARS ? withYour : without);

/**
 * Many-feature concerns, relief: at most RELIEF_SHARE of them can be seen across a table, even by perfect eyes.
 * Always counts with "at most": the profile is a bound, so the real number of people-visible marks is lower.
 */
function describeProfileRelief(cv: ConcernVisibility): ConcernDescription {
  const noun = concernNoun(cv.concern);
  const total = cv.targetCount;
  const table = anchorFor(TABLE_M);
  const atTable = Math.round(profileAt(cv.profile!, TABLE_M).count);
  const atConversation = Math.round(profileAt(cv.profile!, CONVERSATION_M).count);
  const closer = atConversation > atTable ? `At ${formatDistance(CONVERSATION_M)}, that rises to at most ${atConversation}.` : "";
  const note = roughEstimateNote(cv);

  if (atTable === 0) {
    return {
      headline: `Nobody can see your ${noun} ${fromPhrase(table)}.`,
      detail: join([`From ${table}, not one of your ${total} ${noun} could be seen, even by perfect eyes.`, closer, note]),
      tone: "relief",
    };
  }
  return {
    headline: fitHeadline(
      `At most ${atTable} of your ${total} ${noun} show ${fromPhrase(table)}.`,
      `At most ${atTable} of ${total} ${noun} show ${fromPhrase(table)}.`,
    ),
    detail: join([`From ${table}, at most ${atTable} of your ${total} ${noun} could be seen, even by perfect eyes.`, closer, note]),
    tone: "relief",
  };
}

/**
 * Many-feature concerns, visible: the farthest everyday anchor where at least RELIEF_SHARE is still detectable.
 * Counts are bounds, so every sentence says "at most" (or "could").
 */
function describeProfileVisible(cv: ConcernVisibility): ConcernDescription {
  const noun = concernNoun(cv.concern);
  const them = concernThem(cv.concern);
  const total = cv.targetCount;
  const reach = reachM(cv.profile!, RELIEF_SHARE);
  const anchor = EVERYDAY.filter((a) => a.m <= reach + 1e-9).pop() ?? nearestTable();
  const count = Math.round(profileAt(cv.profile!, anchor.m).count);
  const where = fromPhrase(anchor.phrase);
  const hook = `See what would make ${them} disappear at ${formatDistance(CONVERSATION_M)}.`;
  const note = roughEstimateNote(cv);
  if (count >= total) {
    return {
      headline: `All ${total} of your ${noun} could show ${where}.`,
      detail: join([`Sharp eyes looking right at ${them} could see all ${total} ${where}.`, note, hook]),
      tone: "visible",
    };
  }
  // Rounded up: a percentage shown for an upper bound must not dip below it.
  const percent = Math.ceil((count / total) * 100 - 1e-9);
  return {
    headline: fitHeadline(
      `At most ${count} of your ${total} ${noun} show ${where}.`,
      `At most ${count} of ${total} ${noun} show ${where}.`,
    ),
    detail: join([
      `${capitalise(where)}, at most ${count} of your ${total} ${noun} (${percent}%) could be seen, and only by sharp eyes looking right at ${them}.`,
      note,
      hook,
    ]),
    tone: "visible",
  };
}

function nearestTable(): EverydayAnchor {
  return EVERYDAY.reduce((best, a) => (Math.abs(a.m - TABLE_M) < Math.abs(best.m - TABLE_M) ? a : best));
}

export function describeConcern(cv: ConcernVisibility): ConcernDescription {
  switch (groupOf(cv)) {
    case "unmeasured":
      return describeUnmeasured(cv);
    case "relief":
      return usesProfile(cv) ? describeProfileRelief(cv) : describeRelief(cv);
    case "visible":
      return usesProfile(cv) ? describeProfileVisible(cv) : describeVisible(cv);
  }
}

/**
 * The live counter for the Step-back slider, e.g. "At most 143 of 656 pores detectable from here". The profile is read on a log
 * distance axis and clamped outside its range (closer than the first point the count is a lower bound, beyond the last
 * an upper bound). Concerns without a profile get a yes/no line from the farthest target.
 */
export function stepBackCounter(cv: ConcernVisibility, distanceM: number): string {
  if (!CONCERNS[cv.concern].visibility || cv.targetCount === 0) return describeUnmeasured(cv).headline;
  if (cv.profile && CONCERN_COPY[cv.concern].agreement === "plural") {
    const n = Math.round(profileAt(cv.profile, distanceM).count);
    return `At most ${n} of ${cv.targetCount} ${concernName(cv.concern, cv.targetCount === 1 ? "singular" : "plural")} detectable from here`;
  }
  const seen = cv.maxDistanceM >= distanceM;
  return seen
    ? `Your ${concernNoun(cv.concern)} may be detectable from here`
    : `Your ${concernNoun(cv.concern)} ${concernBe(cv.concern)} no longer detectable from here`;
}

const CONCERN_ORDER = Object.keys(CONCERNS) as ConcernId[];

function byGroupThenDistance(a: ConcernVisibility, b: ConcernVisibility): number {
  const rank = { relief: 0, visible: 1, unmeasured: 2 } as const;
  const ga = groupOf(a);
  const gb = groupOf(b);
  if (ga !== gb) return rank[ga] - rank[gb];
  // Relief: the biggest relief (the smallest share across a table) first. Visible: the most visible first.
  // Ties fall back to the farthest target, as before.
  const sign = ga === "visible" ? -1 : 1;
  const share = sign * (tableShare(a) - tableShare(b));
  if (Math.abs(share) > 1e-9) return share;
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

  if (relief.length === 0 && visible.length === 0) return "We didn't find anything to measure this time.";

  // The vantage must hold for every concern the sentence names: a pore count is judged across a table, so a
  // sentence that names pores as unseen cannot be about a metre away.
  const vantage = (named: ConcernVisibility[]) =>
    [CONVERSATION_M, TABLE_M].find((d) => named.every((c) => groupAt(c, d) === groupOf(c))) === CONVERSATION_M
      ? "From a metre away,"
      : "From across a table,";

  if (visible.length === 0) {
    const shown = relief.slice(0, 3);
    const more = relief.length - shown.length;
    const names = shown.map((c) => concernNoun(c.concern));
    if (more > 0) names.push(`${more} more`);
    const unsure = shown.some((c) => c.confidence === "low");
    return `${vantage(shown)} ${unsure ? "we don't think anyone can see" : "nobody can see"} your ${listNames(names, "or")}.`;
  }

  const featured = visible.slice(0, 2);
  const names = featured.map((c) => concernNoun(c.concern));
  const seen = `your ${listNames(names, "and")}`;
  if (relief.length === 0) {
    const unsure = featured.some((c) => c.confidence === "low");
    return `${vantage(featured)} people ${unsure ? "may see" : "see"} ${seen}.`;
  }

  // Name the relief we trust most: the nearest-vanishing one that isn't a rough estimate.
  const unseen = relief.find((c) => c.confidence !== "low") ?? relief[0];
  const unsure = featured.some((c) => c.confidence === "low") || unseen.confidence === "low";
  return `${vantage([...featured, unseen])} people ${unsure ? "may see" : "see"} ${seen}, not your ${concernNoun(unseen.concern)}.`;
}
