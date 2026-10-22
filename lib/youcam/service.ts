// The API operations behind app/api/youcam/*: replay for demo personas, guarded live calls otherwise. A live call runs as
// one of three callers, in this order: an own YouCam key (their units, so no project floor or caps), an access code, or
// nobody on an open deployment (project units, with the caps and the floor).
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
import { signTaskId, taskTokenSecret, verifyTaskToken } from "./tasktokens";
import { decodeImageDataUrl, sniffImage, type ImageInfo } from "./imageinfo";
import { byokAllowed, replayUploadsEnabled, youcamMode } from "./mode";
import { normalizeAnalysis, resizeImageSource } from "./normalize";
import { buildRender } from "./render";
import { replayAnalysis, replayMakeup, replaySimulation } from "./replay";

export const MAX_IMAGE_BYTES = 10 * 1024 * 1024;

/** Docs: HD needs a short side of at least 1080 px, SD at least 480 px. Checked locally so a refusal is free. */
const MIN_SHORT_SIDE: Record<Engine, number> = { hd: 1080, sd: 480 };

const MASK_DOWNLOAD_CONCURRENCY = 6;

/** credit() failures that mean "try again", not "that key is wrong". */
const UNRELATED_TO_KEY = new Set(["network", "timeout", "busy"]);

/** Who is calling. `apiKey` is the caller's own YouCam key: used for this request's YouCam calls and nothing else. */
export interface Auth {
  code: string | null;
  apiKey?: string | null;
  ip: string;
}

export interface ServiceDeps {
  env: () => Record<string, string | undefined>;
  /**
   * Builds a client that reports paid submits through `onCharge`, on `apiKey` when given, else the project key (a
   * YouCamError when none is set).
   */
  createClient: (onCharge?: (event: ChargeEvent) => void, apiKey?: string) => YouCamClient;
  guard: BudgetGuard;
  ledger?: (entry: LedgerEntry) => void;
  /**
   * False on a deployment that only serves recorded faces (no API key, or YOUCAM_MODE=replay): paid calls on the project
   * key are refused with the "reserved" line before the guard is consulted, and status says replay_only. Default: true.
   */
  liveEnabled?: () => boolean;
  /** Whether a caller's own key may be used: true everywhere except a deployment forced to recordings. Default: true. */
  byokEnabled?: () => boolean;
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
  analysis(body: AnalysisInput, auth: Auth): Promise<WithTasks<AnalysisResponse>>;
  makeup(body: MakeupRequest, auth: Auth): Promise<WithTasks<RenderResponse>>;
  simulate(body: SimulateRequest, auth: Auth): Promise<WithTasks<RenderResponse>>;
  /** Own key: validated with one free credit() call (keyOk). Otherwise whether the project key may be used by this caller. */
  status(auth: Auth): Promise<StatusResponse>;
  /**
   * Deletes the YouCam tasks (and their files and outputs) a session created. Free. Needs an own key (deleted with that
   * key), a configured access code or an open deployment (deleted with the project key), and a token secret.
   */
  cleanup(tokens: string[], auth: Auth): Promise<CleanupResult>;
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
  // Empty when neither TASK_TOKEN_SECRET nor the project key is set: then no token is issued and cleanup is refused.
  const secret = () => taskTokenSecret(deps.env());
  const liveEnabled = deps.liveEnabled ?? (() => true);
  const byokEnabled = deps.byokEnabled ?? (() => true);
  const canGoLive = (auth: Auth) => (auth.apiKey ? byokEnabled() : liveEnabled());

  async function gate(auth: Auth, kind: GuardKind, cost: number): Promise<Extract<Decision, { ok: true }>> {
    if (!canGoLive(auth)) throw liveReservedError();
    if (auth.apiKey) {
      // Their units, so no floor, balance or caps; only the kill switch still applies.
      if (deps.guard.killed()) throw gateError("kill_switch");
      return { ok: true, who: "byok", release: () => undefined };
    }
    const decision = await deps.guard.decide(auth.code, kind, { cost, reserve: true, ip: auth.ip });
    if (!decision.ok) throw gateError(decision.reason, !auth.code && deps.guard.isOpen());
    return decision;
  }

  /** What an own-key caller is told when YouCam turns their key or their balance away (the project's wording would mislead). */
  function ownKeyError(error: unknown): unknown {
    if (!(error instanceof YouCamError)) return error;
    if (error.code === "upstream_auth") return gateError("invalid_key");
    if (error.code === "service_paused") {
      return new YouCamError("no_credit", "That YouCam account has no credits left for this. Try another key, or use a demo face.", 402, error.detail);
    }
    return error;
  }

  /**
   * Runs one paid operation: client wiring, ledger, daily-slot release. The tasks it created come back as signed tokens
   * (not deleted here: deleting a task also removes its input file, which later renders of the session still use).
   */
  async function paid<T extends object>(
    decision: Extract<Decision, { ok: true }>,
    auth: Auth,
    run: (client: YouCamClient, track: (taskId: string) => void) => Promise<T>,
  ): Promise<WithTasks<T>> {
    let submitted = false;
    const tasks: string[] = [];
    try {
      const client = deps.createClient((event) => {
        submitted = true;
        if (!auth.apiKey) deps.guard.noteSpend(event.units); // an own key does not move the project's balance
        ledger({ action: event.action, units: event.units, who: decision.who, maybe: event.maybe });
      }, auth.apiKey ?? undefined);
      const value = await run(client, (id) => tasks.push(id));
      const key = secret();
      return deleteTasks() && key && tasks.length > 0 ? { ...value, taskIds: tasks.map((id) => signTaskId(key, id)) } : value;
    } catch (error) {
      if (!submitted) decision.release();
      throw auth.apiKey ? ownKeyError(error) : error;
    }
  }

  async function liveAnalysis(body: AnalysisInput, auth: Auth): Promise<AnalysisResponse> {
    if (!canGoLive(auth)) throw liveReservedError();
    const upload = readUpload(body.image ?? "");
    const engine: Engine = body.engine ?? (deps.env().YOUCAM_ENGINE === "sd" ? "sd" : "hd");
    if (Math.min(upload.info.width, upload.info.height) < MIN_SHORT_SIDE[engine]) {
      throw engineError("error_below_min_image_size");
    }
    const units = analysisUnits(engine, HD_ACTIONS.length);
    const decision = await gate(auth, "analysis", units);

    return paid(decision, auth, async (client, track) => {
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
    async analysis(body, auth) {
      if (body.persona !== undefined) return replayAnalysis(body.persona, body.engine);
      return liveAnalysis(body, auth);
    },

    async makeup(body, auth) {
      const ref = parseFileRef(body.fileRef);
      if (!ref) throw new YouCamError("invalid_request", "That photo reference isn't valid. Please start again.", 400);
      if (ref.kind === "persona") return replayMakeup(ref.id, body.effects);

      const decision = await gate(auth, "render", MAKEUP_UNITS);
      return paid(decision, auth, async (client, track) => {
        const run = await client.makeup(ref.fileId, body.effects);
        track(run.taskId);
        const image = await client.download(run.url);
        return buildRender("makeup", image, ref.frame, run.units, "live");
      });
    },

    async simulate(body, auth) {
      const ref = parseFileRef(body.fileRef);
      if (!ref) throw new YouCamError("invalid_request", "That photo reference isn't valid. Please start again.", 400);
      if (ref.kind === "persona") return replaySimulation(ref.id, body.strengths);

      const active = Object.values(body.strengths).filter((value) => typeof value === "number" && value > 0).length;
      const decision = await gate(auth, "render", simulationUnits(active));
      return paid(decision, auth, async (client, track) => {
        const run = await client.simulate(ref.fileId, body.strengths);
        track(run.taskId);
        const image = await client.download(run.url);
        return buildRender("simulation", image, ref.frame, run.units, "live");
      });
    },

    async cleanup(tokens, auth) {
      const key = secret();
      if (!deleteTasks() || !key) return { deleted: 0, failed: 0 };
      // Free, so the budget and the kill switch do not apply; but the caller must be one a live session could have been.
      const allowed = auth.apiKey ? byokEnabled() : auth.code ? deps.guard.accepts(auth.code) : deps.guard.isOpen();
      if (!allowed) return { deleted: 0, failed: 0 };
      const verified = tokens.map((token) => verifyTaskToken(key, token));
      const mine = [...new Set(verified.filter((id): id is string => id !== null))];
      const foreign = verified.filter((id) => id === null).length;
      let client: YouCamClient;
      try {
        client = deps.createClient(undefined, auth.apiKey ?? undefined);
      } catch {
        return { deleted: 0, failed: mine.length + foreign };
      }
      const results = await Promise.allSettled(mine.map((id) => client.deleteTask(id)));
      const deleted = results.filter((r) => r.status === "fulfilled" && r.value).length;
      return { deleted, failed: foreign + mine.length - deleted };
    },

    acceptsCode: (code) => deps.guard.accepts(code),

    async status(auth) {
      // A photo is accepted when live is allowed for this caller, or in replay mode when REPLAY_UPLOADS=1 (dev and e2e).
      if (!canGoLive(auth)) return { live: false, reason: "replay_only", uploadsAllowed: replayUploadsEnabled(deps.env()) };
      if (auth.apiKey) {
        if (deps.guard.killed()) return { live: false, reason: "kill_switch", byok: true, uploadsAllowed: false };
        try {
          await deps.createClient(undefined, auth.apiKey).credit(); // free; the balance itself is never reported
          return { live: true, byok: true, keyOk: true, uploadsAllowed: true };
        } catch (error) {
          // A refused key is an answer, not a failure, and not a strike. A failure that says nothing about the key is neither.
          if (error instanceof YouCamError && UNRELATED_TO_KEY.has(error.code)) throw error;
          return { live: false, reason: "invalid_key", byok: true, keyOk: false, uploadsAllowed: false };
        }
      }
      const open = !auth.code && deps.guard.isOpen();
      const decision = await deps.guard.decide(auth.code, "analysis", {
        cost: analysisUnits("hd", HD_ACTIONS.length),
        reserve: false,
        ip: auth.ip,
      });
      if (!decision.ok) return { live: false, reason: decision.reason, ...(open ? { open } : {}), uploadsAllowed: false };
      return { live: true, ...(decision.who === "open" ? { open: true } : {}), uploadsAllowed: true };
    },
  };
}

// ---------- production wiring ----------

function createDefaultService(): YouCamService {
  const env = () => process.env;
  const createClient = (onCharge?: (event: ChargeEvent) => void, ownKey?: string) => {
    const apiKey = ownKey ?? env().YOUCAM_API_KEY;
    if (!apiKey) {
      throw new YouCamError("live_unavailable", "Live analysis isn't set up on this deployment. Try a demo face.", 503);
    }
    return createYouCamClient({ apiKey, onCharge });
  };
  const guard = createBudgetGuard({
    config: () => configFromEnv(env()),
    getBalance: () => createClient().credit(),
  });
  // No project key (or YOUCAM_MODE=replay) means the project's units can never be spent: that path answers from recordings
  // only. An own key needs no project key; only YOUCAM_MODE=replay turns it away.
  return createService({
    env,
    createClient,
    guard,
    liveEnabled: () => youcamMode(env()) === "live",
    byokEnabled: () => byokAllowed(env()),
  });
}

let service: YouCamService | undefined;

export function getService(): YouCamService {
  service ??= createDefaultService();
  return service;
}
