import type { ModelFestMessage, ModelFestRequest } from "./modelfest.worker";

export interface RerunResult {
  predictedDb: number;
  ms: number;
}

let worker: Worker | null = null;
let nextId = 1;
const pending = new Map<number, { resolve: (r: RerunResult) => void; reject: (e: Error) => void }>();

function getWorker(): Worker {
  if (worker) return worker;
  const w = new Worker(new URL("./modelfest.worker.ts", import.meta.url), { type: "module" });
  w.onmessage = (e: MessageEvent<ModelFestMessage>) => {
    const msg = e.data;
    const p = pending.get(msg.id);
    if (!p) return;
    pending.delete(msg.id);
    if (msg.kind === "done") p.resolve({ predictedDb: msg.predictedDb, ms: msg.ms });
    else p.reject(new Error(msg.message));
  };
  w.onerror = () => {
    for (const p of pending.values()) p.reject(new Error("The worker could not start."));
    pending.clear();
    worker = null;
  };
  return (worker = w);
}

/** Re-runs the production detector on one ModelFest stimulus in a Web Worker. */
export function rerunStimulus(stimulusId: number): Promise<RerunResult> {
  return new Promise((resolve, reject) => {
    try {
      const id = nextId++;
      pending.set(id, { resolve, reject });
      const request: ModelFestRequest = { id, stimulusId };
      getWorker().postMessage(request);
    } catch (err) {
      reject(err instanceof Error ? err : new Error("The worker could not start."));
    }
  });
}
