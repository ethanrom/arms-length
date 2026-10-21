import type { ConcernId } from "@/lib/contracts";

/**
 * The mark each kind starts on in the "Follow one mark" widget. Chosen from the recorded face p2b so that, indoors, a typical
 * sharp-eyed person stops picking it out near 2 m and even perfect eyes near 3 m: the verdict then flips inside the slider's
 * range. A unit test checks the reaches, so a rebuilt bundle cannot silently leave the widget on a flat line.
 */
export const DEFAULT_MARK: Partial<Record<ConcernId, string>> = {
  age_spot: "age_spot:79",
  pore: "pore:231",
  wrinkle: "wrinkle:133",
  acne: "acne:13",
};

/** Where the widget starts, metres: between the two observers' reaches for the default marks. */
export const DEFAULT_DISTANCE_M = 2.5;
