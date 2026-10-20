/**
 * Reading a ConcernVisibility.profile (share of targets still detectable at fixed distances) on a log distance axis.
 * Pure and deterministic. Distances in metres. The profile is a bound (see lib/contracts/vision.ts), so everything
 * built from it is an "at most".
 */
import { MIN_DISTANCE_M, type ConcernVisibility } from "@/lib/contracts/vision";
import type { NominalFields } from "@/lib/vision/report";

export type Profile = NonNullable<ConcernVisibility["profile"]>;

export interface ProfilePoint {
  /** Interpolated, so not necessarily a whole number. */
  count: number;
  fraction: number;
}

/**
 * Count and share at any distance, linear in log distance between profile points. Outside the profile's range the
 * nearest point is used: closer than the first point that is a lower bound on the count, beyond the last it is an upper bound.
 */
export function profileAt(profile: Profile, distanceM: number): ProfilePoint {
  const first = profile[0];
  const last = profile[profile.length - 1];
  if (distanceM <= first.distanceM) return { count: first.count, fraction: first.fraction };
  if (distanceM >= last.distanceM) return { count: last.count, fraction: last.fraction };
  let i = 0;
  while (profile[i + 1].distanceM <= distanceM) i++;
  const a = profile[i];
  const b = profile[i + 1];
  const t = (Math.log(distanceM) - Math.log(a.distanceM)) / (Math.log(b.distanceM) - Math.log(a.distanceM));
  return { count: a.count + t * (b.count - a.count), fraction: a.fraction + t * (b.fraction - a.fraction) };
}

/**
 * The farthest distance at which at least `share` of the targets are still detectable (log interpolation between
 * profile points; the last profile distance if the share holds to the end; the minimum distance if it never holds).
 */
export function reachM(profile: Profile, share: number): number {
  let i = -1;
  for (let k = 0; k < profile.length; k++) if (profile[k].fraction >= share - 1e-9) i = k;
  if (i < 0) return MIN_DISTANCE_M;
  if (i === profile.length - 1) return profile[i].distanceM;
  const a = profile[i];
  const b = profile[i + 1];
  const t = (a.fraction - share) / (a.fraction - b.fraction);
  return Math.exp(Math.log(a.distanceM) + Math.max(0, t) * (Math.log(b.distanceM) - Math.log(a.distanceM)));
}

/** Report fields the nominal helpers read. `ConcernVisibility` from before nominal distances existed is accepted as is. */
export type Observed = ConcernVisibility & NominalFields;

/**
 * Bound distance over nominal distance at the default 6 dB margin, used only to estimate nominal numbers for a report that
 * carries none. docs/MODEL.md section 6: a 3 mm disc at 12% contrast is 3.2 m nominal and 4.8 m bound.
 */
export const BOUND_TO_NOMINAL_RATIO = 1.5;

/** The farthest any one target stays detectable for the average observer. */
export function nominalMaxM(cv: Observed): number {
  return cv.nominalMaxDistanceM ?? cv.maxDistanceM / BOUND_TO_NOMINAL_RATIO;
}

/** Share of targets a typical sharp-eyed observer could pick out at `distanceM` (nominal; estimated from the bound if absent). */
export function nominalFractionAt(cv: Observed, distanceM: number): number {
  if (cv.nominalProfile) return profileAt(cv.nominalProfile, distanceM).fraction;
  if (cv.profile) return profileAt(cv.profile, distanceM * BOUND_TO_NOMINAL_RATIO).fraction;
  return cv.targetCount > 0 && nominalMaxM(cv) >= distanceM ? 1 : 0;
}

/** Count version of `nominalFractionAt`, whole targets. */
export function nominalCountAt(cv: Observed, distanceM: number): number {
  if (cv.nominalProfile) return Math.round(profileAt(cv.nominalProfile, distanceM).count);
  return Math.round(nominalFractionAt(cv, distanceM) * cv.targetCount);
}

/** Share of targets even perfect eyes (the bound) could pick out at `distanceM`. */
export function boundFractionAt(cv: Observed, distanceM: number): number {
  if (cv.profile) return profileAt(cv.profile, distanceM).fraction;
  return cv.targetCount > 0 && cv.maxDistanceM >= distanceM ? 1 : 0;
}

export function boundCountAt(cv: Observed, distanceM: number): number {
  if (cv.profile) return Math.round(profileAt(cv.profile, distanceM).count);
  return Math.round(boundFractionAt(cv, distanceM) * cv.targetCount);
}

export type ShareWord = "none" | "a few" | "a small share" | "some" | "about a third" | "about half" | "most" | "nearly all" | "all";

/**
 * A share in words, for headlines: no digits on a main surface. Bands are ours (plain-language buckets, not a measured
 * scale); "all" only at exactly 1, so a rounded 99.8% still reads "nearly all".
 */
export function shareWord(share: number): ShareWord {
  if (!(share > 1e-9)) return "none";
  if (share >= 1 - 1e-9) return "all";
  if (share <= 0.04) return "a few";
  if (share <= 0.12) return "a small share";
  if (share <= 0.3) return "some";
  if (share <= 0.42) return "about a third";
  if (share <= 0.58) return "about half";
  if (share <= 0.92) return "most";
  return "nearly all";
}
