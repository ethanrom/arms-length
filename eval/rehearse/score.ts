/**
 * Scoring: one concern at one moment, judged against our model. Pure functions, no I/O, no network.
 *
 * Truth is the model's own typical share (average observer, no safety margin) at the scene, light and viewer the system chose.
 * A concern is "noticeable" when that share is above the threshold (default FREE_FIX_GOAL, 10%, the lightest touch the
 * app aims for). Large soft areas have a share of 0 or 1 in the model, so "in sight" is a share of 1.
 */
import type { ConcernId } from "../../lib/contracts/concerns";
import type { ConcernAtScene } from "../../lib/contracts/rehearse";
import { FREE_FIX_GOAL } from "../../lib/rehearse/fix";

export const TRUTH_THRESHOLD = FREE_FIX_GOAL;
export type Advice = "cover" | "nothing";

export interface Truth {
  concern: ConcernId;
  soft: boolean;
  share: number;
  noticeable: boolean;
}

/** Concerns with no targets on the face are left out: there is nothing to judge. */
export function truthOf(concerns: readonly ConcernAtScene[], threshold: number = TRUTH_THRESHOLD): Truth[] {
  return concerns
    .filter((c) => c.targetCount > 0)
    .map((c) => ({ concern: c.concern, soft: c.soft, share: c.typicalShare, noticeable: c.typicalShare > threshold }));
}

/** What one system said about one concern at one moment. `null` fields: it took no stand. */
export interface Stand {
  noticeable: boolean | null;
  share: number | null;
  advice: Advice | null;
  /** The system said the mark is not on this face (counted as "not noticeable, nothing to do"). */
  absent?: boolean;
}

export interface Judgment {
  concern: ConcernId;
  soft: boolean;
  truthShare: number;
  truthNoticeable: boolean;
  said: boolean | null;
  advice: Advice | null;
  shareSaid: number | null;
  /** The system said the mark is not on this face. */
  absent: boolean;
  /** Said noticeable and truth says not, or the reverse. null when it took no stand. */
  contradiction: boolean | null;
  /** Said "not noticeable" where it is. */
  miss: boolean;
  /** Said "noticeable" where it is not. */
  falseAlarm: boolean;
  /** A false alarm where the truth share is above 0 but not above the threshold: a true statement ("a few can be picked out") that the 10% line calls out of sight. */
  edge: boolean;
  /** "cover" advised where the model says out of sight. */
  overCover: boolean;
  /** "nothing" advised where it is noticeable. */
  underWarn: boolean;
  /** |share said - truth share|; null without a share. */
  shareError: number | null;
}

const clamp01 = (x: number): number => Math.min(1, Math.max(0, x));

export function judge(truth: Truth, stand: Stand): Judgment {
  const said = stand.noticeable;
  const advice = stand.advice;
  const shareSaid = stand.share === null ? null : clamp01(stand.share);
  const miss = said === false && truth.noticeable;
  const falseAlarm = said === true && !truth.noticeable;
  return {
    concern: truth.concern,
    soft: truth.soft,
    truthShare: truth.share,
    truthNoticeable: truth.noticeable,
    said,
    advice,
    shareSaid,
    absent: stand.absent === true,
    contradiction: said === null ? null : said !== truth.noticeable,
    miss,
    falseAlarm,
    edge: falseAlarm && truth.share > 0,
    overCover: advice === "cover" && !truth.noticeable,
    underWarn: advice === "nothing" && truth.noticeable,
    shareError: shareSaid === null ? null : Math.abs(shareSaid - truth.share),
  };
}

/** Judges every concern the truth has; a concern the system did not mention gets no stand. */
export function judgeMoment(truth: readonly Truth[], stands: Partial<Record<ConcernId, Stand>>): Judgment[] {
  return truth.map((t) => judge(t, stands[t.concern] ?? { noticeable: null, share: null, advice: null }));
}

export interface Tally {
  /** Concern-moments in the denominator of the claim rates: the system took a stand on noticeable. */
  claims: number;
  noticeable: number;
  outOfSight: number;
  contradictions: number;
  misses: number;
  falseAlarms: number;
  edges: number;
  /** Concern-moments with a stand on advice. */
  advised: number;
  covers: number;
  /** Advice stands on concerns the truth calls out of sight / noticeable. */
  advisedOutOfSight: number;
  advisedNoticeable: number;
  overCovers: number;
  underWarns: number;
  shareN: number;
  shareAbsErrSum: number;
  /** The same, soft areas left out (their share is 0 or 1 in the model, so one word hits or misses it). */
  shareNHard: number;
  shareAbsErrSumHard: number;
}

export const emptyTally = (): Tally => ({
  claims: 0, noticeable: 0, outOfSight: 0, contradictions: 0, misses: 0, falseAlarms: 0, edges: 0,
  advised: 0, covers: 0, advisedOutOfSight: 0, advisedNoticeable: 0, overCovers: 0, underWarns: 0,
  shareN: 0, shareAbsErrSum: 0, shareNHard: 0, shareAbsErrSumHard: 0,
});

export function tally(js: readonly Judgment[]): Tally {
  const t = emptyTally();
  for (const j of js) {
    if (j.said !== null) {
      t.claims++;
      if (j.truthNoticeable) t.noticeable++;
      else t.outOfSight++;
      if (j.contradiction) t.contradictions++;
      if (j.miss) t.misses++;
      if (j.falseAlarm) t.falseAlarms++;
      if (j.edge) t.edges++;
    }
    if (j.advice !== null) {
      t.advised++;
      if (j.advice === "cover") t.covers++;
      if (j.truthNoticeable) t.advisedNoticeable++;
      else t.advisedOutOfSight++;
      if (j.overCover) t.overCovers++;
      if (j.underWarn) t.underWarns++;
    }
    if (j.shareError !== null) {
      t.shareN++;
      t.shareAbsErrSum += j.shareError;
      if (!j.soft) {
        t.shareNHard++;
        t.shareAbsErrSumHard += j.shareError;
      }
    }
  }
  return t;
}

export const sumTallies = (ts: readonly Tally[]): Tally => {
  const out = emptyTally();
  for (const t of ts) for (const k of Object.keys(out) as (keyof Tally)[]) out[k] += t[k];
  return out;
};

const ratio = (a: number, b: number): number | null => (b > 0 ? a / b : null);

export interface Rates {
  /** Disagreements on noticeable, over the concern-moments the system took a stand on. */
  contradiction: number | null;
  /** Said "not noticeable" among the concern-moments that are noticeable. */
  miss: number | null;
  /** Said "noticeable" among those that are not. */
  falseAlarm: number | null;
  /** Headline: "cover" advised among the advised concern-moments the model says are out of sight. */
  overCover: number | null;
  /** The same count over every advised concern-moment. */
  overCoverOfAll: number | null;
  /** "nothing" advised among the advised concern-moments that are noticeable. */
  underWarning: number | null;
  meanAbsShareError: number | null;
  meanAbsShareErrorHard: number | null;
  /** Share of advised concern-moments that are "cover". */
  coverRate: number | null;
}

export function rates(t: Tally): Rates {
  return {
    contradiction: ratio(t.contradictions, t.claims),
    miss: ratio(t.misses, t.noticeable),
    falseAlarm: ratio(t.falseAlarms, t.outOfSight),
    overCover: ratio(t.overCovers, t.advisedOutOfSight),
    overCoverOfAll: ratio(t.overCovers, t.advised),
    underWarning: ratio(t.underWarns, t.advisedNoticeable),
    meanAbsShareError: ratio(t.shareAbsErrSum, t.shareN),
    meanAbsShareErrorHard: ratio(t.shareAbsErrSumHard, t.shareNHard),
    coverRate: ratio(t.covers, t.advised),
  };
}

// ---------------------------------------------------------------------------------------------------------------
// Run-to-run consistency of the unaided model: two replies to the same question.
// ---------------------------------------------------------------------------------------------------------------

export interface MomentChoice {
  scene: string;
  light: string;
  viewer: string;
  stands: Partial<Record<ConcernId, Stand>>;
}

export interface Consistency {
  pairs: number;
  sameMomentCount: number;
  /** Moments compared by position (both replies have that position). */
  alignedMoments: number;
  /** ... of which the two replies chose the same scene, light and viewer. */
  sameChoice: number;
  /** Concern-moments compared on noticeable, among aligned moments with the same choice, and how many differ. */
  comparedSame: number;
  disagreeSame: number;
  /** The same over every aligned moment, whatever the choice. */
  comparedAll: number;
  disagreeAll: number;
  adviceComparedSame: number;
  adviceDisagreeSame: number;
  /** Share estimates compared at the same choice, and the sum of their absolute differences. */
  shareComparedSame: number;
  shareAbsDiffSame: number;
}

export const emptyConsistency = (): Consistency => ({
  pairs: 0, sameMomentCount: 0, alignedMoments: 0, sameChoice: 0, comparedSame: 0, disagreeSame: 0, comparedAll: 0, disagreeAll: 0, adviceComparedSame: 0, adviceDisagreeSame: 0, shareComparedSame: 0, shareAbsDiffSame: 0,
});

/** Compares two replies moment by position. Only the concerns in `concerns` (those the face has) count. */
export function consistency(a: readonly MomentChoice[], b: readonly MomentChoice[], concerns: readonly ConcernId[]): Consistency {
  const out = emptyConsistency();
  out.pairs = 1;
  if (a.length === b.length) out.sameMomentCount = 1;
  const n = Math.min(a.length, b.length);
  for (let i = 0; i < n; i++) {
    const [x, y] = [a[i], b[i]];
    out.alignedMoments++;
    const same = x.scene === y.scene && x.light === y.light && x.viewer === y.viewer;
    if (same) out.sameChoice++;
    for (const c of concerns) {
      const [p, q] = [x.stands[c], y.stands[c]];
      if (p?.noticeable == null || q?.noticeable == null) continue;
      out.comparedAll++;
      if (p.noticeable !== q.noticeable) out.disagreeAll++;
      if (same) {
        out.comparedSame++;
        if (p.noticeable !== q.noticeable) out.disagreeSame++;
        if (p.share != null && q.share != null) {
          out.shareComparedSame++;
          out.shareAbsDiffSame += Math.abs(p.share - q.share);
        }
        if (p.advice && q.advice) {
          out.adviceComparedSame++;
          if (p.advice !== q.advice) out.adviceDisagreeSame++;
        }
      }
    }
  }
  return out;
}

export const sumConsistency = (cs: readonly Consistency[]): Consistency => {
  const out = emptyConsistency();
  for (const c of cs) for (const k of Object.keys(out) as (keyof Consistency)[]) out[k] += c[k];
  return out;
};

// ---------------------------------------------------------------------------------------------------------------
// What the plan says about each concern (the agent writes sentences, not flags).
// ---------------------------------------------------------------------------------------------------------------

/** The product's names for the concerns (lib/copy/concerns.ts), as the agent is told to use them. */
const NAMES: Partial<Record<ConcernId, RegExp>> = {
  pore: /\bpores?\b/i,
  age_spot: /\bdark spots?\b/i,
  acne: /\bbreakouts?\b/i,
  wrinkle: /\bfine lines?\b/i,
  dark_circle: /\bunder-eye shadows?\b/i,
  eye_bag: /\bpuffiness\b/i,
  redness: /\bredness\b/i,
};

export type PlanVerdict = "noticeable" | "outOfSight" | "both";

/**
 * Which concerns a moment's `notice` and `outOfSight` sentences name. A concern named in notice only is "noticeable", in
 * outOfSight only "outOfSight", in both "both" (the plan splits it by part, or contradicts itself); not named: absent from the map.
 */
export function planVerdicts(notice: readonly string[], outOfSight: readonly string[]): Map<ConcernId, PlanVerdict> {
  const out = new Map<ConcernId, PlanVerdict>();
  for (const id of Object.keys(NAMES) as ConcernId[]) {
    const name = NAMES[id]!;
    const inNotice = notice.some((t) => name.test(t));
    const inOut = outOfSight.some((t) => name.test(t));
    if (inNotice && inOut) out.set(id, "both");
    else if (inNotice) out.set(id, "noticeable");
    else if (inOut) out.set(id, "outOfSight");
  }
  return out;
}

/** Pearson correlation; null for fewer than 3 pairs or no spread in either variable. */
export function pearson(xs: readonly number[], ys: readonly number[]): number | null {
  const n = Math.min(xs.length, ys.length);
  if (n < 3) return null;
  const mx = xs.reduce((a, b) => a + b, 0) / n;
  const my = ys.reduce((a, b) => a + b, 0) / n;
  let sxy = 0;
  let sxx = 0;
  let syy = 0;
  for (let i = 0; i < n; i++) {
    sxy += (xs[i] - mx) * (ys[i] - my);
    sxx += (xs[i] - mx) ** 2;
    syy += (ys[i] - my) ** 2;
  }
  return sxx > 0 && syy > 0 ? sxy / Math.sqrt(sxx * syy) : null;
}

// ---------------------------------------------------------------------------------------------------------------
// Uncertainty: a bootstrap that resamples whole (face, day) pairs, because concern-moments inside one run are not independent.
// ---------------------------------------------------------------------------------------------------------------

/** mulberry32: a small seeded generator, so the intervals are the same on every rebuild. */
export function seeded(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Percentile interval (default 95%) of `stat` over resamples of the clusters. Resamples where the statistic is undefined are skipped. */
export function clusterBootstrap<T>(
  clusters: readonly T[],
  stat: (sample: readonly T[]) => number | null,
  options: { reps?: number; seed?: number; level?: number } = {},
): [number, number] | null {
  const { reps = 2000, seed = 1, level = 0.95 } = options;
  if (clusters.length === 0) return null;
  const rand = seeded(seed);
  const values: number[] = [];
  for (let r = 0; r < reps; r++) {
    const sample = Array.from({ length: clusters.length }, () => clusters[Math.floor(rand() * clusters.length)]);
    const v = stat(sample);
    if (v !== null && Number.isFinite(v)) values.push(v);
  }
  if (values.length < reps / 2) return null;
  values.sort((p, q) => p - q);
  const at = (p: number) => values[Math.min(values.length - 1, Math.max(0, Math.round(p * (values.length - 1))))];
  return [at((1 - level) / 2), at(1 - (1 - level) / 2)];
}
