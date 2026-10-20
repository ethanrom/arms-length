import type { RgbaImage, ScaleEstimate, ViewingConditions } from "@/lib/contracts";
import { distanceRenderer } from "./renderer";
import type { RenderMessage, RenderRequest } from "@/workers/stepback.worker";

export interface RenderJob {
  photo: RgbaImage;
  scale: ScaleEstimate;
  viewing: ViewingConditions;
  distances: number[];
}

export interface RenderedFrame {
  index: number;
  distanceM: number;
  image: RgbaImage;
}

interface Pending {
  job: RenderJob;
  onFrame: (frame: RenderedFrame) => void;
  resolve: () => void;
  reject: (err: Error) => void;
}

let worker: Worker | null | undefined;
let nextId = 1;
const pending = new Map<number, Pending>();

function runOnMainThread(job: RenderJob, onFrame: (frame: RenderedFrame) => void, signal?: AbortSignal): Promise<void> {
  return (async () => {
    for (let index = 0; index < job.distances.length; index++) {
      if (signal?.aborted) return;
      // Yield between stops so the page stays responsive.
      await new Promise<void>((r) => setTimeout(r, 0));
      const distanceM = job.distances[index];
      onFrame({ index, distanceM, image: distanceRenderer(job.photo, job.scale, job.viewing, distanceM) });
    }
  })();
}

function getWorker(): Worker | null {
  if (worker !== undefined) return worker;
  if (typeof Worker === "undefined") return (worker = null);
  try {
    const w = new Worker(new URL("../../workers/stepback.worker.ts", import.meta.url), { type: "module" });
    w.onmessage = (e: MessageEvent<RenderMessage>) => {
      const msg = e.data;
      const p = pending.get(msg.id);
      if (!p) return;
      if (msg.kind === "frame") {
        p.onFrame({
          index: msg.index,
          distanceM: msg.distanceM,
          image: { width: msg.width, height: msg.height, data: new Uint8ClampedArray(msg.buffer) },
        });
      } else if (msg.kind === "done") {
        pending.delete(msg.id);
        p.resolve();
      } else {
        pending.delete(msg.id);
        p.reject(new Error(msg.message));
      }
    };
    // If the worker cannot start (blocked, unsupported module workers), finish the jobs on the main thread.
    w.onerror = () => {
      worker = null;
      const stranded = [...pending.values()];
      pending.clear();
      for (const p of stranded) runOnMainThread(p.job, p.onFrame).then(p.resolve, p.reject);
    };
    return (worker = w);
  } catch {
    return (worker = null);
  }
}

/**
 * Renders the photo at each distance, in a Web Worker when available, calling `onFrame` as each one lands.
 * Aborting stops delivering frames (a stop already in flight finishes in the background).
 */
export function renderFrames(job: RenderJob, onFrame: (frame: RenderedFrame) => void, signal?: AbortSignal): Promise<void> {
  const w = getWorker();
  if (!w) return runOnMainThread(job, onFrame, signal);

  return new Promise<void>((resolve, reject) => {
    const id = nextId++;
    const guarded = (frame: RenderedFrame) => {
      if (!signal?.aborted) onFrame(frame);
    };
    pending.set(id, { job, onFrame: guarded, resolve, reject });
    const request: RenderRequest = { id, ...job };
    w.postMessage(request);
  });
}
