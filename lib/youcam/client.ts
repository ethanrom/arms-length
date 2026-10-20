// Server-side YouCam S2S client: upload, submit, poll, download. Keys never leave this module.
// `import "server-only"` is not used because the package is not installed (and cannot be added by this
// module's owner) and Vitest cannot resolve it; the runtime check below plus node:crypto/fs use elsewhere
// in lib/youcam keep it out of the client bundle.
import JSONbig from "json-bigint";
import { HD_ACTIONS, SD_ACTIONS } from "@/lib/contracts";
import type { MakeupEffect, SimulationStrengths } from "@/lib/contracts";
import { MAKEUP_UNITS, analysisUnits, simulationUnits, type Engine } from "./costs";
import { YouCamError, engineError, httpError, networkError, timeoutError } from "./errors";
import { sniffImage, toDataUrl, type ImageMime } from "./imageinfo";

if (typeof window !== "undefined") throw new Error("lib/youcam/client is server-only");

export const YOUCAM_HOST = "https://yce-api-01.makeupar.com";

// Parse ids bigint-safe: ids in the credit endpoints exceed 2^53. storeAsString also turns any numeric
// literal over 15 characters into a string (raw_score 52.43487358093262), so scores are coerced with Number().
const JSONB = JSONbig({ storeAsString: true });

const MAX_DOWNLOAD_BYTES = 25 * 1024 * 1024;

/** Emitted when a paid task has been accepted (units are debited at submit) or may have been (`maybe`). */
export interface ChargeEvent {
  action: string;
  units: number;
  /** True when the submit outcome is unknown (network error, 5xx): the task may exist and be charged. */
  maybe: boolean;
}

export interface ClientOptions {
  apiKey: string;
  baseUrl?: string;
  /** Injected in tests. Defaults to global fetch. */
  fetch?: typeof fetch;
  sleep?: (ms: number) => Promise<void>;
  onCharge?: (event: ChargeEvent) => void;
  /** Delay before the first poll (the spike saw HD analysis finish in under 7 s, VTO in under 8 s). */
  pollInitialDelayMs?: number;
  pollIntervalMs?: number;
  pollTimeoutMs?: number;
  /** Retries for 429 (all calls) and for 5xx/network errors (free calls only). */
  maxRetries?: number;
  requestTimeoutMs?: number;
}

export interface TaskResult {
  taskId: string;
  results: Record<string, unknown>;
}

export interface DownloadedImage {
  bytes: Uint8Array;
  mime: ImageMime;
  width: number;
  height: number;
  dataUrl: string;
}

export interface YouCamClient {
  /** Uploads bytes and returns the YouCam file_id. */
  upload(bytes: Uint8Array, contentType: string): Promise<string>;
  /** Submits a task and polls it to completion. `charge` is reported to `onCharge` once the submit is accepted. */
  runTask(slug: string, version: string, body: unknown, charge?: { action: string; units: number }): Promise<TaskResult>;
  skinAnalysis(fileId: string, engine: Engine): Promise<{ taskId: string; output: unknown[]; units: number }>;
  makeup(fileId: string, effects: MakeupEffect[]): Promise<{ taskId: string; url: string; units: number }>;
  simulate(fileId: string, strengths: SimulationStrengths): Promise<{ taskId: string; url: string; units: number }>;
  /** Best effort. The request schema is not in the OpenAPI files we have; failures are swallowed. */
  deleteTask(taskId: string): Promise<boolean>;
  /** Downloads a presigned result URL (valid 2 h) without credentials. */
  download(url: string): Promise<DownloadedImage>;
  /** Remaining units across all unexpired tokens. Free. */
  credit(): Promise<number>;
}

type Obj = Record<string, unknown>;
const obj = (value: unknown): Obj => (value && typeof value === "object" ? (value as Obj) : {});

/** A skin_smooth effect at 0 makes a no-makeup render bit-identical to the input (spike.md section 9). */
export function withSkinSmoothZero(effects: MakeupEffect[]): MakeupEffect[] {
  if (effects.some((effect) => effect.category === "skin_smooth")) return effects;
  return [{ category: "skin_smooth", skinSmoothStrength: 0, skinSmoothColorIntensity: 0 }, ...effects];
}

export function createYouCamClient(options: ClientOptions): YouCamClient {
  const fetchImpl = options.fetch ?? fetch;
  const base = options.baseUrl ?? YOUCAM_HOST;
  const sleep = options.sleep ?? ((ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms)));
  const maxRetries = options.maxRetries ?? 3;
  const requestTimeoutMs = options.requestTimeoutMs ?? 30_000;
  const pollInitialDelayMs = options.pollInitialDelayMs ?? 1_000;
  const pollIntervalMs = options.pollIntervalMs ?? 1_500;
  const pollTimeoutMs = options.pollTimeoutMs ?? 60_000;
  const auth = { Authorization: `Bearer ${options.apiKey}` };

  const backoff = (attempt: number) => Math.min(8_000, 500 * 2 ** attempt) + Math.floor(Math.random() * 250);
  const retryAfterMs = (res: Response) => {
    const seconds = Number(res.headers.get("retry-after"));
    return Number.isFinite(seconds) && seconds > 0 ? Math.min(10_000, seconds * 1000) : undefined;
  };

  /**
   * `safe` calls are free and idempotent (GET, upload, PUT): retried on 429, 5xx and network errors.
   * Task submits are not: a lost response can still mean a charged task, so only an explicit 429
   * (request rejected) is retried. 400 and 401 are never retried.
   */
  async function send(url: string, init: RequestInit, safe: boolean): Promise<Response> {
    for (let attempt = 0; ; attempt++) {
      let res: Response;
      try {
        res = await fetchImpl(url, { ...init, signal: AbortSignal.timeout(requestTimeoutMs) });
      } catch (cause) {
        if (safe && attempt < maxRetries) {
          await sleep(backoff(attempt));
          continue;
        }
        throw networkError(cause);
      }
      const retryable = res.status === 429 || (safe && res.status >= 500);
      if (retryable && attempt < maxRetries) {
        await res.arrayBuffer().catch(() => undefined);
        await sleep(retryAfterMs(res) ?? backoff(attempt));
        continue;
      }
      return res;
    }
  }

  async function api(method: "GET" | "POST", path: string, body: unknown, safe: boolean): Promise<Obj> {
    const res = await send(
      base + path,
      {
        method,
        headers: { ...auth, ...(body === undefined ? {} : { "Content-Type": "application/json" }) },
        body: body === undefined ? undefined : JSON.stringify(body),
      },
      safe,
    );
    const text = await res.text();
    let json: unknown;
    try {
      json = JSONB.parse(text);
    } catch {
      json = {};
    }
    if (!res.ok) throw httpError(res.status, json);
    return obj(json);
  }

  async function upload(bytes: Uint8Array, contentType: string): Promise<string> {
    const ext = contentType === "image/png" ? "png" : "jpg";
    const meta = await api(
      "POST",
      "/s2s/v2.0/file",
      { files: [{ content_type: contentType, file_name: `upload.${ext}`, file_size: bytes.length }] },
      true,
    );
    const files = obj(meta.data).files;
    const file = obj(Array.isArray(files) ? files[0] : undefined);
    const fileId = file.file_id;
    const put = obj(Array.isArray(file.requests) ? file.requests[0] : undefined);
    if (typeof fileId !== "string" || typeof put.url !== "string") {
      throw new YouCamError("bad_response", "The analysis service sent an unexpected reply. Please try again.", 502, "upload");
    }
    // Content-Length is part of the signed headers but fetch sets it from the body; sending our own can break the PUT.
    const headers: Record<string, string> = {};
    for (const [key, value] of Object.entries(obj(put.headers))) {
      if (key.toLowerCase() !== "content-length") headers[key] = String(value);
    }
    const res = await send(
      put.url,
      { method: typeof put.method === "string" ? put.method : "PUT", headers, body: bytes as unknown as BodyInit },
      true,
    );
    if (!res.ok) {
      await res.arrayBuffer().catch(() => undefined);
      throw new YouCamError("upload_failed", "We couldn't upload that photo. Please try again.", 502, `put:${res.status}`);
    }
    return fileId;
  }

  async function runTask(
    slug: string,
    version: string,
    body: unknown,
    charge?: { action: string; units: number },
  ): Promise<TaskResult> {
    const path = `/s2s/${version}/task/${slug}`;
    let submit: Obj;
    try {
      submit = await api("POST", path, body, false);
    } catch (error) {
      // Network error or 5xx on a submit: the task may exist and be charged. Never resubmit automatically.
      const ambiguous =
        error instanceof YouCamError && ["network", "upstream_error", "timeout"].includes(error.code);
      if (ambiguous && charge) options.onCharge?.({ ...charge, maybe: true });
      if (ambiguous) {
        throw new YouCamError(
          error.code,
          "We lost the connection while starting that, so we didn't retry. Please try again in a moment.",
          502,
          "submit unconfirmed",
        );
      }
      throw error;
    }
    const taskId = obj(submit.data).task_id;
    if (typeof taskId !== "string" || !taskId) {
      if (charge) options.onCharge?.({ ...charge, maybe: true }); // accepted (HTTP 200) but we cannot track it
      throw new YouCamError("bad_response", "The analysis service sent an unexpected reply. Please try again.", 502, "submit");
    }
    if (charge) options.onCharge?.({ ...charge, maybe: false });

    const started = Date.now();
    let waited = pollInitialDelayMs;
    await sleep(pollInitialDelayMs);
    for (;;) {
      const poll = await api("GET", `${path}/${encodeURIComponent(taskId)}`, undefined, true);
      const data = obj(poll.data);
      if (data.task_status === "success") return { taskId, results: obj(data.results) };
      if (data.task_status === "error") throw engineError(data.error, data.error_message);
      if (Math.max(waited, Date.now() - started) >= pollTimeoutMs) throw timeoutError(`poll:${String(data.task_status)}`);
      await sleep(pollIntervalMs);
      waited += pollIntervalMs;
    }
  }

  const resultUrl = (results: Obj): string => {
    if (typeof results.url !== "string") {
      throw new YouCamError("bad_response", "The analysis service sent an unexpected reply. Please try again.", 502, "no url");
    }
    return results.url;
  };

  return {
    upload,
    runTask,

    async skinAnalysis(fileId, engine) {
      const actions = engine === "hd" ? HD_ACTIONS : SD_ACTIONS;
      const units = analysisUnits(engine, actions.length);
      const { taskId, results } = await runTask(
        "skin-analysis",
        "v2.1",
        { src_file_id: fileId, dst_actions: actions, format: "json" },
        { action: `skin_analysis_${engine}`, units },
      );
      if (!Array.isArray(results.output)) {
        throw new YouCamError("bad_response", "The analysis service sent an unexpected reply. Please try again.", 502, "no output");
      }
      return { taskId, output: results.output, units };
    },

    async makeup(fileId, effects) {
      const { taskId, results } = await runTask(
        "makeup-vto",
        "v2.0",
        { src_file_id: fileId, version: "1.0", effects: withSkinSmoothZero(effects) },
        { action: "makeup_vto", units: MAKEUP_UNITS },
      );
      return { taskId, url: resultUrl(results), units: MAKEUP_UNITS };
    },

    async simulate(fileId, strengths) {
      // Zero strengths are dropped: billing counts the concerns sent, and "not all zero" is a hard rule.
      const active = Object.entries(strengths).filter(([, value]) => typeof value === "number" && value > 0);
      if (active.length === 0) {
        throw new YouCamError("invalid_request", "Choose at least one change to preview.", 400);
      }
      const units = simulationUnits(active.length);
      const { taskId, results } = await runTask(
        "skin-simulation",
        "v2.0",
        { src_file_id: fileId, ...Object.fromEntries(active) },
        { action: "skin_simulation", units },
      );
      return { taskId, url: resultUrl(results), units };
    },

    async deleteTask(taskId) {
      try {
        await api("POST", "/s2s/v2.0/task/delete", { task_ids: [taskId] }, false);
        return true;
      } catch {
        return false;
      }
    },

    async download(url) {
      if (!url.startsWith("https://")) {
        throw new YouCamError("bad_response", "The analysis service sent an unexpected reply. Please try again.", 502, "url scheme");
      }
      // No Authorization header: the URL is presigned and S3 rejects a second auth mechanism.
      const res = await send(url, { method: "GET" }, true);
      if (!res.ok) {
        await res.arrayBuffer().catch(() => undefined);
        throw new YouCamError("download_failed", "We couldn't fetch the result. Please try again.", 502, `get:${res.status}`);
      }
      const bytes = new Uint8Array(await res.arrayBuffer());
      const info = bytes.length <= MAX_DOWNLOAD_BYTES ? sniffImage(bytes) : null;
      if (!info) {
        throw new YouCamError("download_failed", "We couldn't fetch the result. Please try again.", 502, "not an image");
      }
      return { bytes, ...info, dataUrl: toDataUrl(bytes, info.mime) };
    },

    async credit() {
      const json = await api("GET", "/s2s/v1.0/client/credit", undefined, true);
      const tokens = Array.isArray(json.results) ? json.results : [];
      const now = Date.now();
      let total = 0;
      for (const token of tokens) {
        const t = obj(token);
        const expiry = Number(t.expiry);
        if (Number.isFinite(expiry) && expiry > 0 && expiry < now) continue;
        const amount = Number(t.amount_dec ?? t.amount);
        if (Number.isFinite(amount)) total += amount;
      }
      return total;
    },
  };
}
