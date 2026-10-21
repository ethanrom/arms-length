// The four API operations behind app/api/youcam/*: replay for demo personas, guarded live calls otherwise.
// Routes stay thin (parse, validate, respond); everything with a decision in it is here and unit-tested.
import { HD_ACTIONS } from "@/lib/contracts";
import type {
  AnalysisRequest,
  AnalysisResponse,
  MakeupRequest,
  RenderResponse,
  SimulateRequest,
  Size2,
  StatusResponse,
} from "@/lib/contracts";
import {
  createBudgetGuard,
  configFromEnv,
  writeLedger,
  type BudgetGuard,
  type Decision,
  type GuardKind,
  type LedgerEntry,
} from "./budget";
import { createYouCamClient, type ChargeEvent, type YouCamClient } from "./client";
import { MAKEUP_UNITS, analysisUnits, simulationUnits, type Engine } from "./costs";
import { YouCamError, engineError, gateError, liveReservedError } from "./errors";
import { liveFileRef, parseFileRef } from "./fileref";
import { signTaskId, verifyTaskToken } from "./tasktokens";
import { decodeImageDataUrl, sniffImage, type ImageInfo } from "./imageinfo";
import { youcamMode } from "./mode";
import { normalizeAnalysis, resizeImageSource } from "./normalize";
import { buildRender } from "./render";
import { replayAnalysis, replayMakeup, replaySimulation } from "./replay";

export const MAX_IMAGE_BYTES = 10 * 1024 * 1024;

/** Docs: HD needs a short side of at least 1080 px, SD at least 480 px. Checked locally so a refusal is free. */
const MIN_SHORT_SIDE: Record<Engine, number> = { hd: 1080, sd: 480 };

const MASK_DOWNLOAD_CONCURRENCY = 6;

export interface ServiceDeps {
  env: () => Record<string, string | undefined>;
  /** Builds a client that reports paid submits through `onCharge`. Throws a YouCamError when no key is set. */
  createClient: (onCharge?: (event: ChargeEvent) => void) => YouCamClient;
  guard: BudgetGuard;
  ledger?: (entry: LedgerEntry) => void;
  /**
   * False on a deployment that only serves recorded faces (no API key, or YOUCAM_MODE=replay): paid calls are refused
   * with the "reserved for judges" line before the guard is consulted, and status says replay_only. Default: true.
   */
  liveEnabled?: () => boolean;
}

export interface AnalysisInput extends AnalysisRequest {
  /** Not in the contract yet (proposed): "sd" is the cheaper engine for budget-limited sessions. */
  engine?: Engine;
}

/**
 * Live responses carry the YouCam tasks they created as opaque signed tokens, so the browser can ask for them to be
 * deleted when the visitor leaves (cleanup below). Proposed contract fields: AnalysisResponse.taskIds and RenderResult.taskIds.
 */
export type WithTasks<T> = T & { taskIds?: string[] };

export interface CleanupResult {
  /** Tasks YouCam confirmed deleted. */
  deleted: number;
  /** Tokens that were not ours, or deletes YouCam refused or could not be reached for. */
  failed: number;
}

export interface YouCamService {
  analysis(body: AnalysisInput, accessCode: string | null): Promise<WithTasks<AnalysisResponse>>;
  makeup(body: MakeupRequest, accessCode: string | null): Promise<WithTasks<RenderResponse>>;
  simulate(body: SimulateRequest, accessCode: string | null): Promise<WithTasks<RenderResponse>>;
  status(accessCode: string | null): Promise<StatusResponse>;
  /** Deletes the YouCam tasks (and their files and outputs) a session created. Free; needs a configured access code. */
  cleanup(tokens: string[], accessCode: string | null): Promise<CleanupResult>;
  /** True for a configured access code (constant-time compare). Lets routes count wrong guesses. */
  acceptsCode(accessCode: string | null): boolean;
}

/** Decoded and checked upload: JPEG or PNG, at most 10 MB, with a readable header. */
export function readUpload(image: string): { bytes: Uint8Array; info: ImageInfo } {
  const tooBig = () => new YouCamError("exceed_max_filesize", "That photo is too big. Please use one under 10 MB.", 413);
  if (image.length > Math.ceil((MAX_IMAGE_BYTES * 4) / 3) + 128) throw tooBig();
  const bytes = decodeImageDataUrl(image);
  const info = bytes ? sniffImage(bytes) : null;
  if (!bytes || !info) {
    throw new YouCamError("unsupported_image", "Please use a JPEG or PNG photo.", 415);
  }
  if (bytes.length > MAX_IMAGE_BYTES) throw tooBig();
  return { bytes, info };
}

async function mapPool<T, R>(items: T[], limit: number, fn: (item: T) => Promise<R>): Promise<R[]> {
  const results = new Array<R>(items.length);
  let next = 0;
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (next < items.length) {
      const index = next++;
      results[index] = await fn(items[index]);
    }
  });
  await Promise.all(workers);
  return results;
}

export function createService(deps: ServiceDeps): YouCamService {
  const ledger = deps.ledger ?? writeLedger;
  // On unless explicitly "0": deleting at the end of a session is what the privacy line promises.
  const deleteTasks = () => deps.env().YOUCAM_DELETE_TASKS !== "0";
  const secret = () => deps.env().YOUCAM_API_KEY ?? "";
  const liveEnabled = deps.liveEnabled ?? (() => true);

  async function gate(code: string | null, kind: GuardKind, cost: number): Promise<Extract<Decision, { ok: true }>> {
    if (!liveEnabled()) throw liveReservedError();
    const decision = await deps.guard.decide(code, kind, { cost, reserve: true });
    if (!decision.ok) throw gateError(decision.reason);
    return decision;
  }

  /**
   * Runs one paid operation: client wiring, ledger, daily-slot release. The tasks it created come back as signed tokens
   * (not deleted here: deleting a task also removes its input file, which later renders of the session still use).
   */
  async function paid<T extends object>(
    decision: Extract<Decision, { ok: true }>,
    run: (client: YouCamClient, track: (taskId: string) => void) => Promise<T>,
  ): Promise<WithTasks<T>> {
    let submitted = false;
    const tasks: string[] = [];
    try {
      const client = deps.createClient((event) => {
        submitted = true;
        deps.guard.noteSpend(event.units);
        ledger({ action: event.action, units: event.units, codeHash: decision.codeHash, maybe: event.maybe });
      });
      const value = await run(client, (id) => tasks.push(id));
      return deleteTasks() && tasks.length > 0 ? { ...value, taskIds: tasks.map((id) => signTaskId(secret(), id)) } : value;
    } catch (error) {
      if (!submitted) decision.release();
      throw error;
    }
  }

  async function liveAnalysis(body: AnalysisInput, code: string | null): Promise<AnalysisResponse> {
    if (!liveEnabled()) throw liveReservedError();
    const upload = readUpload(body.image ?? "");
    const engine: Engine = body.engine ?? (deps.env().YOUCAM_ENGINE === "sd" ? "sd" : "hd");
    if (Math.min(upload.info.width, upload.info.height) < MIN_SHORT_SIDE[engine]) {
      throw engineError("error_below_min_image_size");
    }
    const units = analysisUnits(engine, HD_ACTIONS.length);
    const decision = await gate(code, "analysis", units);

    return paid(decision, async (client, track) => {
      const input: Size2 = { width: upload.info.width, height: upload.info.height };
      const fileId = await client.upload(upload.bytes, upload.info.mime);
      const run = await client.skinAnalysis(fileId, engine);
      track(run.taskId);

      // The analysed image (`resize_image`) defines the frame. Fall back to the input size if it is unreadable.
      const resizeSource = resizeImageSource(run.output);
      const frame: Size2 = await (resizeSource ? client.download(resizeSource) : Promise.reject(new Error("none")))
        .then((image) => ({ width: image.width, height: image.height }))
        .catch(() => input);

      const { analysis, maskSources } = normalizeAnalysis(run.output, engine, frame);
      const masks: Record<string, string> = {};
      const failed = new Set<string>();
      await mapPool(Object.entries(maskSources), MASK_DOWNLOAD_CONCURRENCY, async ([ref, url]) => {
        try {
          masks[ref] = (await client.download(url)).dataUrl;
        } catch {
          failed.add(ref); // keep the paid analysis; a concern without a mask is reported as unmeasured
        }
      });
      for (const result of analysis.results) if (result.maskRef && failed.has(result.maskRef)) result.maskRef = null;

      return { fileRef: liveFileRef(fileId, input), analysis, masks, unitsCharged: run.units, source: "live" as const };
    });
  }

  return {
    async analysis(body, code) {
      if (body.persona !== undefined) return replayAnalysis(body.persona, body.engine);
      return liveAnalysis(body, code);
    },

    async makeup(body, code) {
      const ref = parseFileRef(body.fileRef);
      if (!ref) throw new YouCamError("invalid_request", "That photo reference isn't valid. Please start again.", 400);
      if (ref.kind === "persona") return replayMakeup(ref.id, body.effects);

      const decision = await gate(code, "render", MAKEUP_UNITS);
      return paid(decision, async (client, track) => {
        const run = await client.makeup(ref.fileId, body.effects);
        track(run.taskId);
        const image = await client.download(run.url);
        return buildRender("makeup", image, ref.frame, run.units, "live");
      });
    },

    async simulate(body, code) {
      const ref = parseFileRef(body.fileRef);
      if (!ref) throw new YouCamError("invalid_request", "That photo reference isn't valid. Please start again.", 400);
      if (ref.kind === "persona") return replaySimulation(ref.id, body.strengths);

      const active = Object.values(body.strengths).filter((value) => typeof value === "number" && value > 0).length;
      const decision = await gate(code, "render", simulationUnits(active));
      return paid(decision, async (client, track) => {
        const run = await client.simulate(ref.fileId, body.strengths);
        track(run.taskId);
        const image = await client.download(run.url);
        return buildRender("simulation", image, ref.frame, run.units, "live");
      });
    },

    async cleanup(tokens, code) {
      if (!deleteTasks() || !deps.guard.accepts(code)) return { deleted: 0, failed: 0 };
      const verified = tokens.map((token) => verifyTaskToken(secret(), token));
      const mine = [...new Set(verified.filter((id): id is string => id !== null))];
      const foreign = verified.filter((id) => id === null).length;
      let client: YouCamClient;
      try {
        client = deps.createClient();
      } catch {
        return { deleted: 0, failed: mine.length + foreign };
      }
      const results = await Promise.allSettled(mine.map((id) => client.deleteTask(id)));
      const deleted = results.filter((r) => r.status === "fulfilled" && r.value).length;
      return { deleted, failed: foreign + mine.length - deleted };
    },

    acceptsCode: (code) => deps.guard.accepts(code),

    async status(code) {
      if (!liveEnabled()) return { live: false, reason: "replay_only" };
      const decision = await deps.guard.decide(code, "analysis", {
        cost: analysisUnits("hd", HD_ACTIONS.length),
        reserve: false,
      });
      return decision.ok ? { live: true } : { live: false, reason: decision.reason };
    },
  };
}

// ---------- production wiring ----------

function createDefaultService(): YouCamService {
  const env = () => process.env;
  const createClient = (onCharge?: (event: ChargeEvent) => void) => {
    const apiKey = env().YOUCAM_API_KEY;
    if (!apiKey) {
      throw new YouCamError("live_unavailable", "Live analysis isn't set up on this deployment. Try a demo face.", 503);
    }
    return createYouCamClient({ apiKey, onCharge });
  };
  const guard = createBudgetGuard({
    config: () => configFromEnv(env()),
    getBalance: () => createClient().credit(),
  });
  // No key (or YOUCAM_MODE=replay) means live can never run: the service answers from recordings only.
  return createService({ env, createClient, guard, liveEnabled: () => youcamMode(env()) === "live" });
}

let service: YouCamService | undefined;

export function getService(): YouCamService {
  service ??= createDefaultService();
  return service;
}
