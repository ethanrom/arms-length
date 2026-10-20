// replayRender.ts is not exported here: it needs the disk and sharp (Node only). Import it directly.
export { planCoverage, foundationEffects, COVERAGE_GRID, MET_FRACTION, KNEE_SHARE } from "./plan";
export type { NoLeverReason, PlanInput, PlanNote } from "./plan";
export { whatIf, SIMULATION_KEY } from "./whatif";
export type { WhatIfInput, WhatIfResult } from "./whatif";
export { skinShade } from "./shade";
export { registerRender, validRegion, MAX_SHIFT_PX, MIN_TRUSTED_NCC } from "./register";
export type { Registration } from "./register";
export { DEFAULT_TARGET_DISTANCE_M } from "./common";
export type { MeasureInput, RenderedImage, RenderMakeup } from "./common";
