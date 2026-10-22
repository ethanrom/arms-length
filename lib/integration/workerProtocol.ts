/** Messages between the live session (main thread) and workers/analysis.worker.ts. Plain data and Blobs only. */
import type { ConcernId, Point, ScaleEstimate, SkinAnalysis, Measurements, VisibilityReport, CoveragePlan } from "@/lib/contracts";
import type { BundleSentences, SimulationGroup, WorthItEntry } from "./types";

export type WorkerRequest =
  | {
      id: number;
      kind: "init";
      /** The photo that was sent to YouCam, as a data URL. */
      photo: string;
      analysis: SkinAnalysis;
      /** `ConcernResult.maskRef` -> PNG data URL. */
      masks: Record<string, string>;
      scale: ScaleEstimate;
    }
  | {
      id: number;
      kind: "worthIt";
      group: SimulationGroup;
      /** The simulation render as a data URL. */
      sim: string;
      source: "live" | "replay";
    }
  | {
      id: number;
      kind: "coverage";
      concern: ConcernId;
      fileRef: string;
      accessCode: string | null;
      /** The visitor's own YouCam key for the makeup renders, or null. Lives in this worker for the one request. */
      apiKey: string | null;
    };

export interface ReadingPayload {
  analysis: SkinAnalysis;
  measurements: Measurements;
  report: VisibilityReport;
  sentences: BundleSentences;
  outlines: Record<string, Point[]>;
  stageGrey: string;
  /** Concern -> transparent PNG overlay of its "whole" mask. */
  overlays: Partial<Record<ConcernId, Blob>>;
}

export type WorkerResponse =
  | { id: number; kind: "reading"; payload: ReadingPayload }
  | {
      id: number;
      kind: "worthIt";
      /** `whatIf.render.imageRef` is empty: the caller fills in a URL for `image`. */
      entries: WorthItEntry[];
      image: Blob;
      sentences: BundleSentences["worthIt"];
    }
  | { id: number; kind: "coverage"; plan: CoveragePlan; image: Blob | null }
  | { id: number; kind: "progress"; message: string }
  /** Signed tokens for YouCam tasks a request created, to be deleted when the visitor leaves. */
  | { id: number; kind: "tasks"; tokens: string[] }
  | { id: number; kind: "error"; message: string; code?: string };
