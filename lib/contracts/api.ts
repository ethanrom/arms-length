/**
 * HTTP contracts for app/api routes and the demo persona bundles.
 * Live calls need the `x-access-code` header (a code from LIVE_ACCESS_CODES); without it, routes serve
 * replayed fixtures for demo personas only.
 */
import type { SkinAnalysis } from "./measure";
import type { MakeupEffect, RenderResult, SimulationStrengths, CoveragePlan, WhatIf } from "./render";
import type { ViewingConditions, VisibilityReport } from "./vision";

export const ACCESS_HEADER = "x-access-code";

export interface ApiError {
  error: { code: string; message: string }; // message is plain language, safe to show
}

/** POST /api/youcam/analysis */
export interface AnalysisRequest {
  /** JPEG/PNG data URL of the photo, already resized client-side to the API limits. */
  image?: string;
  /** Instead of an image: a demo persona id (replay, no units). */
  persona?: string;
  /** Analysis engine; defaults to HD. SD is a budget fallback (no pore/acne distances). */
  engine?: "hd" | "sd";
}

/** Masks are returned inline so the browser can measure without further calls. */
export interface AnalysisResponse {
  /** Opaque id of the uploaded file, reused for makeup and simulation calls in the same session. */
  fileRef: string;
  analysis: SkinAnalysis;
  masks: Record<string, string>; // ConcernResult.maskRef -> PNG data URL (or public path in replay)
  unitsCharged: number;
  source: "live" | "replay";
}

/** POST /api/youcam/makeup */
export interface MakeupRequest {
  fileRef: string;
  effects: MakeupEffect[];
}

/** POST /api/youcam/simulate */
export interface SimulateRequest {
  fileRef: string;
  strengths: SimulationStrengths;
}

export type RenderResponse = RenderResult;

/** GET /api/youcam/status */
export interface StatusResponse {
  live: boolean; // live analysis available for this access code
  reason?: "no_code" | "bad_code" | "budget_floor" | "kill_switch" | "daily_cap" | "replay_only";
}

/** POST /api/visibility: the drop-in layer on top of any YouCam Skin Analysis result. */
export interface VisibilityRequest {
  /** The YouCam task result `data.results.output` array as returned (format=json). */
  output: unknown[];
  /** The analysed photo as a data URL (needed for scale and contrast). */
  image: string;
  /** Mask PNGs as data URLs keyed by the mask URL in `output`, if the URLs have expired. */
  masks?: Record<string, string>;
  viewing?: Partial<ViewingConditions>;
}

export type VisibilityResponse = VisibilityReport;

/** A recorded demo face: everything the UI needs with zero live calls. */
export interface PersonaBundle {
  id: string;
  label: string; // shown in the UI, always includes "synthetic face"
  description: string; // e.g. "deep brown skin, about 42"
  image: string; // public path
  analysis: SkinAnalysis;
  masks: Record<string, string>; // ConcernResult.maskRef -> public path
  coverage: CoveragePlan[];
  whatIfs: WhatIf[];
}
