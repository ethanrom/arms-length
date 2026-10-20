/**
 * Distances as people say them: formatting, everyday anchors and proxemic zones.
 * Pure and deterministic. Distances are in metres throughout (see lib/contracts/vision.ts).
 */
import { MAX_DISTANCE_M } from "@/lib/contracts/vision";

/** Conversation distance: the default "make it vanish" target (PLAN section 2.4) and the relief threshold. */
export const CONVERSATION_M = 1;

interface Parts {
  value: string;
  unit: "cm" | "m";
  plus: boolean;
}

function parts(m: number): Parts {
  if (Number.isNaN(m)) throw new RangeError("formatDistance: distance is NaN");
  if (m >= MAX_DISTANCE_M) return { value: String(MAX_DISTANCE_M), unit: "m", plus: true };
  if (m <= 0) return { value: "0", unit: "cm", plus: false };
  if (m < 1) {
    // Round to 5 cm; never print "0 cm" for a positive distance, never "100 cm" (that is "1 m").
    const cm = Math.max(5, Math.round((m * 100) / 5) * 5);
    return cm >= 100 ? { value: "1", unit: "m", plus: false } : { value: String(cm), unit: "cm", plus: false };
  }
  if (m < 3) {
    const r = Math.round(m * 10) / 10;
    return { value: Number.isInteger(r) ? String(r) : r.toFixed(1), unit: "m", plus: false };
  }
  return { value: String(Math.round(m)), unit: "m", plus: false };
}

const show = (p: Parts) => `${p.value} ${p.unit}${p.plus ? "+" : ""}`;

/** "40 cm" below 1 m (5 cm steps), "1.5 m" up to 3 m, "4 m" beyond, "10 m+" at the cap. */
export function formatDistance(m: number): string {
  return show(parts(m));
}

/** "35–45 cm"; mixed units keep both ("80 cm–1.2 m"); a collapsed interval prints once. */
export function formatInterval([a, b]: readonly [number, number]): string {
  const lo = parts(Math.min(a, b));
  const hi = parts(Math.max(a, b));
  if (show(lo) === show(hi)) return show(lo);
  if (lo.unit === hi.unit) return `${lo.value}–${hi.value} ${hi.unit}${hi.plus ? "+" : ""}`;
  return `${show(lo)}–${show(hi)}`;
}

export type AnchorId = "mirror" | "selfie" | "inside_arms_length" | "conversation" | "across_table" | "across_room";

export interface DistanceAnchor {
  id: AnchorId;
  /** Representative distance in metres. */
  m: number;
  /** Short label for sliders and ticks. */
  label: string;
  /** Everyday phrase that `anchorFor` can return; null for reference-only anchors. */
  phrase: string | null;
  source: string;
}

export type EverydayAnchor = DistanceAnchor & { phrase: string };

/**
 * "Nearest" is decided on a log scale, so the boundaries between everyday phrases fall at the geometric
 * means: about 0.7 m, 1.2 m and 2.5 m. The first two match arm's length and the edge of Hall's social zone.
 */
export const DISTANCE_ANCHORS: readonly DistanceAnchor[] = [
  {
    id: "mirror",
    m: 0.25,
    label: "Mirror",
    phrase: null,
    source: "Project assumption (PLAN section 1): typical distance when checking skin in a bathroom mirror. Not a measured figure.",
  },
  {
    id: "selfie",
    m: 0.3,
    label: "Phone selfie",
    phrase: null,
    source: "Ward B, Ward M, Fried O, Paskhover B (2018), JAMA Facial Plast Surg 20(4): selfies are typically taken at about 30 cm (12 in).",
  },
  {
    id: "inside_arms_length",
    m: 0.5,
    label: "Arm's length",
    phrase: "closer than arm's length",
    source: "Hall (1966), The Hidden Dimension: close phase of personal distance, 0.45 to 0.76 m.",
  },
  {
    id: "conversation",
    m: 1,
    label: "Conversation",
    phrase: "at conversation distance",
    source: "Hall (1966): far phase of personal distance, 0.76 to 1.2 m. PLAN section 1.1 uses 1 m.",
  },
  {
    id: "across_table",
    m: 1.5,
    label: "Across a table",
    phrase: "across a table",
    source: "Everyday anchor: a dining table is about 1.5 m wide. Falls in Hall's social distance (1.2 to 3.6 m).",
  },
  {
    id: "across_room",
    m: 4,
    label: "Across a room",
    phrase: "across a room",
    source: "Everyday anchor: a living room is about 4 m across. Hall's public distance starts at 3.6 m.",
  },
];

const EVERYDAY = DISTANCE_ANCHORS.filter((a): a is EverydayAnchor => a.phrase !== null);

export function nearestEverydayAnchor(m: number): EverydayAnchor {
  const x = Math.log(Math.max(m, 0.01));
  let best = EVERYDAY[0];
  for (const a of EVERYDAY) {
    if (Math.abs(Math.log(a.m) - x) < Math.abs(Math.log(best.m) - x)) best = a;
  }
  return best;
}

/** The nearest everyday phrase for a distance, e.g. "across a table". */
export function anchorFor(m: number): string {
  return nearestEverydayAnchor(m).phrase;
}

export type ProxemicZone = "intimate" | "personal" | "social" | "public";

/** Hall (1966), The Hidden Dimension. Bounds in metres. */
export const PROXEMIC_ZONES: readonly { zone: ProxemicZone; fromM: number; toM: number }[] = [
  { zone: "intimate", fromM: 0, toM: 0.45 },
  { zone: "personal", fromM: 0.45, toM: 1.2 },
  { zone: "social", fromM: 1.2, toM: 3.6 },
  { zone: "public", fromM: 3.6, toM: Infinity },
];

export function proxemicZone(m: number): ProxemicZone {
  return (PROXEMIC_ZONES.find((z) => m < z.toM) ?? PROXEMIC_ZONES[PROXEMIC_ZONES.length - 1]).zone;
}
