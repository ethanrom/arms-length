/**
 * The extended persona bundle: everything the results page needs, computed by the real pipeline.
 *
 * `PersonaBundle` (lib/contracts/api.ts) names the recorded inputs; this adds what the engines derived from them
 * (measurements, visibility report, "Worth it?", coverage plans, receipts and sentences) so a demo face opens with no
 * computation. A live session fills the very same shape in the browser (lib/integration/live.ts), so the view model
 * (viewModel.ts) has one input type for both.
 *
 * Images are URLs: public paths for demo faces (public/demo/<id>/), data or blob URLs for a live session. Display
 * images are aligned to the analysis frame, so any of them can replace the photo one for one.
 */
import type {
  ConcernId,
  CoveragePlan,
  Measurements,
  PersonaBundle,
  Point,
  ScaleEstimate,
  Size2,
  ViewingConditions,
  VisibilityReport,
  WhatIf,
} from "@/lib/contracts";
import type { ConcernDescription, WorthItDescription } from "@/lib/copy";

export const BUNDLE_VERSION = 1;

/**
 * Skin Simulation renders at half strength. Demo faces have two recorded groups (4 units each, fixtures/youcam/README.md);
 * a live session asks for all seven concerns in one call (the 5-10 concern tier, 6 units) and "all" is that render.
 */
export type SimulationGroup = "a" | "b" | "all";

export const SIMULATION_GROUPS: Record<SimulationGroup, { concerns: ConcernId[]; strengths: Record<string, number> }> = {
  a: {
    concerns: ["dark_circle", "eye_bag", "wrinkle", "redness"],
    strengths: { dark_circle: 0.5, eye_bags: 0.5, wrinkle: 0.5, redness: 0.5 },
  },
  b: {
    concerns: ["age_spot", "pore", "acne"],
    strengths: { spots: 0.5, pores: 0.5, acne: 0.5 },
  },
  all: {
    concerns: ["dark_circle", "eye_bag", "wrinkle", "redness", "age_spot", "pore", "acne"],
    strengths: { dark_circle: 0.5, eye_bags: 0.5, wrinkle: 0.5, redness: 0.5, spots: 0.5, pores: 0.5, acne: 0.5 },
  },
};

/** Concerns with a makeup lever worth running (spike 9.3); the others have none, see lib/coverage/plan.ts. */
export const COVERAGE_CONCERNS: ConcernId[] = ["age_spot", "pore", "acne"];

/** Where the coverage search aims: across a table. */
export const COVERAGE_TARGET_M = 1.5;

export interface BundleSentences {
  /** Per concern in the report, from `describeConcern` with YouCam's score as context. */
  concerns: Record<string, ConcernDescription>;
  /** Per concern, from `describeWorthIt`. */
  worthIt: Record<string, WorthItDescription>;
  /** One line for the share card, from `summaryLine`. */
  summary: string;
}

/** The "Worth it?" result for one concern, with the simulation it came from. */
export interface WorthItEntry {
  concern: ConcernId;
  group: SimulationGroup;
  /** Contract object; `render.imageRef` is the aligned display image of the group's simulation. */
  whatIf: WhatIf;
  targetCount: number;
}

export interface CoverageEntry {
  plan: CoveragePlan;
  /** The kept step's render, aligned to the frame, or null when nothing needs showing (already met, no lever). */
  afterImage: string | null;
}

/** A pre-computed receipt (default distance), kept in the bundle as a snapshot of lib/integration/receipt.ts. */
export interface ReceiptSnapshot {
  concern: ConcernId;
  targetId: string;
  distanceM: number;
  sizeMm: number;
  contrastPct: number;
  angleArcmin: number;
  thresholdPct: number;
  visible: boolean;
}

export interface CaptureNotes {
  /** The frame was enlarged to reach the high-detail analysis (webcam rule). */
  upscaled: boolean;
  upscale?: number;
  engine: "hd" | "sd";
}

export interface ReadingBundle extends PersonaBundle {
  version: typeof BUNDLE_VERSION;
  source: "demo" | "live" | "replay";
  alt: string;
  /** Neutral grey matched to the photo's backdrop lightness. */
  stageGrey: string;
  frame: Size2;
  scale: ScaleEstimate;
  viewing: ViewingConditions;
  measurements: Measurements;
  report: VisibilityReport;
  sentences: BundleSentences;
  /** Mask outline of each concern's most visible target (frame px), for the receipts. */
  outlines: Record<string, Point[]>;
  receipts: ReceiptSnapshot[];
  worthIt: WorthItEntry[];
  coverageEntries: CoverageEntry[];
  /** Concern -> overlay image of its "whole" mask (transparent PNG, same aspect as the photo). */
  overlays: Partial<Record<ConcernId, string>>;
  capture?: CaptureNotes;
}
