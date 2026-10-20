// Request guards for POST /api/visibility: where masks may be fetched from, per-IP rate limit, concurrency cap.
// All in-memory and best effort: on a serverless host every instance counts separately.
import { VisibilityError } from "./errors";

/**
 * YouCam serves result files from S3 (presigned `https://yce-us.s3-accelerate.amazonaws.com/...`, 2 h expiry; spike.md
 * section 8). Only S3 hosts under amazonaws.com qualify: other amazonaws.com names (EC2 public DNS) can resolve to
 * private addresses from inside a VPC.
 */
const S3_HOST = /^(?:[a-z0-9][a-z0-9.-]*\.)?s3(?:[.-][a-z0-9-]+)*\.amazonaws\.com$/;

export function isYouCamResultUrl(raw: string): boolean {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return false;
  }
  return url.protocol === "https:" && !url.username && !url.password && (url.port === "" || url.port === "443") && S3_HOST.test(url.hostname);
}

/** True for anything that looks like an absolute URL (so a relative fixture path is not one). */
export function isAbsoluteUrl(raw: string): boolean {
  return /^[a-z][a-z0-9+.-]*:/i.test(raw.trim());
}

const MAX_MASK_BYTES = 3_000_000;
const FETCH_TIMEOUT_MS = 10_000;

const EXPIRED =
  "We couldn't download one of the mask files. YouCam result links last 2 hours; send the masks in the \"masks\" field " +
  "(data URLs keyed by their URL in \"output\") instead.";

/** Downloads one mask from an allowed URL. No redirects (a redirect could leave the allowed host), size and time capped. */
export async function fetchMask(url: string, fetchImpl: typeof fetch = fetch): Promise<Uint8Array> {
  if (!isYouCamResultUrl(url)) throw new VisibilityError("mask_url_not_allowed", "Mask URLs must be https links to YouCam's result storage.", 400);
  let res: Response;
  try {
    res = await fetchImpl(url, { redirect: "manual", cache: "no-store", signal: AbortSignal.timeout(FETCH_TIMEOUT_MS) });
  } catch {
    throw new VisibilityError("mask_download_failed", EXPIRED, 422);
  }
  if (!res.ok) throw new VisibilityError("mask_download_failed", EXPIRED, 422);
  const declared = Number(res.headers.get("content-length"));
  if (Number.isFinite(declared) && declared > MAX_MASK_BYTES) throw new VisibilityError("mask_too_large", "A mask file is larger than expected.", 422);

  const chunks: Uint8Array[] = [];
  let size = 0;
  const reader = res.body?.getReader();
  if (!reader) throw new VisibilityError("mask_download_failed", EXPIRED, 422);
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > MAX_MASK_BYTES) {
      await reader.cancel();
      throw new VisibilityError("mask_too_large", "A mask file is larger than expected.", 422);
    }
    chunks.push(value);
  }
  return Buffer.concat(chunks);
}

// Per-IP fixed window.
export const RATE_LIMIT = { max: 20, windowMs: 10 * 60_000 } as const;
const MAX_TRACKED_IPS = 10_000;
const windows = new Map<string, { count: number; resetAt: number }>();

/** Client address as the host reports it. Spoofable off Vercel, hence "best effort". */
export function clientIp(request: Request): string {
  const forwarded = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  return forwarded || request.headers.get("x-real-ip")?.trim() || "unknown";
}

export function checkRateLimit(ip: string, now = Date.now()): void {
  if (windows.size >= MAX_TRACKED_IPS) {
    for (const [key, w] of windows) if (w.resetAt <= now) windows.delete(key);
    if (windows.size >= MAX_TRACKED_IPS) windows.delete(windows.keys().next().value as string);
  }
  const current = windows.get(ip);
  if (!current || current.resetAt <= now) {
    windows.set(ip, { count: 1, resetAt: now + RATE_LIMIT.windowMs });
    return;
  }
  if (current.count >= RATE_LIMIT.max) {
    const wait = Math.max(1, Math.ceil((current.resetAt - now) / 1000));
    throw new VisibilityError(
      "rate_limited",
      `That's more than ${RATE_LIMIT.max} requests in ${RATE_LIMIT.windowMs / 60_000} minutes from one address. Please wait ${wait} seconds and try again.`,
      429,
      { "Retry-After": String(wait) },
    );
  }
  current.count++;
}

export function resetRateLimit(): void {
  windows.clear();
}

// Each request decodes up to ~25 masks and runs the full model: keep the number running at once small.
const MAX_IN_FLIGHT = 3;
let inFlight = 0;

export async function withSlot<T>(run: () => Promise<T>): Promise<T> {
  if (inFlight >= MAX_IN_FLIGHT) {
    throw new VisibilityError("busy", "The visibility layer is busy with other requests. Please try again in a few seconds.", 503, { "Retry-After": "5" });
  }
  inFlight++;
  try {
    return await run();
  } finally {
    inFlight--;
  }
}
