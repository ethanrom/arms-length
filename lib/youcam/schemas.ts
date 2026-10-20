// Request body schemas for app/api/youcam/*. They mirror lib/contracts/api.ts.
import { z } from "zod";

/** A 10 MB image as base64 is about 13.4 M characters; the service re-checks the decoded size. */
export const MAX_BODY_BYTES = { analysis: 14_500_000, render: 64_000 } as const;

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
