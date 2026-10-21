// Runs the real visibility scan (lib/vision/visibility.ts `rawDistances`) for every measured feature of a face off the main thread.
// 944 features take about 90 ms, which is long enough to stutter a slider.
import type { Feature, ScaleEstimate, ViewingConditions } from "@/lib/contracts";
import { computeReaches, type FeatureReach } from "@/lib/science/reach";

export interface DistancesRequest {
  id: number;
  features: Feature[];
  scale: ScaleEstimate;
  viewing: ViewingConditions;
}

export type DistancesMessage = { id: number; kind: "done"; reaches: FeatureReach[]; ms: number } | { id: number; kind: "error"; message: string };

interface WorkerScope {
  onmessage: ((e: MessageEvent<DistancesRequest>) => void) | null;
  postMessage(message: DistancesMessage): void;
}

const scope = self as unknown as WorkerScope;

scope.onmessage = (e) => {
  const { id, features, scale, viewing } = e.data;
  try {
    const t0 = performance.now();
    const reaches = computeReaches(features, scale, viewing);
    scope.postMessage({ id, kind: "done", reaches, ms: performance.now() - t0 });
  } catch (err) {
    scope.postMessage({ id, kind: "error", message: err instanceof Error ? err.message : "scan failed" });
  }
};
