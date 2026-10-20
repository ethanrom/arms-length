/**
 * Makeup VTO and Skin Simulation inputs/outputs, and the plans built on them.
 * Spike finding: concealer coverageLevel does not change the render; the levers in use are settled by the
 * VTO follow-up (internal/research/spike.md §9). Keep `lever` generic until then.
 */
import type { ConcernId } from "./concerns";

/** A YouCam makeup-vto effect object, passed through as-is (see makeup_vto.yaml). */
export type MakeupEffect = { category: string } & Record<string, unknown>;

/** Skin Simulation strengths, each 0..1 (not all zero). */
export type SimulationStrengths = Partial<
  Record<"wrinkle" | "radiance" | "oiliness" | "acne" | "eye_bags" | "dark_circle" | "spots" | "pores" | "texture" | "redness", number>
>;

export interface RenderResult {
  /** data URL, or fixture-relative path in replay mode. */
  imageRef: string;
  width: number;
  height: number;
  /** Integer px offset to apply to align the render to the analysis frame (spike: VTO is +1 row). */
  offset: { dx: number; dy: number };
  unitsCharged: number;
  source: "live" | "replay" | "preview";
}

export interface Lever {
  category: string; // e.g. "foundation"
  field: string; // e.g. "coverageIntensity"
  value: number;
}

export interface CoverageStep {
  lever: Lever;
  render: RenderResult;
  /** Re-measured visibility of the target concern after this render. */
  maxDistanceM: number;
  /** Share of the concern's targets still detectable (bound) at the plan's targetDistanceM. The plan's metric. */
  fractionAtTarget?: number;
}

/** Least makeup that brings a concern's visibility to <= targetDistanceM, verified on renders. */
export interface CoveragePlan {
  concern: ConcernId;
  targetDistanceM: number;
  baselineDistanceM: number;
  steps: CoverageStep[];
  /**
   * met: the lowest coverage with fractionAtTarget <= 10%.
   * not_met: makeup can't get there; `chosen` is the knee, the lowest coverage reaching >= 80% of the reduction that
   * 100% coverage achieves ("most of the effect at 50%").
   * no_lever: no makeup lever for this concern (see reason).
   */
  chosen: CoverageStep | null;
  status: "met" | "not_met" | "no_lever";
  /** Machine-readable reason, e.g. no_makeup_lever, lever_not_tested, not_a_visible_mark, already_met, no_targets. */
  reason?: string;
  /** fractionAtTarget with no makeup. */
  baselineFraction?: number;
}

export interface WhatIf {
  concern: ConcernId;
  strengths: SimulationStrengths;
  render: RenderResult;
  beforeDistanceM: number;
  afterDistanceM: number;
  /**
   * "Worth it?": how far away the *difference* between the photo and this simulated improvement stays detectable
   * (bound). Uses strength 0.5, a realistic improvement; 1.0 beautifies beyond natural (spike, 2026-10-21).
   * Small features usually give a short distance (nobody would notice); large soft areas give a long one.
   */
  differenceMaxDistanceM?: number;
  differenceMedianDistanceM?: number;
  differenceProfile?: { distanceM: number; count: number; fraction: number }[];
}
