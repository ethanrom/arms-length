/**
 * HTTP contracts for app/api routes and the demo persona bundles.
 * Live calls are made as one of three identities, in this order: the caller's own YouCam key (`x-youcam-key`), an
 * access code from LIVE_ACCESS_CODES (`x-access-code`), or nobody when the deployment is open (LIVE_OPEN=1). Without
 * any of them, routes serve replayed fixtures for demo personas only.
 */
import type { ScaleEstimate, SkinAnalysis } from "./measure";
import type { MakeupEffect, RenderResult, SimulationStrengths, CoveragePlan, WhatIf } from "./render";
import type { ViewingConditions, VisibilityReport } from "./vision";

export const ACCESS_HEADER = "x-access-code";
/** The caller's own YouCam API key. Used for that request's YouCam calls only; never stored, logged or echoed. */
export const YOUCAM_KEY_HEADER = "x-youcam-key";

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
  /** Signed task tokens for session-end cleanup (POST /api/youcam/cleanup). */
  taskIds?: string[];
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
  live: boolean; // live analysis available for this caller (own key, access code, or an open deployment)
  reason?: "no_code" | "bad_code" | "invalid_key" | "budget_floor" | "kill_switch" | "daily_cap" | "replay_only";
  /** The deployment is open (LIVE_OPEN=1) and the caller is on the project key: no code needed. */
  open?: boolean;
  /** The request carried an own YouCam key, so nothing is spent from the project's units. */
  byok?: boolean;
  /** Own-key requests only: whether YouCam accepted the key (one free credit() call). */
  keyOk?: boolean;
  /** Whether a photo upload will be accepted right now (live, or replay with REPLAY_UPLOADS=1). Gate the capture UI on it. */
  uploadsAllowed?: boolean;
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
  /** Physical scale if the caller measured it (e.g. our iris ruler in the browser). Otherwise estimated server-side. */
  scale?: ScaleEstimate;
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
