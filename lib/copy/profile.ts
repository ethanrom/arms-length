/**
 * Reading a ConcernVisibility.profile (share of targets still detectable at fixed distances) on a log distance axis.
 * Pure and deterministic. Distances in metres. The profile is a bound (see lib/contracts/vision.ts), so everything
 * built from it is an "at most".
 */
import { MIN_DISTANCE_M, type ConcernVisibility } from "@/lib/contracts/vision";

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

/**
 * A share in everyday words for "<share> of your pores show ...". Each word is true for its whole range, and every
 * entry is at most 15 characters so that the headline templates fit MAX_HEADLINE_CHARS.
 */
const SHARE_WORDS: readonly (readonly [min: number, text: string])[] = [
  [0.9, "Nearly all"],
  [0.7, "Most"],
  [0.55, "More than half"],
  [0.42, "About half"],
  [0.29, "About a third"],
  [0.22, "About a quarter"],
  [0.15, "About a fifth"],
  [0, "About a tenth"],
];

export function shareWords(fraction: number): string {
  return (SHARE_WORDS.find(([min]) => fraction >= min) ?? SHARE_WORDS[SHARE_WORDS.length - 1])[1];
}
