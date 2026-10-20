// Request validation for POST /api/visibility. Mirrors `VisibilityRequest` in lib/contracts/api.ts.
import { z } from "zod";

/** Hosting limit for a request body on Vercel is 4.5 MB; stay under it. */
export const MAX_BODY_BYTES = 4_000_000;
export const HOSTING_LIMIT_MB = 4.5;
/** YouCam returns at most 17 masks for the HD set; leave room for other engines. */
export const MAX_MASKS = 40;
export const MAX_OUTPUT_ITEMS = 64;

const imageDataUrl = z.string().regex(/^data:image\/(?:png|jpe?g);base64,/i, "must be a PNG or JPEG data URL (data:image/jpeg;base64,...)");

const viewing = z
  .strictObject({
    luminanceCdM2: z.number().min(0.1).max(10_000),
    acuityScale: z.number().min(0.25).max(8),
    label: z.enum(["indoor", "daylight", "custom"]),
    marginDb: z.number().min(0).max(30),
  })
  .partial();

const scale = z.strictObject({
  mmPerPx: z.number().min(0.02).max(3),
  relSd: z.number().min(0).max(1),
  source: z.enum(["iris", "card", "assumed"]),
  irisPx: z.number().positive().optional(),
});

export const visibilityBody = z.strictObject({
  output: z.array(z.unknown()).min(1).max(MAX_OUTPUT_ITEMS),
  image: imageDataUrl,
  masks: z.record(z.string().max(2_000), imageDataUrl).refine((m) => Object.keys(m).length <= MAX_MASKS, `at most ${MAX_MASKS} masks`).optional(),
  viewing: viewing.optional(),
  scale: scale.optional(),
});

/** A plain-language line for the first problem Zod found. */
export function describeIssue(error: z.ZodError): string {
  const issue = error.issues[0];
  const where = issue.path.length ? issue.path.map(String).join(".") : "request";
  return `The "${where}" part of that request isn't valid: ${issue.message}. GET /api/visibility describes the request shape.`;
}
