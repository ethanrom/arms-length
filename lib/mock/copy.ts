/**
 * Stand-in sentence templates (lib/copy replaces this at integration). Kind, relief first, factual:
 * distances not grades, no medical or shaming words.
 */
import type { ConcernId, ConcernVisibility, Measurements } from "@/lib/contracts";
import type { ConcernCopy, OutOfScopeNote, ShareLine } from "@/components/results/types";
import { countAt, formatDistance } from "@/app/_lib/axis";

interface Words {
  title: string;
  /** Possessive noun phrase: "your pores". */
  noun: string;
  fadeLabel: string;
  unit: string;
  flavour: string;
}

const WORDS: Record<ConcernId, Words> = {
  pore: {
    title: "Pores",
    noun: "pores",
    fadeLabel: "pores fade here",
    unit: "pores",
    flavour: "Pores are tiny and close to your skin tone, so they blend in as soon as someone steps back.",
  },
  wrinkle: {
    title: "Fine lines",
    noun: "fine lines",
    fadeLabel: "fine lines fade here",
    unit: "lines",
    flavour: "Fine lines are thin, and thin things are the first to disappear with distance.",
  },
  acne: {
    title: "Acne marks",
    noun: "acne marks",
    fadeLabel: "acne marks fade here",
    unit: "marks",
    flavour: "Small, slightly redder spots. Red-green contrast helps them, so they carry a little further than their size suggests.",
  },
  age_spot: {
    title: "Age spots",
    noun: "age spots",
    fadeLabel: "age spots fade here",
    unit: "spots",
    flavour: "Darker patches a few millimetres wide hold their contrast, so they stay readable at a conversational distance.",
  },
  dark_circle: {
    title: "Dark circles",
    noun: "under-eye shadows",
    fadeLabel: "under-eye shadows fade here",
    unit: "areas",
    flavour: "Large, soft areas survive blur well, which is why shadows under the eyes are among the last things to fade.",
  },
  eye_bag: {
    title: "Eye bags",
    noun: "eye bags",
    fadeLabel: "eye bags fade here",
    unit: "areas",
    flavour: "A gentle change in shading rather than a mark. It reads as soft form, mostly in raking light.",
  },
  redness: {
    title: "Redness",
    noun: "redness",
    fadeLabel: "redness fades here",
    unit: "areas",
    flavour: "Colour differences in broad areas stay visible farther than fine detail, so redness is read from across a room.",
  },
  texture: {
    title: "Texture",
    noun: "texture",
    fadeLabel: "texture fades here",
    unit: "areas",
    flavour: "",
  },
};

function phrase(distanceM: number): string {
  if (distanceM <= 0.5) return "about mirror distance";
  if (distanceM <= 1.1) return "about conversation distance";
  if (distanceM <= 2) return "about across a table";
  if (distanceM <= 5) return "across a room";
  return "across a large room";
}

/** The distance that orders a concern: where half its marks fade, or the single mark's distance. */
const keyDistance = (v: ConcernVisibility) => (v.profile ? v.medianDistanceM : v.maxDistanceM);

/** Mock sentences for one concern. `reliefWithinM` splits relief from visible, as in the UI. */
export function mockConcernCopy(
  v: ConcernVisibility,
  measurements: Measurements,
  reliefWithinM: number,
  confidenceReason: string,
): ConcernCopy {
  const w = WORDS[v.concern];
  const key = keyDistance(v);
  const relief = key <= reliefWithinM;
  const max = formatDistance(v.maxDistanceM);
  const median = formatDistance(v.medianDistanceM);
  const [lo, hi] = v.intervalM;
  const oneUnit = w.unit.replace(/s$/, "");

  let headline: string;
  let detail: string;
  let explainer: string;

  if (v.profile) {
    const at = (d: number) => countAt(v.profile!, v.targetCount, d);
    headline = relief ? `Most of your ${w.noun} are out of sight by ${median}.` : `Half of your ${w.noun} are still in view at ${median}.`;
    detail = `At ${formatDistance(1)}, ${at(1)} of ${v.targetCount} could be picked out; from across a table, ${at(1.5)}. The single most visible one carries to ${max}.`;
    explainer = [
      `The curve counts how many of your ${v.targetCount} ${w.unit} someone with perfect eyesight, looking straight at each one, could just pick out at each distance.`,
      `Beyond the line, nobody can. Real viewers glance, squint less and notice less, so the true numbers are lower.`,
      w.flavour,
    ]
      .filter(Boolean)
      .join(" ");
  } else {
    headline = relief ? `Nobody sees your ${w.noun} past ${max}.` : `Your ${w.noun} can be seen from up to ${max}.`;
    detail =
      v.targetCount > 1
        ? relief
          ? `Most are gone by ${median}. The most visible one fades at ${max}.`
          : `Most fade beyond ${median}; the most visible stays in view to ${max}, ${phrase(v.maxDistanceM)}.`
        : relief
          ? `It fades at ${max}.`
          : `It stays in view to ${max}, ${phrase(v.maxDistanceM)}.`;
    explainer = [
      `${max} is the farthest distance at which someone with perfect eyesight, looking straight at the most visible ${oneUnit}, could just pick it out.`,
      `Beyond it, nobody can. Real viewers glance, squint less and notice less, so the true distance is usually shorter.`,
      w.flavour,
    ]
      .filter(Boolean)
      .join(" ");
  }

  const sizeNote = measurements.scale.source === "iris" ? "Scale comes from the width of your iris (about 4% uncertainty)." : "";
  const confidence = `${v.confidence[0].toUpperCase()}${v.confidence.slice(1)} confidence. ${confidenceReason} ${sizeNote} Plausible range for the most visible one: ${formatDistance(lo)} to ${formatDistance(hi)}.`;

  return { concern: v.concern, title: w.title, fadeLabel: w.fadeLabel, headline, detail, explainer, confidence };
}

export function mockShareLine(v: ConcernVisibility, reliefWithinM: number): ShareLine {
  const w = WORDS[v.concern];
  const key = keyDistance(v);
  const relief = key <= reliefWithinM;
  const d = formatDistance(key);
  const sentence = v.profile
    ? relief
      ? `mostly out of sight by ${d}`
      : `half still in view at ${d}`
    : relief
      ? `out of sight beyond ${d}`
      : `visible from up to ${d}`;
  return { concern: v.concern, label: w.title, sentence, distanceM: key, tone: relief ? "relief" : "visible" };
}

export function mockTitle(concern: ConcernId): string {
  return WORDS[concern].title;
}

export function mockNoun(concern: ConcernId): string {
  return WORDS[concern].noun;
}

/** What we say about concerns that are not marks someone can see. */
export const MOCK_OUT_OF_SCOPE: OutOfScopeNote[] = [
  { label: "Firmness", reason: "A matter of shape and feel, not a mark." },
  { label: "Droopy eyelids", reason: "A matter of shape, not a mark." },
  { label: "Moisture", reason: "Felt more than seen, and it varies through the day." },
  { label: "Oiliness", reason: "Changes through the day and with light." },
  { label: "Radiance", reason: "A property of light on skin, not of the skin." },
];
