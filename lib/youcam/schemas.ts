// Request body schemas for app/api/youcam/*. They mirror lib/contracts/api.ts.
import { z } from "zod";

/**
 * Request body caps in bytes. Vercel refuses bodies over 4.5 MB before our code runs, so the photo route stays under it:
 * 4 MB of base64 is about a 3 MB JPEG, and the capture step sends well under 1.5 MB (1080 x 1919 at quality 0.92).
 * The service re-checks the decoded size against YouCam's own 10 MB limit.
 */
export const MAX_BODY_BYTES = { analysis: 4_000_000, render: 64_000, cleanup: 16_000 } as const;

const strength = z.number().min(0).max(1);

export const analysisBody = z
  .strictObject({
    image: z.string().max(MAX_BODY_BYTES.analysis).optional(),
    persona: z.string().min(1).max(32).optional(),
    /** Proposed contract field: "sd" is the 12-unit engine for budget-limited sessions. */
    engine: z.enum(["hd", "sd"]).optional(),
  })
  .refine((body) => (body.image === undefined) !== (body.persona === undefined), {
    message: "Send either an image or a persona.",
  });

/** POST /api/youcam/cleanup: the task tokens a session collected. The code or own key may ride in the body for sendBeacon. */
export const cleanupBody = z.strictObject({
  taskIds: z.array(z.string().min(3).max(200)).max(24),
  accessCode: z.string().max(200).nullish(),
  youcamKey: z.string().max(200).nullish(),
});

export const makeupBody = z.strictObject({
  fileRef: z.string().min(1).max(300),
  // Effects pass through as-is (makeup_vto.yaml); YouCam validates the per-category fields, and a rejected
  // submit (HTTP 400) is free.
  effects: z.array(z.looseObject({ category: z.string().min(1).max(40) })).min(1).max(12),
});

export const simulateBody = z.strictObject({
  fileRef: z.string().min(1).max(300),
  strengths: z
    .strictObject({
      wrinkle: strength.optional(),
      radiance: strength.optional(),
      oiliness: strength.optional(),
      acne: strength.optional(),
      eye_bags: strength.optional(),
      dark_circle: strength.optional(),
      spots: strength.optional(),
      pores: strength.optional(),
      texture: strength.optional(),
      redness: strength.optional(),
    })
    .refine((s) => Object.values(s).some((value) => typeof value === "number" && value > 0), {
      message: "At least one strength must be above zero.",
    }),
});
