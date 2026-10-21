/**
 * Deterministic sentences for visibility results. No LLM: every line is a template filled from numbers.
 *
 * Register: kind, factual, relief first. Distances, not grades. Two observers, never mixed up (expert panel, 2026-10-21):
 *   - Visible-side copy ("can be picked out", "can be seen") speaks for a typical sharp-eyed person looking right at the
 *     feature: the nominal distances (ConcernVisibility.nominalProfile / nominalMaxDistanceM).
 *   - Relief copy ("even perfect eyes couldn't ...") speaks for the one-sided bound (lib/contracts/vision.ts): beyond it
 *     even perfect eyes cannot, so the claim is as safe as the model allows. The conditions travel in the same sentence
 *     ("looking right at them in normal indoor light"). No "nobody", "never" or "promise".
 *
 * Concerns with many features (at least 5, not area regions) are summarised by the share of them out of sight, in words
 * ("most", "about a third", "a few"), never as a count: exact counts live in `receiptCounts`. They are a relief when at most
 * RELIEF_SHARE of them can be picked out across a table even by perfect eyes. Large soft areas (under-eye shadows and
 * puffiness, a broad flush of redness) get no distance at all: they carry far on every face, so the universal fact leads.
 */
import { CONCERNS, type ConcernId } from "@/lib/contracts/concerns";
import type { ConcernResult } from "@/lib/contracts/measure";
import { MAX_DISTANCE_M, MIN_DISTANCE_M, type ConcernVisibility, type VisibilityReport } from "@/lib/contracts/vision";
import type { ConcernVisibilityExt } from "@/lib/vision/report";
import { CONCERN_COPY, concernBe, concernName, concernNoun, concernThem } from "./concerns";
import { coverageHook } from "./coverage";
import { safetyLineFor } from "./disclaimers";
import { anchorFor, CONVERSATION_M, formatDistance, formatInterval } from "./distance";
import { boundFractionAt, nominalFractionAt, nominalMaxM, profileAt, shareWord, type ShareWord } from "./profile";

export type Tone = "relief" | "visible";

export interface ConcernDescription {
  /** At most 60 characters. */
  headline: string;
  detail: string;
  tone: Tone;
  /**
   * The mark-safety line, present on dark-spot and breakout cards. `detail` already ends with it, so a card that renders
   * `detail` shows it; this field lets a layout style it apart (and drop it from `detail` if it does).
   */
  safety?: string;
}

/** Headlines must fit a card line; the copy test asserts it for every template. */
export const MAX_HEADLINE_CHARS = 60;

/** Up to this far (selfie distance plus a margin) a concern is only visible at the mirror or in a selfie. */
const MIRROR_BAND_MAX_M = 0.35;

/** A concern is a relief when it is gone by conversation distance, the same target the coverage search uses. */
export const RELIEF_MAX_M = CONVERSATION_M;

/** Across a table: where a many-feature concern is judged. */
export const TABLE_M = 1.5;

/** Across a room: a second look for many-feature concerns, and where a broad flush of redness counts as soft. */
export const ROOM_M = 4;

/** A many-feature concern is a relief when at most this share of it is detectable across a table. */
export const RELIEF_SHARE = 0.1;

/** Fewer targets than this and a share is not a useful summary: the single-distance wording is used. */
const MIN_PROFILE_TARGETS = 5;

type Group = "relief" | "visible" | "unmeasured";

const PERFECT_EYES = "Even perfect eyes";

/** "looking right at them in normal indoor light", with the pronoun that fits the concern. */
const conditions = (them: string) => `looking right at ${them} in normal indoor light`;

/**
 * Large soft areas. At 3 to 4 cm even a few percent of contrast is detectable from 10 m for an ideal observer, so a long
 * distance here says that the area is large, not that the shading is strong, and every face shares it. The universal fact
 * leads, with no distance and no grade (expert panel, 2026-10-21).
 */
export function isSoftArea(cv: ConcernVisibilityExt): boolean {
  if (cv.concern === "dark_circle" || cv.concern === "eye_bag") return true;
  return cv.concern === "redness" && nominalMaxM(cv) >= ROOM_M;
}

/** Many-feature concerns (not area regions) with a profile are summarised by shares, not by the farthest target. */
function usesProfile(cv: ConcernVisibilityExt): boolean {
  return cv.profile !== undefined && cv.targetCount >= MIN_PROFILE_TARGETS && CONCERNS[cv.concern].maskKind !== "region";
}

/** The share of the concern that can be seen across a table (bound); without a profile, all or nothing from the farthest target. */
function tableShare(cv: ConcernVisibilityExt): number {
  return cv.profile ? profileAt(cv.profile, TABLE_M).fraction : cv.maxDistanceM >= TABLE_M ? 1 : 0;
}

/** The group a concern falls in when judged from `distanceM`: relief when gone (or down to RELIEF_SHARE) by then. */
function groupAt(cv: ConcernVisibilityExt, distanceM: number): Group {
  if (!CONCERNS[cv.concern].visibility || cv.targetCount === 0) return "unmeasured";
  if (usesProfile(cv)) return profileAt(cv.profile!, distanceM).fraction <= RELIEF_SHARE + 1e-9 ? "relief" : "visible";
  return cv.maxDistanceM <= distanceM ? "relief" : "visible";
}

/** Single-distance concerns are judged at conversation distance, many-feature ones across a table. */
function groupOf(cv: ConcernVisibilityExt): Group {
  return groupAt(cv, usesProfile(cv) ? TABLE_M : RELIEF_MAX_M);
}

export function toneOf(cv: ConcernVisibilityExt): Tone {
  return groupOf(cv) === "visible" ? "visible" : "relief";
}

/** A soft area states no distance, so its rough-estimate note drops the range too. */
function roughEstimateNote(cv: ConcernVisibilityExt, withRange = true): string {
  if (cv.confidence !== "low") return "";
  const [lo, hi] = cv.intervalM;
  const wide = withRange && Number.isFinite(lo) && Number.isFinite(hi) && formatDistance(lo) !== formatDistance(hi);
  return wide ? `This one is a rough estimate: the range is about ${formatInterval(cv.intervalM)}.` : "This one is a rough estimate.";
}

/** The conservative end: a "no further than X" claim must hold across the measurement interval. */
function upperBoundM(cv: ConcernVisibilityExt): number {
  const hi = cv.intervalM[1];
  return Number.isFinite(hi) ? Math.max(cv.maxDistanceM, hi) : cv.maxDistanceM;
}

const join = (parts: string[]) => parts.filter(Boolean).join(" ");
const capitalise = (text: string) => text.charAt(0).toUpperCase() + text.slice(1);

/** "across a table" -> "from across a table"; the phrases that are not about a place stand alone. */
const fromPhrase = (phrase: string) => (phrase.startsWith("across") ? `from ${phrase}` : phrase);

/** The first candidate that fits a card line; the last one is the shortest and always fits. */
const fitHeadline = (...candidates: string[]) => candidates.find((c) => c.length <= MAX_HEADLINE_CHARS) ?? candidates[candidates.length - 1];

const BELOW_MOST: readonly ShareWord[] = ["none", "a few", "a small share", "some", "about a third", "about half"];

/** Shares that stand alone as a subject without "of": "Most pores are", "Nearly all pores are". */
const WITHOUT_OF: readonly ShareWord[] = ["most", "nearly all", "all"];

/**
 * "Most of your pores are out of sight from across a table", shortened step by step to fit a card line: first "from" goes
 * from the anchor, then "of your", and last the noun, so the shortest form is "Most are out of sight across a table."
 */
function shareHeadline(word: ShareWord, noun: string, verb: string, anchor: string): string {
  const subject = capitalise(word);
  const plain = anchor.replace(/^from /, "");
  const candidates = [`${subject} of your ${noun} ${verb} ${fromPhrase(anchor)}.`, `${subject} of your ${noun} ${verb} ${plain}.`];
  if (WITHOUT_OF.includes(word)) candidates.push(`${subject} ${noun} ${verb} ${plain}.`);
  candidates.push(`${subject} ${verb} ${plain}.`);
  return fitHeadline(...candidates);
}

function describeUnmeasured(cv: ConcernVisibilityExt): ConcernDescription {
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

/** Relief for a few features or a single area: the bound, so "even perfect eyes", with the conditions in the detail. */
function describeRelief(cv: ConcernVisibilityExt): ConcernDescription {
  const noun = concernNoun(cv.concern);
  const them = concernThem(cv.concern);
  const bound = formatDistance(upperBoundM(cv));
  const note = roughEstimateNote(cv);

  if (cv.maxDistanceM < MIN_DISTANCE_M) {
    return {
      headline: fitHeadline(
        `Even up close, perfect eyes couldn't pick out your ${noun}.`,
        `Even up close, perfect eyes couldn't pick out ${noun}.`,
        `Even up close, perfect eyes couldn't pick ${them} out.`,
      ),
      detail: join([
        `Even from ${formatDistance(MIN_DISTANCE_M)}, ${conditions(them)}, a person with perfect eyesight couldn't pick ${them} out.`,
        note,
      ]),
      tone: "relief",
    };
  }
  const headline = fitHeadline(
    `${PERFECT_EYES} couldn't pick out your ${noun} past ${bound}.`,
    `${PERFECT_EYES} couldn't pick out ${noun} past ${bound}.`,
    `Out of sight past ${bound}, even to perfect eyes.`,
  );
  if (cv.maxDistanceM <= MIRROR_BAND_MAX_M) {
    return {
      headline,
      detail: join([
        "That's about mirror and selfie distance, a view that's mostly yours.",
        `It holds for perfect eyes ${conditions(them)}.`,
        note,
      ]),
      tone: "relief",
    };
  }
  return {
    headline,
    detail: join([`${capitalise(conditions(them))}, even perfect eyes would need to be closer than ${bound}.`, note]),
    tone: "relief",
  };
}

/** Visible for a few features or a single area: the nominal observer. */
function describeVisible(cv: ConcernVisibilityExt): ConcernDescription {
  const noun = concernNoun(cv.concern);
  const them = concernThem(cv.concern);
  const nominal = nominalMaxM(cv);
  const capped = nominal >= MAX_DISTANCE_M;
  const from = capped ? "across a room or farther" : `about ${formatDistance(nominal)}`;
  const where = capped
    ? `That's across a room and beyond, for a typical sharp-eyed person looking right at ${them}.`
    : `That's ${anchorFor(nominal)}, for a typical sharp-eyed person looking right at ${them}.`;
  return {
    headline: fitHeadline(`Your ${noun} can be picked out from ${from}.`, `${capitalise(noun)} can be picked out from ${from}.`),
    detail: join([where, roughEstimateNote(cv), coverageHook(cv.concern)]),
    tone: "visible",
  };
}

/** A large soft area: no distance in the headline or the detail. The universal fact leads. */
function describeSoftArea(cv: ConcernVisibilityExt): ConcernDescription {
  const note = roughEstimateNote(cv, false);
  if (cv.concern === "redness") {
    return {
      headline: "Redness over a broad area carries far, on every face.",
      detail: join([
        "Colour changes over a broad area carry farther than small marks, on every skin tone.",
        "That says how wide the area is, not how much there is.",
        note,
      ]),
      tone: "visible",
    };
  }
  const plural = CONCERN_COPY[cv.concern].agreement === "plural";
  const noun = capitalise(concernNoun(cv.concern));
  return {
    headline: `${noun} ${plural ? "carry" : "carries"} far, on every face.`,
    detail: join([
      `${noun} ${plural ? "are" : "is"} a large, soft area; on everyone, ${plural ? "they're" : "it's"} among the last things to fade with distance.`,
      "That says how big the area is, not how much there is.",
      note,
    ]),
    tone: "visible",
  };
}

/** The out-of-sight share in words at a distance: nominal, and "all" only when even perfect eyes couldn't pick out any. */
function outOfSightWord(cv: ConcernVisibilityExt, distanceM: number): ShareWord {
  const word = shareWord(1 - nominalFractionAt(cv, distanceM));
  return word === "all" && boundFractionAt(cv, distanceM) > 1e-9 ? "nearly all" : word;
}

/** "Closer, at 1 m, perfect eyes could pick out about half of them.", only when conversation distance changes the picture. */
function closer(cv: ConcernVisibilityExt, atTable: number): string {
  const word = shareWord(boundFractionAt(cv, CONVERSATION_M));
  if (word === "none" || word === shareWord(atTable)) return "";
  return `Closer, at ${formatDistance(CONVERSATION_M)}, perfect eyes could pick out ${word} of them.`;
}

/**
 * Many-feature concerns, relief: at most RELIEF_SHARE of them can be picked out across a table even by perfect eyes. The
 * headline says how much is out of sight (nominal); the detail gives the bound.
 */
function describeProfileRelief(cv: ConcernVisibilityExt): ConcernDescription {
  const noun = concernNoun(cv.concern);
  const them = concernThem(cv.concern);
  const table = anchorFor(TABLE_M);
  const note = roughEstimateNote(cv);
  const atTable = boundFractionAt(cv, TABLE_M);

  if (atTable <= 1e-9) {
    return {
      headline: fitHeadline(
        `${PERFECT_EYES} couldn't pick out your ${noun} ${fromPhrase(table)}.`,
        `${PERFECT_EYES} couldn't pick out ${noun} ${fromPhrase(table)}.`,
        `${PERFECT_EYES} couldn't pick out ${noun} ${table}.`,
        `Out of sight ${table}, even to perfect eyes.`,
      ),
      detail: join([
        `${capitalise(conditions(them))}, even perfect eyes couldn't pick out any of your ${noun} ${fromPhrase(table)}.`,
        closer(cv, 0),
        note,
      ]),
      tone: "relief",
    };
  }
  // At most RELIEF_SHARE is picked out even by perfect eyes, so "most" is the floor whatever the nominal numbers say.
  const word = outOfSightWord(cv, TABLE_M);
  return {
    headline: shareHeadline(BELOW_MOST.includes(word) ? "most" : word, noun, "are out of sight", table),
    detail: join([
      `${capitalise(conditions(them))}, even perfect eyes could pick out only ${shareWord(atTable)} of your ${noun} ${fromPhrase(table)}.`,
      closer(cv, atTable),
      note,
    ]),
    tone: "relief",
  };
}

/**
 * Many-feature concerns, visible: the nominal share across a table in words, then a second look from across a room. The
 * bound shows up only to say what sharper eyes could add.
 */
function describeProfileVisible(cv: ConcernVisibilityExt): ConcernDescription {
  const noun = concernNoun(cv.concern);
  const them = concernThem(cv.concern);
  const table = anchorFor(TABLE_M);
  const room = anchorFor(ROOM_M);
  const word = shareWord(nominalFractionAt(cv, TABLE_M));
  const roomWord = shareWord(nominalFractionAt(cv, ROOM_M));
  const note = roughEstimateNote(cv);
  const hook = coverageHook(cv.concern);

  if (word === "none") {
    const sharper = shareWord(boundFractionAt(cv, TABLE_M));
    return {
      headline: fitHeadline(`Hardly any of your ${noun} can be seen ${table}.`, `Hardly any ${noun} can be seen ${table}.`),
      detail: join([
        `A typical sharp-eyed person looking right at ${them} wouldn't pick out your ${noun} ${fromPhrase(table)}.`,
        `Sharper eyes could pick out ${sharper} of ${them}.`,
        note,
        hook,
      ]),
      tone: "visible",
    };
  }
  return {
    headline: shareHeadline(word, noun, "can be seen", table),
    detail: join([
      `A typical sharp-eyed person looking right at ${them} could pick out ${word} of your ${noun} ${fromPhrase(table)}.`,
      roomWord !== "none" && roomWord !== word ? `${capitalise(fromPhrase(room))}, ${roomWord} could still be picked out.` : "",
      note,
      hook,
    ]),
    tone: "visible",
  };
}

export interface DescribeContext {
  /** @deprecated No longer shown: the N/100 rating is a grade, and "higher is healthier" is health language. Ignored. */
  youcamScore?: number;
}

/** @deprecated Deleted from the cards (expert panel, 2026-10-21): a grade plus health language. Returns an empty string. */
export function youcamScoreLine(score: number): string {
  void score;
  return "";
}

/** The whole-face rating of a concern in a SkinAnalysis, if the analysis has one. Not for display on cards. */
export function youcamScoreOf(results: readonly ConcernResult[], concern: ConcernId): number | undefined {
  const found = results.find((r) => r.concern === concern && r.region === "whole") ?? results.find((r) => r.concern === concern);
  return found && Number.isFinite(found.uiScore) ? found.uiScore : undefined;
}

function withSafety(description: ConcernDescription, concern: ConcernId): ConcernDescription {
  const safety = safetyLineFor(concern);
  return safety ? { ...description, detail: join([description.detail, safety]), safety } : description;
}

export function describeConcern(cv: ConcernVisibilityExt, context: DescribeContext = {}): ConcernDescription {
  void context;
  switch (groupOf(cv)) {
    case "unmeasured":
      return describeUnmeasured(cv);
    case "relief":
      return withSafety(usesProfile(cv) ? describeProfileRelief(cv) : describeRelief(cv), cv.concern);
    case "visible":
      return withSafety(isSoftArea(cv) ? describeSoftArea(cv) : usesProfile(cv) ? describeProfileVisible(cv) : describeVisible(cv), cv.concern);
  }
}

/** Whether the slider counter speaks in shares: several features of a countable concern. */
function countsAsShare(cv: ConcernVisibilityExt): boolean {
  return cv.targetCount >= 2 && CONCERN_COPY[cv.concern].agreement === "plural" && CONCERNS[cv.concern].maskKind !== "region";
}

/**
 * The share of the concern a typical sharp-eyed person could not pick out from `distanceM`, 0 to 1, for a bar next to the
 * Step-back slider. Read from the nominal profile on a log distance axis (estimated from the bound when a report has no
 * nominal numbers); beyond the last profile distance it holds the last value, a lower bound. Concerns with nothing measured
 * give 0: check `targetCount` and show `stepBackCounter`'s sentence instead of a bar.
 */
export function stepBackShare(cv: ConcernVisibilityExt, distanceM: number): number {
  if (!CONCERNS[cv.concern].visibility || cv.targetCount === 0) return 0;
  return Math.min(1, Math.max(0, 1 - nominalFractionAt(cv, distanceM)));
}

/**
 * The live counter for the Step-back slider, framed as what drops out of sight, in words:
 * "Most of your pores are out of sight from here". "All" only when even perfect eyes couldn't pick out any. Concerns that
 * are one area, or a single mark, get a yes/no line: a typical eye decides "can still be picked out", the bound "out of sight".
 */
export function stepBackCounter(cv: ConcernVisibilityExt, distanceM: number): string {
  if (!CONCERNS[cv.concern].visibility || cv.targetCount === 0) return describeUnmeasured(cv).headline;
  if (countsAsShare(cv)) {
    const noun = concernName(cv.concern, "plural");
    const word = outOfSightWord(cv, distanceM);
    return word === "none" ? `None of your ${noun} are out of sight yet` : `${capitalise(word)} of your ${noun} are out of sight from here`;
  }
  const one = cv.targetCount === 1;
  const noun = concernName(cv.concern, one ? "singular" : "plural");
  const be = one ? "is" : concernBe(cv.concern);
  if (nominalFractionAt(cv, distanceM) > 1e-9) return `Your ${noun} can still be picked out from here`;
  return boundFractionAt(cv, distanceM) > 1e-9
    ? `Your ${noun} ${be} most likely out of sight from here`
    : `Your ${noun} ${be} out of sight from here`;
}

const CONCERN_ORDER = Object.keys(CONCERNS) as ConcernId[];

function byGroupThenDistance(a: ConcernVisibilityExt, b: ConcernVisibilityExt): number {
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
 * first: the top card is the one "The lightest touch" helps most (matching `topTargets`, most
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

/**
 * One sentence for the share card, relief first, e.g. "From a metre away, your pores are mostly out of sight, while your
 * redness can still be picked out." A low-confidence concern gets "probably" and "may".
 */
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
    return `${vantage(shown)} your ${listNames(names, "and")} are ${unsure ? "probably" : "mostly"} out of sight.`;
  }

  const featured = visible.slice(0, 2);
  const names = featured.map((c) => concernNoun(c.concern));
  const seen = `your ${listNames(names, "and")}`;
  if (relief.length === 0) {
    const unsure = featured.some((c) => c.confidence === "low");
    return `${vantage(featured)} a typical sharp-eyed person ${unsure ? "may be able to" : "could"} pick out ${seen}.`;
  }

  // Name the relief we trust most: the nearest-vanishing one that isn't a rough estimate.
  const unseen = relief.find((c) => c.confidence !== "low") ?? relief[0];
  const unsureSeen = featured.some((c) => c.confidence === "low");
  const outOfSight = `your ${concernNoun(unseen.concern)} ${concernBe(unseen.concern)} ${unseen.confidence === "low" ? "probably" : "mostly"} out of sight`;
  return `${vantage([...featured, unseen])} ${outOfSight}, while ${seen} ${unsureSeen ? "may" : "can"} still be picked out.`;
}
