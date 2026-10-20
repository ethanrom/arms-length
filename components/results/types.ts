/**
 * View model for the results experience. Everything the UI shows (numbers and sentences) arrives in this shape.
 * Today `lib/mock` fills it with illustrative data; at integration `lib/copy` (sentences) and the real
 * pipeline (VisibilityReport, Measurements, CoveragePlan, WhatIf) fill it instead. Components never write
 * results strings themselves.
 */
import type {
  ConcernId,
  CoveragePlan,
  Measurements,
  PersonaBundle,
  Point,
  VisibilityReport,
  WhatIf,
} from "@/lib/contracts";

/** A named distance on the Step back axis: "Mirror" at 25 cm. */
export interface DistanceAnchor {
  distanceM: number;
  /** Shown on the axis and in the readout: "Across a table". */
  label: string;
  /** One or two words for narrow screens: "Table". */
  short: string;
}

/**
 * The computation chain behind one concern's distance, with real numbers, for the "How we know" sheet.
 * Evaluated for the concern's most visible target at `distanceM`.
 */
export interface Receipt {
  concern: ConcernId;
  targetId: string;
  /** Closed outline of the YouCam mask component, in frame px. */
  maskOutline: Point[];
  /** Width of the feature, measured with the iris as ruler (mm). */
  sizeMm: number;
  /** How far it differs from the skin around it, in percent. */
  contrastPct: number;
  /** Visual angle it covers at `distanceM`, in minutes of arc. */
  angleArcmin: number;
  /** Contrast an ideal observer needs at that angle to see it, in percent. */
  thresholdPct: number;
  /** The viewing distance the angle and threshold are evaluated at. */
  distanceM: number;
}

/** The four steps of a receipt, as sentences. */
export interface ReceiptCopy {
  /** "YouCam found it here." */
  found: string;
  /** "It's 2.9 mm wide." */
  size: string;
  /** "It's 18% darker than the skin around it." */
  contrast: string;
  /** "At 1 m it covers 8.9 arcmin. At that size people need about 14% contrast to see it." */
  angle: string;
  /** "It has 36%, so it's visible." */
  verdict: string;
  /** Where step 4 comes from. */
  model: string;
}

export interface ReceiptEntry {
  receipt: Receipt;
  copy: ReceiptCopy;
}

/** One YouCam mask, composited on the photo, for the "What YouCam detected" strip. */
export interface MaskThumb {
  concern: ConcernId;
  label: string;
  image: string;
  /** Present when the mask is empty or the concern is not about visibility. */
  note?: string;
}

export interface MaskStrip {
  title: string;
  note: string;
  items: MaskThumb[];
}

/** Sentences for one concern (ConcernVisibility supplies the numbers). */
export interface ConcernCopy {
  concern: ConcernId;
  /** "Pores" */
  title: string;
  /** Lower case, sits on the face while the slider crosses the threshold: "pores fade here". */
  fadeLabel: string;
  /** The kind sentence leading the card. */
  headline: string;
  /** One line under it, with the numbers. */
  detail: string;
  /** What the number means, in plain words (the "i"). */
  explainer: string;
  /** Confidence statement with the reason. */
  confidence: string;
}

/** A concern that gets no distance, with the honest reason. */
export interface OutOfScopeNote {
  label: string;
  reason: string;
}

/** One target distance for "make it disappear": the least coverage that gets there, with sentences. */
export interface CoverageOption {
  plan: CoveragePlan;
  /** "Foundation at 60% coverage keeps age spots out of sight beyond 1 m." */
  headline: string;
  /** "foundation coverage 60%"; null when no lever is needed or none works. */
  leverLabel: string | null;
  /** The lever without its value, for a caption next to the big number: "foundation coverage". */
  leverName: string | null;
  /** The honest detail: verified on a render, or not met. */
  detail: string;
  /** Shown as the "after" face; the "before" is the persona photo. */
  afterImage: string;
  /** True when the after image is a stand-in, not the render for this exact lever value. */
  afterIsPreview: boolean;
}

export interface CoverageView {
  concern: ConcernId;
  title: string;
  /** Lead-in under the section title. */
  lede: string;
  options: CoverageOption[];
}

export interface WhatIfView {
  whatIf: WhatIf;
  title: string;
  /** "If these spots faded by half, they'd disappear beyond 1.4 m." */
  headline: string;
  detail: string;
  /** Label under each side of the comparison. */
  beforeLabel: string;
  afterLabel: string;
  afterImage: string;
  afterIsPreview: boolean;
}

export interface ShareLine {
  concern: ConcernId;
  /** "Pores" */
  label: string;
  /** "out of sight beyond 40 cm" */
  sentence: string;
  distanceM: number;
  tone: "relief" | "visible";
}

export interface ShareData {
  title: string; // "What others see"
  subtitle: string; // "A synthetic face, seen from a distance"
  lines: ShareLine[];
  footnote: string;
}

export interface ResultsData {
  persona: PersonaBundle;
  /** Natural size of the photo in px (the frame every coordinate is in). */
  frame: { width: number; height: number };
  alt: string;
  /** Neutral grey for the photo surround, matched to the photo's backdrop lightness (never tinted). */
  stageGrey: string;
  measurements: Measurements;
  report: VisibilityReport;
  concerns: ConcernCopy[];
  outOfScope: OutOfScopeNote[];
  anchors: DistanceAnchor[];
  /** Concerns that vanish at or before this distance count as "relief" (default: conversation distance). */
  reliefWithinM: number;
  coverage: CoverageView | null;
  whatIf: WhatIfView | null;
  share: ShareData;
  /** The "How we know" receipts, one per concern. */
  receipts: ReceiptEntry[];
  /** YouCam's own masks, the starting input. */
  maskStrip: MaskStrip;
  /** One line under the title: "YouCam's AI finds it. Vision science measures it." */
  tagline: string;
  /** Label on the Step back hero: what is and is not drawn. */
  heroLabel: string;
  /** Where these results came from: "A replay of a recorded YouCam skin analysis of a synthetic face." */
  provenance: string;
  /** Honest status lines for the analysing state. */
  statusLines: string[];
  /** Small print under the Step back hero: says which renderer drew it. */
  rendererNote: string;
}
