// Runs the DistanceRenderer off the main thread so dragging and scrolling stay smooth while stops render.
import type { RgbaImage, ScaleEstimate, ViewingConditions } from "@/lib/contracts";
import { distanceRenderer } from "./renderer";

export interface RenderRequest {
  id: number;
  photo: RgbaImage;
  scale: ScaleEstimate;
  viewing: ViewingConditions;
  distances: number[];
}

export type RenderMessage =
  | { id: number; kind: "frame"; index: number; distanceM: number; width: number; height: number; buffer: ArrayBuffer }
  | { id: number; kind: "done" }
  | { id: number; kind: "error"; message: string };

interface WorkerScope {
  onmessage: ((e: MessageEvent<RenderRequest>) => void) | null;
  postMessage(message: RenderMessage, transfer?: Transferable[]): void;
}

const scope = self as unknown as WorkerScope;

scope.onmessage = (e) => {
  const { id, photo, scale, viewing, distances } = e.data;
  try {
    distances.forEach((distanceM, index) => {
      const out = distanceRenderer(photo, scale, viewing, distanceM);
      const buffer = out.data.buffer as ArrayBuffer;
      scope.postMessage({ id, kind: "frame", index, distanceM, width: out.width, height: out.height, buffer }, [buffer]);
    });
    scope.postMessage({ id, kind: "done" });
  } catch (err) {
    scope.postMessage({ id, kind: "error", message: err instanceof Error ? err.message : "render failed" });
  }
};
