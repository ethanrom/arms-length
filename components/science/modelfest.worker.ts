// Re-runs the production detector on one ModelFest stimulus: build the stimulus from eval/modelfest/stimuli.ts and search
// for the contrast at which lib/vision/standard.ts reaches response 1 (the harness in eval/modelfest/run.ts). About 0.25 s.
import { findThresholdContrast, MODELFEST_VIEWING } from "@/eval/modelfest/run";
import { generateStimulus, MODELFEST_DISTANCE_M } from "@/eval/modelfest/stimuli";
import { createStandardDetector } from "@/lib/vision/standard";

export interface ModelFestRequest {
  id: number;
  stimulusId: number;
}

export type ModelFestMessage = { id: number; kind: "done"; predictedDb: number; ms: number } | { id: number; kind: "error"; message: string };

interface WorkerScope {
  onmessage: ((e: MessageEvent<ModelFestRequest>) => void) | null;
  postMessage(message: ModelFestMessage): void;
}

const scope = self as unknown as WorkerScope;

scope.onmessage = (e) => {
  const { id, stimulusId } = e.data;
  try {
    const t0 = performance.now();
    const c = findThresholdContrast(createStandardDetector(), generateStimulus(stimulusId), MODELFEST_VIEWING, MODELFEST_DISTANCE_M);
    scope.postMessage({ id, kind: "done", predictedDb: 20 * Math.log10(c), ms: performance.now() - t0 });
  } catch (err) {
    scope.postMessage({ id, kind: "error", message: err instanceof Error ? err.message : "run failed" });
  }
};
