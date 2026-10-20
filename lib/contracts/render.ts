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
}

/** Least makeup that brings a concern's visibility to <= targetDistanceM, verified on renders. */
export interface CoveragePlan {
  concern: ConcernId;
  targetDistanceM: number;
  baselineDistanceM: number;
  steps: CoverageStep[];
  chosen: CoverageStep | null;
  status: "met" | "not_met" | "no_lever";
}

export interface WhatIf {
  concern: ConcernId;
  strengths: SimulationStrengths;
  render: RenderResult;
  beforeDistanceM: number;
  afterDistanceM: number;
}
