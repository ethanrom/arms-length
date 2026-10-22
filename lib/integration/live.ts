/**
 * The live "Use my photo" path, on the client.
 *
 *   1. POST /api/youcam/analysis (photo, engine) answers with the masks inline.
 *   2. workers/analysis.worker.ts decodes the photo and masks, measures, builds the visibility report. Results show.
 *   3. In the background: one POST /api/youcam/simulate with all seven improvement concerns at 0.5, then "Worth it?".
 *      (Replay mode has no single recording that covers all seven, so it asks for the two recorded groups instead.)
 *   4. "Make it disappear" runs only on request: the coverage search in the worker, one POST /api/youcam/makeup per
 *      render, registered to the photo in the browser.
 *
 * Every submit is one POST, never retried: a lost response may still have been charged. Errors are plain language.
 */
import {
  ACCESS_HEADER,
  DEFAULT_VIEWING,
  YOUCAM_KEY_HEADER,
  type AnalysisRequest,
  type AnalysisResponse,
  type ApiError,
  type ConcernId,
  type RenderResponse,
  type ScaleEstimate,
  type SimulateRequest,
  type StatusResponse,
} from "@/lib/contracts";
import type { CaptureResult } from "@/lib/capture/types";
import type { WithTasks } from "@/lib/youcam/service";
import type { ViewOptions } from "./viewModel";
import {
  BUNDLE_VERSION,
  SIMULATION_GROUPS,
  type CoverageEntry,
  type ReadingBundle,
  type SimulationGroup,
  type WorthItEntry,
} from "./types";
import type { WorkerRequest, WorkerResponse } from "./workerProtocol";

export const ACCESS_STORAGE_KEY = "arms-length:access-code";
/** The visitor's own YouCam key. sessionStorage, so it lives in this tab only and goes when the tab closes. */
export const YOUCAM_KEY_STORAGE_KEY = "arms-length:youcam-key";

/** What the visitor brought: an own YouCam key and/or an access code. Either, both or neither (an open deployment). */
export interface Credentials {
  code?: string | null;
  apiKey?: string | null;
}

/** The request headers for `creds`. The key goes first in the server's order of precedence; both are sent if both are set. */
function credentialHeaders({ code, apiKey }: Credentials): Record<string, string> {
  return { ...(code ? { [ACCESS_HEADER]: code } : {}), ...(apiKey ? { [YOUCAM_KEY_HEADER]: apiKey } : {}) };
}

export class LiveError extends Error {
  constructor(
    message: string,
    readonly code?: string,
  ) {
    super(message);
    this.name = "LiveError";
  }
}

// ---------- access ----------

export interface Access {
  /** Live analysis may run (an own key, a valid code, or an open deployment), or the server is in replay mode and will answer from a recording. */
  allowed: boolean;
  /** The server answers every analysis with a recorded face (dev and tests). */
  replay: boolean;
  /** Shown when `allowed` is false. */
  message: string;
}

const RESERVED = "Live analysis needs your own YouCam API key or an access code here. Try a demo face.";

/** Same ending in every case: the way on is the visitor's own key (or a demo face), never a dead end. */
const OUT_OF_CREDITS = "Our live credits are used up for now. Use your own YouCam API key to continue, or try a demo face.";
const OUT_OF_TODAY = "Today's live analyses on our key are used up. Use your own YouCam API key to continue, or try a demo face.";

const REASONS: Record<NonNullable<StatusResponse["reason"]>, string> = {
  no_code: RESERVED,
  bad_code: "That access code didn't work. Check it, or try a demo face.",
  invalid_key: "YouCam didn't accept that API key. Check it and try again, or try a demo face.",
  budget_floor: "Live analysis is paused right now. Try a demo face.",
  kill_switch: "Live analysis is paused right now. Try a demo face.",
  daily_cap: "This access code has used its live analyses for today. Try a demo face.",
  replay_only: "",
};

/** On an open deployment the shared allowance running out is not the visitor's doing: point them at their own key. */
const OPEN_REASONS: Partial<typeof REASONS> = { budget_floor: OUT_OF_CREDITS, daily_cap: OUT_OF_TODAY };

/** GET /api/youcam/status with the visitor's key and/or code: live, replay-only (dev), or the reason it is not available. */
export async function checkAccess({ code, apiKey }: Credentials = {}, fetcher: typeof fetch = fetch): Promise<Access> {
  let status: StatusResponse;
  try {
    const res = await fetcher("/api/youcam/status", { headers: credentialHeaders({ code, apiKey }), cache: "no-store" });
    if (!res.ok) throw new Error(String(res.status));
    status = (await res.json()) as StatusResponse;
  } catch {
    return { allowed: false, replay: false, message: "We couldn't reach the analysis service. Check your connection, or try a demo face." };
  }
  if (status.live) return { allowed: true, replay: false, message: "" };
  // A recorded-faces deployment turns uploads away unless it was started for tests: say so before any camera prompt.
  if (status.reason === "replay_only") {
    if (status.uploadsAllowed !== false) return { allowed: true, replay: true, message: "" };
    const message = apiKey ? "This site only serves its recorded demo faces, so your key can't be used here. Try a demo face." : RESERVED;
    return { allowed: false, replay: true, message };
  }
  const reason = status.reason ?? "no_code";
  return { allowed: false, replay: false, message: (status.open && OPEN_REASONS[reason]) || REASONS[reason] || RESERVED };
}

// ---------- session ----------

export type LiveStage = "idle" | "uploading" | "measuring" | "ready" | "error";

export interface LiveSnapshot {
  stage: LiveStage;
  /** A status line for the stage, plain language. */
  message: string;
  bundle: ReadingBundle | null;
  options: ViewOptions;
  error: string | null;
  /** Coverage progress lines while a plan runs. */
  coverageProgress: string | null;
  /** Units the server reported for this session so far. */
  unitsCharged: number;
}

export interface LiveSession {
  start(capture: CaptureResult): Promise<void>;
  runCoverage(concern: ConcernId): Promise<void>;
  subscribe(listener: (snapshot: LiveSnapshot) => void): () => void;
  snapshot(): LiveSnapshot;
  /** Asks YouCam to delete every task this session created. Safe to call on pagehide; a second call is a no-op. */
  cleanup(): void;
  /** Cleans up, stops the worker and frees the image URLs. */
  dispose(): void;
}

const NETWORK = "We couldn't reach the analysis service. Check your connection and try again.";

async function postJson<T>(path: string, body: unknown, creds: Credentials): Promise<T> {
  let res: Response;
  try {
    res = await fetch(path, {
      method: "POST",
      headers: { "content-type": "application/json", ...credentialHeaders(creds) },
      body: JSON.stringify(body),
    });
  } catch {
    throw new LiveError(NETWORK, "network");
  }
  if (!res.ok) {
    const error = (await res.json().catch(() => null)) as ApiError | null;
    throw new LiveError(error?.error.message ?? "Something went wrong on our side. Please try again.", error?.error.code);
  }
  return (await res.json()) as T;
}

const blobToDataUrl = (blob: Blob) =>
  new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(blob);
  });

const rescale = (scale: ScaleEstimate, factor: number): ScaleEstimate =>
  Math.abs(factor - 1) < 0.005 ? scale : { ...scale, mmPerPx: scale.mmPerPx * factor, ...(scale.irisPx !== undefined ? { irisPx: scale.irisPx / factor } : {}) };

export interface LiveOptions {
  accessCode: string | null;
  /** The visitor's own YouCam key, if they brought one. Held in memory for this session only. */
  apiKey?: string | null;
}

export function createLiveSession({ accessCode, apiKey = null }: LiveOptions): LiveSession {
  const creds: Credentials = { code: accessCode, apiKey };
  const listeners = new Set<(s: LiveSnapshot) => void>();
  const urls: string[] = [];
  let worker: Worker | null = null;
  let nextId = 1;
  const pending = new Map<number, { resolve: (r: WorkerResponse) => void; reject: (e: Error) => void; onProgress?: (m: string) => void }>();
  let fileRef: string | null = null;
  // Signed tokens for the YouCam tasks this session created (analysis, simulation, makeup renders).
  const taskTokens = new Set<string>();
  const remember = (tokens?: string[]) => tokens?.forEach((t) => taskTokens.add(t));
  let disposed = false;

  let state: LiveSnapshot = {
    stage: "idle",
    message: "",
    bundle: null,
    options: {},
    error: null,
    coverageProgress: null,
    unitsCharged: 0,
  };
  const set = (patch: Partial<LiveSnapshot>) => {
    if (disposed) return;
    state = { ...state, ...patch };
    listeners.forEach((l) => l(state));
  };
  const setBundle = (patch: Partial<ReadingBundle>) => state.bundle && set({ bundle: { ...state.bundle, ...patch } });
  const setOptions = (patch: ViewOptions) => set({ options: { ...state.options, ...patch } });

  const url = (blob: Blob) => {
    const u = URL.createObjectURL(blob);
    urls.push(u);
    return u;
  };

  function getWorker(): Worker {
    if (worker) return worker;
    const w = new Worker(new URL("../../workers/analysis.worker.ts", import.meta.url), { type: "module" });
    w.onmessage = (e: MessageEvent<WorkerResponse>) => {
      const msg = e.data;
      const p = pending.get(msg.id);
      if (!p) return;
      if (msg.kind === "tasks") return remember(msg.tokens);
      if (msg.kind === "progress") return p.onProgress?.(msg.message);
      pending.delete(msg.id);
      if (msg.kind === "error") p.reject(new LiveError(msg.message, msg.code));
      else p.resolve(msg);
    };
    w.onerror = () => {
      const stranded = [...pending.values()];
      pending.clear();
      for (const p of stranded) p.reject(new LiveError("The measuring step could not start in this browser. Try a current Chrome, Safari or Firefox."));
    };
    return (worker = w);
  }

  function ask(request: DistributiveOmit<WorkerRequest, "id">, onProgress?: (m: string) => void): Promise<WorkerResponse> {
    const id = nextId++;
    return new Promise((resolve, reject) => {
      pending.set(id, { resolve, reject, onProgress });
      getWorker().postMessage({ ...request, id } as WorkerRequest);
    });
  }

  async function simulate(strengths: SimulateRequest["strengths"]): Promise<RenderResponse> {
    if (!fileRef) throw new LiveError("The analysis isn't ready yet.");
    const res = await postJson<WithTasks<RenderResponse>>("/api/youcam/simulate", { fileRef, strengths } satisfies SimulateRequest, creds);
    remember(res.taskIds);
    return res;
  }

  /** One simulation render -> "Worth it?" entries for the concerns of `group`, merged into the bundle. */
  async function worthItFor(group: SimulationGroup, source: "live" | "replay", strengths: SimulateRequest["strengths"]) {
    const sim = await simulate(strengths);
    set({ unitsCharged: state.unitsCharged + sim.unitsCharged });
    const res = await ask({ kind: "worthIt", group, sim: sim.imageRef, source });
    if (res.kind !== "worthIt") throw new LiveError("Unexpected answer from the measuring step.");
    const image = url(res.image);
    const entries: WorthItEntry[] = res.entries.map((e) => ({ ...e, whatIf: { ...e.whatIf, render: { ...e.whatIf.render, imageRef: image } } }));
    const bundle = state.bundle;
    if (!bundle) return;
    const kept = bundle.worthIt.filter((w) => !entries.some((e) => e.concern === w.concern));
    setBundle({
      worthIt: [...kept, ...entries],
      sentences: { ...bundle.sentences, worthIt: { ...bundle.sentences.worthIt, ...res.sentences } },
      whatIfs: [...kept, ...entries].map((w) => w.whatIf),
    });
  }

  async function backgroundWorthIt(source: "live" | "replay") {
    setOptions({ worthIt: { state: "pending" } });
    try {
      if (source === "replay") {
        // Recorded faces only have the two half-strength groups, so ask for those separately.
        const groups: ("a" | "b")[] = ["a", "b"];
        const settled = await Promise.allSettled(groups.map((g) => worthItFor(g, source, SIMULATION_GROUPS[g].strengths)));
        const failed = settled.find((r) => r.status === "rejected") as PromiseRejectedResult | undefined;
        if (failed && settled.every((r) => r.status === "rejected")) throw failed.reason;
      } else {
        await worthItFor("all", source, SIMULATION_GROUPS.all.strengths);
      }
      setOptions({ worthIt: { state: "ready" } });
    } catch (error) {
      const message = error instanceof Error ? error.message : "The improvement views could not be drawn.";
      setOptions({ worthIt: { state: "error", message: `${message} The numbers above are unaffected.` } });
    }
  }

  function cleanup() {
    if (taskTokens.size === 0) return;
    // Absent fields are left out (not null): the server's body schema is strict.
    const body = JSON.stringify({ taskIds: [...taskTokens], ...(accessCode ? { accessCode } : {}), ...(apiKey ? { youcamKey: apiKey } : {}) });
    taskTokens.clear();
    // sendBeacon survives the page going away; it cannot set headers, so the code or own key rides in the body.
    const queued = typeof navigator !== "undefined" && navigator.sendBeacon?.("/api/youcam/cleanup", new Blob([body], { type: "application/json" }));
    if (!queued) {
      void fetch("/api/youcam/cleanup", {
        method: "POST",
        keepalive: true,
        headers: { "content-type": "application/json", ...credentialHeaders(creds) },
        body,
      }).catch(() => undefined);
    }
  }

  return {
    snapshot: () => state,

    cleanup,

    subscribe(listener) {
      listeners.add(listener);
      listener(state);
      return () => listeners.delete(listener);
    },

    async start(capture) {
      try {
        set({ stage: "uploading", message: "Sending your photo to YouCam. Analysis takes about half a minute.", error: null });
        const response = await postJson<WithTasks<AnalysisResponse>>(
          "/api/youcam/analysis",
          { image: capture.image, engine: capture.engine } satisfies AnalysisRequest,
          creds,
        );
        fileRef = response.fileRef;
        remember(response.taskIds);
        set({ stage: "measuring", message: "Measuring every mark against the width of your iris.", unitsCharged: response.unitsCharged });

        let photo = capture.image;
        let photoBlob: Blob | null = null;
        let scale = rescale(capture.scale, capture.size.width / response.analysis.frame.width);
        const persona = response.source === "replay" && response.fileRef.startsWith("persona:") ? response.fileRef.slice("persona:".length) : null;
        if (persona) {
          // A replayed answer is a recording of that synthetic face, not of the uploaded photo: measure the recording's
          // own photo at its own scale so the masks, the renders and the numbers all line up.
          const [shot, recorded] = await Promise.all([fetch(`/demo/${persona}/photo.jpg`), fetch(`/demo/${persona}/bundle.json`)]);
          if (shot.ok && recorded.ok) {
            photoBlob = await shot.blob();
            photo = await blobToDataUrl(photoBlob);
            scale = ((await recorded.json()) as { scale: ScaleEstimate }).scale;
          }
        }
        const res = await ask({ kind: "init", photo, analysis: response.analysis, masks: response.masks, scale });
        if (res.kind !== "reading") throw new LiveError("Unexpected answer from the measuring step.");
        const p = res.payload;
        photoBlob ??= await (await fetch(capture.image)).blob();
        const overlays: ReadingBundle["overlays"] = {};
        for (const [concern, blob] of Object.entries(p.overlays) as [ConcernId, Blob][]) overlays[concern] = url(blob);

        const source = response.source === "live" ? "live" : "replay";
        const bundle: ReadingBundle = {
          version: BUNDLE_VERSION,
          source,
          id: "live",
          label: "Your photo",
          description: "",
          image: url(photoBlob),
          alt: source === "live" ? "Your photo" : "A synthetic stand-in portrait, replayed in place of your photo",
          stageGrey: p.stageGrey,
          frame: p.analysis.frame,
          analysis: p.analysis,
          masks: {},
          scale,
          viewing: DEFAULT_VIEWING,
          measurements: p.measurements,
          report: p.report,
          sentences: p.sentences,
          outlines: p.outlines,
          receipts: [],
          worthIt: [],
          coverageEntries: [],
          coverage: [],
          whatIfs: [],
          overlays,
          capture: { upscaled: capture.upscaled, upscale: capture.upscale, engine: p.analysis.engine },
        };
        set({ stage: "ready", message: "", bundle });
        void backgroundWorthIt(source);
      } catch (error) {
        set({ stage: "error", message: "", error: error instanceof Error ? error.message : "Something went wrong. Please try again." });
      }
    },

    async runCoverage(concern) {
      const bundle = state.bundle;
      if (!bundle || !fileRef || Object.values(state.options.coverage ?? {}).some((c) => c?.state === "running")) return;
      const mark = (patch: NonNullable<ViewOptions["coverage"]>[ConcernId]) => setOptions({ coverage: { ...state.options.coverage, [concern]: patch } });
      mark({ state: "running" });
      try {
        const res = await ask({ kind: "coverage", concern, fileRef, accessCode, apiKey }, (m) => set({ coverageProgress: m }));
        if (res.kind !== "coverage") throw new LiveError("Unexpected answer from the measuring step.");
        const entry: CoverageEntry = { plan: res.plan, afterImage: res.image ? url(res.image) : null };
        const steps = res.plan.steps.length;
        const current = state.bundle;
        if (current) {
          const coverageEntries = [...current.coverageEntries.filter((e) => e.plan.concern !== concern), entry];
          setBundle({ coverageEntries, coverage: coverageEntries.map((e) => e.plan) });
        }
        set({ coverageProgress: null, unitsCharged: state.unitsCharged + (bundle.source === "live" ? steps : 0) });
        mark(undefined);
      } catch (error) {
        set({ coverageProgress: null });
        mark({ state: "error", message: error instanceof Error ? error.message : "That try-on didn't come through." });
      }
    },

    dispose() {
      cleanup();
      disposed = true;
      worker?.terminate();
      worker = null;
      urls.forEach((u) => URL.revokeObjectURL(u));
      listeners.clear();
    },
  };
}

type DistributiveOmit<T, K extends keyof never> = T extends unknown ? Omit<T, K> : never;
