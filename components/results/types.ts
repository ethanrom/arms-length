/**
 * View model for the results experience. Everything the UI shows (numbers and sentences) arrives in this shape,
 * built by lib/integration/viewModel.ts from a `ReadingBundle`: numbers from the real pipeline, sentences from
 * lib/copy (and lib/integration/copy.ts). Components never write results strings themselves.
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
 * Which "How we know" chain to open: the concern's most visible target. The sheet computes the numbers for any distance
 * (lib/integration/receipt.ts) from the target in `ResultsData.measurements`, so the verdict follows the model exactly.
 */
export interface ReceiptEntry {
  concern: ConcernId;
  targetId: string;
  /** Closed outline of the YouCam mask component, in frame px. */
  outline: Point[];
  /** Distances the sheet offers, and the one it opens on. */
  distancesM: number[];
  defaultDistanceM: number;
}

/** One YouCam mask, drawn over the photo, for the "What YouCam detected" strip. */
export interface MaskThumb {
  concern: ConcernId;
  label: string;
  /** Transparent overlay of the mask, same aspect as the photo. */
  image: string;
  /** Present when the mask is empty or the concern is not about visibility. */
  note?: string;
}

export interface MaskStrip {
  title: string;
  note: string;
  /** The photo the overlays sit on. */
  photo: string;
  frame: { width: number; height: number };
  items: MaskThumb[];
}

/** Sentences for one concern (ConcernVisibility supplies the numbers). */
export interface ConcernCopy {
  concern: ConcernId;
  /** "Pores" */
  title: string;
  /** Lower case, sits on the face while the slider crosses the threshold: "pores fade here". */
  fadeLabel: string;
  /** relief: gone by conversation distance, or at most a tenth of its marks show across a table. From lib/copy. */
  tone: "relief" | "visible";
  /** The kind sentence leading the card. */
  headline: string;
  /** One line under it, with the numbers (YouCam's own score is the last sentence). */
  detail: string;
  /** The chip on the card: "Half out of sight by 1.5 m", "A large, soft area". */
  keyLine: string;
  /** A large soft area: no distance, bar or curve is drawn for it (lib/copy decides the same way). */
  soft: boolean;
  /** The mark-safety line (dark spots, breakouts); `detail` already ends with it. */
  safety?: string;
  /** What the concern is, then what the number means, in plain words (the "i"). */
  explainer: string;
  /** Confidence statement with the reason. */
  confidence: string;
}

/** A concern that gets no distance, with the honest reason. */
export interface OutOfScopeNote {
  label: string;
  reason: string;
}

/** The least coverage for one concern, with sentences. `state` is only ever not "ready" in a live session. */
export interface CoverageOption {
  concern: ConcernId;
  title: string;
  plan: CoveragePlan | null;
  headline: string;
  /** "foundation coverage 60%"; null when no lever is needed or none works. */
  leverLabel: string | null;
  /** The lever without its value, for a caption next to the big number: "foundation coverage". */
  leverName: string | null;
  detail: string;
  /** Shown as the "after" face, aligned to the photo; null when nothing is rendered. */
  afterImage: string | null;
  /** idle: waiting for "Make it disappear"; running: renders in progress; error: failed (see detail). */
  state: "ready" | "idle" | "running" | "error";
}

export interface CoverageView {
  title: string;
  /** Lead-in under the section title. */
  lede: string;
  targetM: number;
  options: CoverageOption[];
}

/** One concern's "Worth it?" line. */
export interface WorthItItem {
  concern: ConcernId;
  title: string;
  whatIf: WhatIf;
  /** "The change could show on about half of your dark spots." */
  headline: string;
  detail: string;
  /** A large soft area shows even a small change, on any face: no distance is drawn. */
  soft: boolean;
  /** Where a typical sharp-eyed person stops seeing the difference, metres (for the bar). */
  typicalM: number;
  /** Shown as the improved face: the group's half-strength simulation, aligned to the photo. */
  afterImage: string;
}

export interface WorthItView {
  title: string;
  lede: string;
  /** "(YouCam Skin Simulation, half strength)" */
  credit: string;
  beforeLabel: string;
  afterLabel: string;
  items: WorthItItem[];
  /** pending: the simulations are still being drawn (live sessions); error: they could not be. */
  state: "ready" | "pending" | "error";
  message?: string;
}

export interface ShareLine {
  concern: ConcernId;
  /** "Pores" */
  label: string;
  /** "at most 342 of 649 show across a table" */
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
  source: "demo" | "live" | "replay";
  /** Natural size of the photo in px (the frame every coordinate is in). */
  frame: { width: number; height: number };
  alt: string;
  /** Neutral grey for the photo surround, matched to the photo's backdrop lightness (never tinted). */
  stageGrey: string;
  measurements: Measurements;
  report: VisibilityReport;
  /** In display order: relief first, from lib/copy. */
  concerns: ConcernCopy[];
  outOfScope: OutOfScopeNote[];
  anchors: DistanceAnchor[];
  /** How the groups below are decided, in a sentence. */
  reliefNote: string;
  /** One line about the whole face, from lib/copy `summaryLine`. */
  summary: string;
  coverage: CoverageView | null;
  worthIt: WorthItView | null;
  share: ShareData;
  /** The "How we know" chains, one per concern. */
  receipts: ReceiptEntry[];
  /** YouCam's own masks, the starting input. */
  maskStrip: MaskStrip;
  /** One line under the title: "YouCam's AI finds it. Vision science measures it." */
  tagline: string;
  /** Label on the Step back hero: what is and is not drawn. */
  heroLabel: string;
  /** Where these results came from, in a sentence. */
  provenance: string;
  /** Things worth knowing about this reading (an enlarged photo, a smaller analysis, replay mode). */
  notices: string[];
  /** Fixed lines from lib/copy (DISCLAIMERS), shown where the claim is made. */
  disclaimers: { estimate: string; synthetic: string | null; simulation: string; tryOn: string; notHealth: string };
  /** Honest status lines for the analysing state. */
  statusLines: string[];
  /** Small print under the Step back hero: says which renderer drew it. */
  rendererNote: string;
}
