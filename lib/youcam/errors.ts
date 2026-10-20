// Plain-language errors. `message` is safe to show to a user; raw API detail never leaves `detail`.
// Codes come from ai_skin_analysis.yaml (documented photo errors + EngineErrorCode), makeup_vto.yaml,
// and the HTTP error bodies (`error_code`: InvalidParameters, CreditInsufficiency, ...). Unknown codes are accepted.

export class YouCamError extends Error {
  /** Stable machine code, e.g. "error_src_face_too_small", "daily_cap", "timeout". */
  readonly code: string;
  /** HTTP status of our own response. */
  readonly status: number;
  /** Raw upstream detail for logs only. Never shown, never contains keys or image data. */
  readonly detail?: string;

  constructor(code: string, message: string, status: number, detail?: string) {
    super(message);
    this.name = "YouCamError";
    this.code = code;
    this.status = status;
    this.detail = detail;
  }
}

const PHOTO_HELP = "We couldn't read that photo. Try a clear, front-facing photo in even light.";
const SERVICE_HICCUP = "The analysis service had a hiccup. Please try again in a moment.";

interface Mapped {
  message: string;
  status: number;
}

const photo = (message: string): Mapped => ({ message, status: 422 });
const hiccup: Mapped = { message: SERVICE_HICCUP, status: 502 };

const ENGINE_CODES: Record<string, Mapped> = {
  // The five errors documented for Skin Analysis photos.
  error_src_face_too_small: photo("Move closer so your face fills more of the frame."),
  error_src_face_out_of_bound: photo("Keep your whole face inside the frame, with a little room around it."),
  error_lighting_dark: photo("It's a bit dark. Face a window or a lamp and try again."),
  error_below_min_image_size: photo("That photo is too small. Try a larger photo, taken a little closer."),
  error_exceed_max_image_size: photo("That photo is too large. Try a smaller version."),
  // EngineErrorCode enum.
  exceed_max_filesize: { message: "That photo file is too big. Please use one under 10 MB.", status: 413 },
  invalid_parameter: { message: "That request wasn't valid. Please try again.", status: 400 },
  error_download_image: photo("We couldn't open that photo. Try a JPEG or PNG."),
  error_decode_image: photo("We couldn't open that photo. Try a JPEG or PNG."),
  error_nsfw_content_detected: photo("That photo was declined by the image check. Try a plain photo of just your face."),
  exceed_nsfw_retry_limits: photo("That photo was declined by the image check. Try a plain photo of just your face."),
  error_no_face: photo("We couldn't find a face. Face the camera with your whole face in the frame."),
  error_pose: photo("Face the camera straight on, relaxed, with your eyes open and mouth closed."),
  error_face_parsing: photo("We couldn't map your face clearly. Brush your hair back and remove glasses if you can."),
  error_download_mask: hiccup,
  error_decode_mask: hiccup,
  error_inference: hiccup,
  error_upload: hiccup,
  unknown_internal_error: hiccup,
};

/** Error for a task that finished with `task_status: "error"`. Accepts codes we have never seen. */
export function engineError(code: unknown, detail?: unknown): YouCamError {
  const key = typeof code === "string" ? code : "";
  const mapped = Object.hasOwn(ENGINE_CODES, key) ? ENGINE_CODES[key] : undefined;
  const rawDetail = typeof detail === "string" ? detail.slice(0, 300) : undefined;
  if (mapped) return new YouCamError(key, mapped.message, mapped.status, rawDetail);
  // Unknown codes that still read like a photo-quality error get the photo advice; everything else a retry.
  if (key.startsWith("error_src_") || key.startsWith("error_lighting")) {
    return new YouCamError(key, PHOTO_HELP, 422, rawDetail);
  }
  return new YouCamError(key || "task_failed", SERVICE_HICCUP, 502, rawDetail);
}

/** Look for a known engine code in an error body or task result without trusting which field carries it. */
export function findEngineCode(...candidates: unknown[]): string | undefined {
  for (const candidate of candidates) {
    if (typeof candidate === "string" && Object.hasOwn(ENGINE_CODES, candidate)) return candidate;
  }
  return undefined;
}

/** Error for a non-2xx HTTP response. 400 and 401 are never retried by the caller. */
export function httpError(status: number, body: unknown): YouCamError {
  const record = (body && typeof body === "object" ? body : {}) as Record<string, unknown>;
  const apiCode = typeof record.error_code === "string" ? record.error_code : undefined;
  const detail = typeof record.error === "string" ? record.error.slice(0, 300) : undefined;

  const known = findEngineCode(record.error_code, record.error, record.error_message);
  if (known) return engineError(known, detail);

  if (status === 429) {
    return new YouCamError("busy", "The analysis service is busy. Please try again in a few seconds.", 429, detail);
  }
  if (status === 401) {
    return new YouCamError("upstream_auth", "Live analysis isn't available right now. The demo faces still are.", 503, detail);
  }
  if (apiCode === "CreditInsufficiency") {
    return new YouCamError("service_paused", "Live analysis is paused for now. The demo faces are still available.", 503, detail);
  }
  if (status === 400) {
    return new YouCamError(
      apiCode ?? "invalid_request",
      "The analysis service couldn't use that request. Please try a different photo.",
      400,
      detail,
    );
  }
  if (status === 500 && apiCode === "TaskTimeout") return timeoutError(detail);
  return new YouCamError("upstream_error", SERVICE_HICCUP, 502, detail);
}

export function timeoutError(detail?: string): YouCamError {
  return new YouCamError("timeout", "That took longer than expected. Please try again.", 504, detail);
}

export function networkError(cause: unknown): YouCamError {
  const name = cause instanceof Error ? cause.name : "unknown";
  return new YouCamError(
    "network",
    "We lost the connection to the analysis service. Please try again in a moment.",
    502,
    `network:${name}`,
  );
}

/** Reasons a live call is refused before any unit is spent (StatusResponse.reason). */
export type GateReason = "no_code" | "bad_code" | "budget_floor" | "kill_switch" | "daily_cap";

const GATE: Record<GateReason, Mapped> = {
  no_code: { message: "Live analysis needs an access code. You can try the demo faces without one.", status: 401 },
  bad_code: { message: "That access code wasn't recognised. Check it and try again, or use a demo face.", status: 403 },
  kill_switch: { message: "Live analysis is switched off right now. The demo faces are still available.", status: 503 },
  budget_floor: { message: "Live analysis is paused for now. The demo faces are still available.", status: 503 },
  daily_cap: {
    message: "This access code has reached today's limit for live use. Try again tomorrow, or use a demo face.",
    status: 429,
  },
};

export function gateError(reason: GateReason): YouCamError {
  return new YouCamError(reason, GATE[reason].message, GATE[reason].status);
}
