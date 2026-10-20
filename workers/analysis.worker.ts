// The live analysis in a worker: decode the photo and YouCam's masks, measure, build the visibility report, then (on
// request) "Worth it?" and the coverage search. Nothing here touches the DOM; images are decoded with OffscreenCanvas.
import { ACCESS_HEADER, type ConcernId, type RenderResponse, type RgbaImage, type SkinAnalysis } from "@/lib/contracts";
import { alignCounterfactual } from "@/lib/skin";
import { computeCoverage, computeReading, computeWorthIt, slimPlan, type ReadingInputs } from "@/lib/integration/compute";
import { backdropGrey, maskOverlay } from "@/lib/integration/images";
import { buildSentences } from "@/lib/integration/sentences";
import type { WorkerRequest, WorkerResponse } from "@/lib/integration/workerProtocol";
import type { RenderMakeup } from "@/lib/coverage";

interface WorkerScope {
  onmessage: ((e: MessageEvent<WorkerRequest>) => void) | null;
  postMessage(message: WorkerResponse): void;
}
const scope = self as unknown as WorkerScope;

interface Session {
  inputs: ReadingInputs;
  reading: ReturnType<typeof computeReading>;
}
let session: Session | null = null;

async function decode(dataUrl: string, size?: { width: number; height: number }): Promise<RgbaImage> {
  const blob = await (await fetch(dataUrl)).blob();
  const bitmap = await createImageBitmap(blob);
  const width = size?.width ?? bitmap.width;
  const height = size?.height ?? bitmap.height;
  const canvas = new OffscreenCanvas(width, height);
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  if (!ctx) throw new Error("Canvas is not available in this browser.");
  ctx.drawImage(bitmap, 0, 0, width, height);
  bitmap.close();
  const { data } = ctx.getImageData(0, 0, width, height);
  return { width, height, data };
}

async function encode(image: RgbaImage, type: "image/png" | "image/jpeg"): Promise<Blob> {
  const canvas = new OffscreenCanvas(image.width, image.height);
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas is not available in this browser.");
  ctx.putImageData(new ImageData(image.data as Uint8ClampedArray<ArrayBuffer>, image.width, image.height), 0, 0);
  return canvas.convertToBlob({ type, quality: 0.9 });
}

/** HD masks match the analysed frame; anything else cannot be measured and is left out. */
function usableAnalysis(analysis: SkinAnalysis): SkinAnalysis {
  // With the standard-detail engine, pore and breakout markers are too coarse to size: they get no distance.
  if (analysis.engine !== "sd") return analysis;
  return { ...analysis, results: analysis.results.filter((r) => r.concern !== "pore" && r.concern !== "acne") };
}

async function init(req: Extract<WorkerRequest, { kind: "init" }>): Promise<WorkerResponse> {
  const analysis = usableAnalysis(req.analysis);
  const { frame } = analysis;
  const photo = await decode(req.photo, frame);
  const masks = new Map<string, RgbaImage>();
  for (const r of analysis.results) {
    if (!r.maskRef || masks.has(r.maskRef) || !req.masks[r.maskRef]) continue;
    masks.set(r.maskRef, await decode(req.masks[r.maskRef]));
  }
  const inputs: ReadingInputs = { analysis, masks, photo, scale: req.scale };
  const reading = computeReading(inputs);
  session = { inputs, reading };

  const overlays: Partial<Record<ConcernId, Blob>> = {};
  for (const r of analysis.results) {
    if (r.region !== "whole" || !r.maskRef) continue;
    const mask = masks.get(r.maskRef);
    if (mask) overlays[r.concern] = await encode(maskOverlay(mask, r.concern), "image/png");
  }
  return {
    id: req.id,
    kind: "reading",
    payload: {
      analysis,
      measurements: reading.measurements,
      report: reading.report,
      sentences: buildSentences(reading.report, analysis, []),
      outlines: reading.outlines,
      stageGrey: backdropGrey(photo),
      overlays,
    },
  };
}

async function worthIt(req: Extract<WorkerRequest, { kind: "worthIt" }>): Promise<WorkerResponse> {
  if (!session) throw new Error("No analysis to compare with.");
  const { inputs, reading } = session;
  const sim = await decode(req.sim);
  const entries = computeWorthIt(inputs, reading, req.group, sim, "", req.source);
  const sentences = buildSentences(reading.report, inputs.analysis, entries).worthIt;
  const image = await encode(alignCounterfactual(inputs.photo, sim), "image/jpeg");
  return { id: req.id, kind: "worthIt", entries, image, sentences };
}

async function coverage(req: Extract<WorkerRequest, { kind: "coverage" }>): Promise<WorkerResponse> {
  if (!session) throw new Error("No analysis to work from.");
  const { inputs, reading } = session;
  let renders = 0;
  const render: RenderMakeup = async (lever, effects) => {
    renders++;
    scope.postMessage({ id: req.id, kind: "progress", message: `Rendering try-on ${renders} (${lever.value}% coverage)…` });
    // One POST per render, never retried: a lost response may still have been charged.
    const res = await fetch("/api/youcam/makeup", {
      method: "POST",
      headers: { "content-type": "application/json", ...(req.accessCode ? { [ACCESS_HEADER]: req.accessCode } : {}) },
      body: JSON.stringify({ fileRef: req.fileRef, effects }),
    });
    if (!res.ok) {
      const body = (await res.json().catch(() => null)) as { error?: { message?: string } } | null;
      throw new Error(body?.error?.message ?? "The try-on could not be drawn. Please try again in a moment.");
    }
    const result = (await res.json()) as RenderResponse & { taskIds?: string[] };
    if (result.taskIds?.length) scope.postMessage({ id: req.id, kind: "tasks", tokens: result.taskIds });
    return { photo: await decode(result.imageRef), result: { ...result, imageRef: "" } };
  };
  const run = await computeCoverage(inputs, reading, req.concern, render);
  const image = run.image ? await encode(run.image, "image/jpeg") : null;
  return { id: req.id, kind: "coverage", plan: slimPlan(run.entry.plan, null), image };
}

scope.onmessage = (e) => {
  const req = e.data;
  const task = req.kind === "init" ? init(req) : req.kind === "worthIt" ? worthIt(req) : coverage(req);
  task.then(
    (res) => scope.postMessage(res),
    (error: unknown) => scope.postMessage({ id: req.id, kind: "error", message: error instanceof Error ? error.message : "Something went wrong." }),
  );
};

