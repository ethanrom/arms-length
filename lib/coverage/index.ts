// replayRender.ts is not exported here: it needs the disk and sharp (Node only). Import it directly.
export { planCoverage, foundationEffects, COVERAGE_GRID } from "./plan";
export type { CoveragePlanResult, NoLeverReason, PlanInput, PlanNote } from "./plan";
export { whatIf, SIMULATION_KEY } from "./whatif";
export type { WhatIfInput } from "./whatif";
export { skinShade } from "./shade";
export { registerRender, validRegion, MAX_SHIFT_PX, MIN_TRUSTED_NCC } from "./register";
export type { Registration } from "./register";
export type { MeasureInput, RenderedImage, RenderMakeup } from "./common";
