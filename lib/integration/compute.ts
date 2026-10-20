/**
 * The pipeline steps shared by the bundle builder (Node, fixtures) and the live worker (browser): measure, report,
 * "Worth it?", coverage. Pure and deterministic; the caller supplies decoded `RgbaImage`s and render functions.
 */
import {
  DEFAULT_VIEWING,
  type ConcernId,
  type CoveragePlan,
  type Measurements,
  type Point,
  type RgbaImage,
  type ScaleEstimate,
  type SkinAnalysis,
  type VisibilityReport,
  type ViewingConditions,
  type WhatIf,
} from "@/lib/contracts";
import { COVERAGE_TARGET_M, SIMULATION_GROUPS, type CoverageEntry, type SimulationGroup, type WorthItEntry } from "./types";
import { planCoverage, SIMULATION_KEY, type RenderMakeup } from "@/lib/coverage";
import { alignCounterfactual, measureAnalysis } from "@/lib/skin";
import { buildVisibilityReport } from "@/lib/vision";
import { worthIt } from "@/lib/vision/worthIt";
import { outlineOf } from "./outline";

export interface ReadingInputs {
  analysis: SkinAnalysis;
  /** Keyed by `ConcernResult.maskRef`, as for `measureAnalysis`. */
  masks: Map<string, RgbaImage>;
  photo: RgbaImage;
  scale: ScaleEstimate;
  viewing?: ViewingConditions;
}

export interface Reading {
  measurements: Measurements;
  report: VisibilityReport;
  /** Mask outline of each concern's most visible target, keyed by target id. */
  outlines: Record<string, Point[]>;
}

const geometryOf = (inputs: ReadingInputs) => ({ analysis: inputs.analysis, masks: inputs.masks });

/** The whole mask of a concern in an analysis, if it was provided. */
export function wholeMask(analysis: SkinAnalysis, masks: Map<string, RgbaImage>, concern: ConcernId): RgbaImage | undefined {
  const result = analysis.results.find((r) => r.concern === concern && r.region === "whole");
  return result?.maskRef ? masks.get(result.maskRef) : undefined;
}

/** Measure every feature (surround basis) and build the visibility report. */
export function computeReading(inputs: ReadingInputs): Reading {
  const viewing = inputs.viewing ?? DEFAULT_VIEWING;
  const measurements = measureAnalysis(inputs.analysis, inputs.masks, inputs.photo, inputs.scale);
  const report = buildVisibilityReport(measurements, viewing);
  const outlines: Record<string, Point[]> = {};
  for (const c of report.concerns) {
    const id = c.topTargets[0];
    const target = measurements.features.find((f) => f.id === id) ?? measurements.regions.find((r) => r.id === id);
    if (target) outlines[id] = outlineOf(target, wholeMask(inputs.analysis, inputs.masks, c.concern));
  }
  return { measurements, report, outlines };
}

/** The `WhatIf.render` of a simulation shown from `imageRef` (an aligned display image). */
const simRender = (imageRef: string, photo: RgbaImage, source: "live" | "replay") => ({
  imageRef,
  width: photo.width,
  height: photo.height,
  offset: { dx: 0, dy: 0 },
  unitsCharged: 0,
  source,
});

/**
 * "Worth it?" for one simulation group: how far the difference between the photo and the half-strength improvement
 * stays detectable, plus the concern's own visibility in the simulated render (the contract's before/after).
 */
export function computeWorthIt(
  inputs: ReadingInputs,
  reading: Reading,
  group: SimulationGroup,
  sim: RgbaImage,
  displayImage: string,
  source: "live" | "replay" = "replay",
): WorthItEntry[] {
  const viewing = inputs.viewing ?? DEFAULT_VIEWING;
  const concerns = SIMULATION_GROUPS[group].concerns.filter((c) => reading.report.concerns.some((r) => r.concern === c));
  if (concerns.length === 0) return [];
  const differences = worthIt(reading.measurements, geometryOf(inputs), inputs.photo, sim, concerns, { viewing });
  const aligned = alignCounterfactual(inputs.photo, sim);
  const after = buildVisibilityReport(measureAnalysis(inputs.analysis, inputs.masks, aligned, inputs.scale), viewing);
  return differences.map((d) => {
    const before = reading.report.concerns.find((c) => c.concern === d.concern);
    const key = SIMULATION_KEY[d.concern];
    const whatIf: WhatIf = {
      concern: d.concern,
      strengths: key ? { [key]: 0.5 } : {},
      render: simRender(displayImage, inputs.photo, source),
      beforeDistanceM: before?.maxDistanceM ?? 0,
      afterDistanceM: after.concerns.find((c) => c.concern === d.concern)?.maxDistanceM ?? 0,
      differenceMaxDistanceM: d.differenceMaxDistanceM,
      differenceMedianDistanceM: d.differenceMedianDistanceM,
      differenceProfile: d.differenceProfile,
      ...(d.differenceNominalProfile
        ? { differenceNominalProfile: d.differenceNominalProfile, differenceNominalMaxDistanceM: d.differenceNominalMaxDistanceM }
        : {}),
    };
    return { concern: d.concern, group, whatIf, targetCount: d.targetCount };
  });
}

/** The plan with display paths for the render it kept and nothing for the rest (their pixels are not stored). */
export function slimPlan(plan: CoveragePlan, keptImage: string | null): CoveragePlan {
  const strip = (step: CoveragePlan["steps"][number]) => ({
    ...step,
    render: { ...step.render, imageRef: plan.chosen && step.lever.value === plan.chosen.lever.value && keptImage ? keptImage : "" },
  });
  return { ...plan, steps: plan.steps.map(strip), chosen: plan.chosen ? strip(plan.chosen) : null };
}

export interface CoverageRun {
  entry: CoverageEntry;
  /** The kept step's render, aligned to the frame, for the caller to encode and store; null when none is shown. */
  image: RgbaImage | null;
}

/**
 * The least foundation coverage that hides a concern from `COVERAGE_TARGET_M`, verified on renders. Every render the
 * search asks for is kept, so the chosen one can be handed back aligned to the photo for display.
 */
export async function computeCoverage(
  inputs: ReadingInputs,
  reading: Reading,
  concern: ConcernId,
  render: RenderMakeup,
  targetDistanceM = COVERAGE_TARGET_M,
): Promise<CoverageRun> {
  const kept = new Map<number, RgbaImage>();
  const plan: CoveragePlan = await planCoverage({
    concern,
    base: reading.measurements,
    scale: inputs.scale,
    viewing: inputs.viewing ?? DEFAULT_VIEWING,
    photo: inputs.photo,
    geometry: geometryOf(inputs),
    targetDistanceM,
    render: async (lever, effects) => {
      const rendered = await render(lever, effects);
      kept.set(lever.value, rendered.photo);
      return rendered;
    },
  });
  const chosen = plan.chosen ? kept.get(plan.chosen.lever.value) : undefined;
  return {
    entry: { plan, afterImage: null },
    image: chosen ? alignCounterfactual(inputs.photo, chosen, plan.chosen!.render.offset) : null,
  };
}
