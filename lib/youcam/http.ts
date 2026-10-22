// HTTP plumbing shared by the route handlers: bounded JSON bodies, validation, per-address limits, ApiError responses.
// Never logs request bodies, image data or keys: every log line goes through redact().
import { ACCESS_HEADER, YOUCAM_KEY_HEADER } from "@/lib/contracts";
import type { ApiError } from "@/lib/contracts";
import type { z } from "zod";
import { YouCamError, rateLimitedError } from "./errors";
import { clientIp, createLimiter, type RateLimit } from "./ratelimit";

const NO_STORE = { "Cache-Control": "no-store" };

export function accessCode(request: Request): string | null {
  const value = request.headers.get(ACCESS_HEADER)?.trim();
  return value && value.length <= 200 ? value : null;
}

/** A caller's own YouCam key: printable ASCII with no spaces, at most 200 characters. Anything else is treated as absent. */
export function cleanYoucamKey(value: string | null | undefined): string | null {
  const trimmed = value?.trim();
  return trimmed && trimmed.length <= 200 && /^[!-~]+$/.test(trimmed) ? trimmed : null;
}

export function youcamKey(request: Request): string | null {
  return cleanYoucamKey(request.headers.get(YOUCAM_KEY_HEADER));
}

/**
 * Reads at most `maxBytes` of the body as UTF-8, refusing early on the declared length and again while streaming, so an
 * oversized or length-less (chunked) body never sits whole in memory.
 */
export async function readBoundedText(request: Request, maxBytes: number, tooBig: () => Error): Promise<string> {
  const declared = Number(request.headers.get("content-length"));
  if (Number.isFinite(declared) && declared > maxBytes) throw tooBig();
  const reader = request.body?.getReader();
  if (!reader) return "";
  const chunks: Uint8Array[] = [];
  let size = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > maxBytes) {
      await reader.cancel().catch(() => undefined);
      throw tooBig();
    }
    chunks.push(value);
  }
  return Buffer.concat(chunks).toString("utf8");
}

/** Reads and validates a JSON body, refusing anything over `maxBytes` before it is parsed. */
export async function readBody<S extends z.ZodType>(request: Request, schema: S, maxBytes: number): Promise<z.output<S>> {
  const tooBig = () =>
    new YouCamError("payload_too_large", "That upload is too large. Please use a smaller photo (under 3 MB).", 413);
  const text = await readBoundedText(request, maxBytes, tooBig);

  let json: unknown;
  try {
    json = JSON.parse(text);
  } catch {
    throw new YouCamError("bad_request", "That request wasn't in the expected format.", 400);
  }
  const parsed = schema.safeParse(json);
  if (!parsed.success) throw new YouCamError("bad_request", "That request wasn't in the expected format.", 400);
  return parsed.data;
}

// ---------- per-address limits ----------

const TEN_MINUTES = 10 * 60_000;

/** Requests per address per 10 minutes, by route. Replay answers are cheap; live ones are also capped by the budget guard. */
export const ROUTE_LIMITS = {
  status: { max: 60, windowMs: TEN_MINUTES },
  analysis: { max: 30, windowMs: TEN_MINUTES },
  // The lightest-touch search renders several makeup previews in one session.
  render: { max: 120, windowMs: TEN_MINUTES },
  cleanup: { max: 60, windowMs: TEN_MINUTES },
} as const satisfies Record<string, RateLimit>;

/** Wrong access codes per address. Once spent, requests that carry a code are refused; demo faces (no code) keep working. */
export const BAD_CODE_LIMIT = { max: 8, windowMs: TEN_MINUTES } as const satisfies RateLimit;

export type RouteBucket = keyof typeof ROUTE_LIMITS;

const limiters = {
  status: createLimiter(ROUTE_LIMITS.status),
  analysis: createLimiter(ROUTE_LIMITS.analysis),
  render: createLimiter(ROUTE_LIMITS.render),
  cleanup: createLimiter(ROUTE_LIMITS.cleanup),
};
const badCodes = createLimiter(BAD_CODE_LIMIT);

/** Who is calling, read from the request synchronously (before any try/catch, so a build-time bail-out is never swallowed). */
export interface Caller {
  ip: string;
  code: string | null;
  /** The caller's own YouCam key. Identity order is key, then code, then open, so a key drops any code sent with it. */
  apiKey: string | null;
}

export function callerOf(request: Request): Caller {
  const apiKey = youcamKey(request);
  return { ip: clientIp(request), code: apiKey ? null : accessCode(request), apiKey };
}

/** Counts the request against its route's limit; throws a 429 when the address is over it or has guessed too many codes. */
export function admit(caller: Caller, bucket: RouteBucket): void {
  const wait = limiters[bucket].hit(caller.ip);
  if (wait > 0) throw rateLimitedError(wait);
  assertCodeNotLocked(caller);
}

/** Refuses a request that carries an access code once its address has used up its wrong guesses. */
export function assertCodeNotLocked(caller: Caller): void {
  const locked = caller.code ? badCodes.wait(caller.ip) : 0;
  if (locked > 0) throw rateLimitedError(locked);
}

export function strikeBadCode(caller: Caller): void {
  badCodes.hit(caller.ip);
}

/** Test hook: forget every counter. */
export function resetRouteLimits(): void {
  for (const limiter of Object.values(limiters)) limiter.reset();
  badCodes.reset();
}

// ---------- log hygiene ----------

const MIN_SECRET_LENGTH = 4;

/**
 * Removes every given secret (raw, URL-encoded and JSON-escaped) and any "Bearer <token>" from text bound for a log, so an
 * upstream error that echoes a key back cannot leak it.
 */
export function redact(text: string, secrets: readonly (string | null | undefined)[]): string {
  let out = text.replace(/Bearer\s+[^\s"',;]+/gi, "Bearer [redacted]");
  for (const secret of secrets) {
    if (!secret || secret.length < MIN_SECRET_LENGTH) continue;
    for (const form of new Set([secret, encodeURIComponent(secret), JSON.stringify(secret).slice(1, -1)])) {
      out = out.split(form).join("[redacted]");
    }
  }
  return out;
}

/** Every key this server could be holding for a request: the caller's own, and the ones in its environment. */
function secretsFor(caller?: Caller): (string | null | undefined)[] {
  const { YOUCAM_API_KEY, YOUCAM_SECRET_KEY, TASK_TOKEN_SECRET } = process.env;
  return [caller?.apiKey, caller?.code, YOUCAM_API_KEY, YOUCAM_SECRET_KEY, TASK_TOKEN_SECRET];
}

// ---------- responses ----------

function errorBody(code: string, message: string): ApiError {
  return { error: { code, message } };
}

/**
 * Runs a handler and turns anything thrown into an ApiError response with a plain-language message. A refused access
 * code counts as a strike against `caller`'s address.
 */
export async function respond<T>(run: () => Promise<T>, caller?: Caller): Promise<Response> {
  try {
    return Response.json(await run(), { headers: NO_STORE });
  } catch (error) {
    if (error instanceof YouCamError) {
      // Only our own code and the upstream detail are logged, with every key scrubbed out.
      if (error.status >= 500) console.error(redact(`[youcam] ${error.code} ${error.detail ?? ""}`.trim(), secretsFor(caller)));
      if (caller && error.code === "bad_code") strikeBadCode(caller);
      const headers = error.retryAfterS ? { ...NO_STORE, "Retry-After": String(error.retryAfterS) } : NO_STORE;
      return Response.json(errorBody(error.code, error.message), { status: error.status, headers });
    }
    console.error(`[youcam] unhandled ${error instanceof Error ? error.name : typeof error}`);
    return Response.json(errorBody("internal", "Something went wrong on our side. Please try again."), {
      status: 500,
      headers: NO_STORE,
    });
  }
}
