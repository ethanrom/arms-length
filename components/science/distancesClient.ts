import type { Feature, ScaleEstimate, ViewingConditions } from "@/lib/contracts";
import { computeReaches, type FeatureReach } from "@/lib/science/reach";
import type { DistancesMessage, DistancesRequest } from "./distances.worker";

export interface DistancesResult {
  reaches: FeatureReach[];
  /** Time the scan took, ms (in the worker when there is one). */
  ms: number;
  inWorker: boolean;
}

let cached: Promise<DistancesResult> | null = null;

function onMainThread(features: Feature[], scale: ScaleEstimate, viewing: ViewingConditions): Promise<DistancesResult> {
  // Yield once so the page can paint before the scan blocks the thread.
  return new Promise((resolve) => {
    setTimeout(() => {
      const t0 = performance.now();
      const reaches = computeReaches(features, scale, viewing);
      resolve({ reaches, ms: performance.now() - t0, inWorker: false });
    }, 0);
  });
}

/** Scans every feature in a Web Worker (main-thread fallback if workers are unavailable). Cached for the page's life. */
export function scanFeatures(features: Feature[], scale: ScaleEstimate, viewing: ViewingConditions): Promise<DistancesResult> {
  if (cached) return cached;
  cached = new Promise<DistancesResult>((resolve) => {
    if (typeof Worker === "undefined") {
      onMainThread(features, scale, viewing).then(resolve);
      return;
    }
    try {
      const w = new Worker(new URL("./distances.worker.ts", import.meta.url), { type: "module" });
      w.onmessage = (e: MessageEvent<DistancesMessage>) => {
        const msg = e.data;
        w.terminate();
        if (msg.kind === "done") resolve({ reaches: msg.reaches, ms: msg.ms, inWorker: true });
        else onMainThread(features, scale, viewing).then(resolve);
      };
      w.onerror = () => {
        w.terminate();
        onMainThread(features, scale, viewing).then(resolve);
      };
      const request: DistancesRequest = { id: 1, features, scale, viewing };
      w.postMessage(request);
    } catch {
      onMainThread(features, scale, viewing).then(resolve);
    }
  });
  return cached;
}
