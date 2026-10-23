/**
 * Zod schemas: the HTTP request, the tool inputs the model sends, and the final_answer draft. The tool specs the model
 * sees are generated from the same schemas (toToolSchema), so what it is told and what is validated cannot drift.
 */
import { z } from "zod";
import { CONCERNS, SCENES, type ConcernId, type LightId, type RehearseFace, type SceneId, type ViewerId } from "@/lib/contracts";

// ---------------------------------------------------------------------------------------------------------------
// Enums, from the tables they come from
// ---------------------------------------------------------------------------------------------------------------

const enumOf = <T extends string>(values: readonly T[]) => z.enum(values as [T, ...T[]]);

export const SCENE_IDS: SceneId[] = SCENES.map((s) => s.id);
export const LIGHT_IDS: LightId[] = ["home", "indoor", "overcast", "daylight", "videoCall"];
export const VIEWER_IDS: ViewerId[] = ["typical", "blurry"];
const ALL_CONCERN_IDS = Object.keys(CONCERNS) as ConcernId[];
/** The concerns with a visibility distance (texture has none). */
export const VISIBLE_CONCERN_IDS = ALL_CONCERN_IDS.filter((id) => CONCERNS[id].visibility);

const sceneId = enumOf(SCENE_IDS).describe("One of the scene ids from the system prompt.");
const lightId = enumOf(LIGHT_IDS);
const viewerId = enumOf(VIEWER_IDS);
const concernId = enumOf(VISIBLE_CONCERN_IDS);

// ---------------------------------------------------------------------------------------------------------------
// Tool inputs
// ---------------------------------------------------------------------------------------------------------------

const label = z.string().min(1).max(60).describe("The moment's short title in the user's words, e.g. Dinner date. Shown in the progress list.");

export const callGeometry = z.object({
  device: enumOf(["laptop", "phone", "desktop"] as const),
  cameraDistanceCm: z.number().min(20).max(200).describe("Your face to the camera, in cm. Typical: laptop 50, phone 35."),
  layout: enumOf(["speaker", "gallery"] as const).describe("speaker: you alone and large; gallery: one tile among others."),
});

const sceneShape = {
  scene: sceneId,
  light: lightId.optional().describe("Defaults to the scene's own light."),
  viewer: viewerId.optional().describe("typical (20/20, the default) or blurry (20/40, e.g. someone without their glasses)."),
  distanceM: z.number().min(0.1).max(10).optional().describe("Override within the scene's range. Not for video_call."),
  call: callGeometry.optional().describe("Required for video_call, otherwise leave out."),
};

export const sceneInput = z.object(sceneShape);

export const listScenesInput = z.object({});
export const observeSceneInput = z.object({ label, ...sceneShape });
export const videoCallFrameInput = z.object({ label, ...callGeometry.shape });
export const findFreeFixInput = z.object({
  label,
  moment: sceneInput,
  concerns: z
    .array(concernId)
    .min(1)
    .max(VISIBLE_CONCERN_IDS.length)
    .describe("The concerns a typical viewer can see at this moment and the user would like out of sight."),
});
export const lightestTouchInput = z.object({ concern: concernId });
export const worthItInput = z.object({
  concern: concernId,
  distanceM: z.number().min(0.3).max(6).describe("Viewing distance in metres, from the moment's observe_scene result."),
});
export const receiptInput = z.object({ label, ...sceneShape, concern: concernId });

// ---------------------------------------------------------------------------------------------------------------
// final_answer
// ---------------------------------------------------------------------------------------------------------------

export const MAX_MOMENTS = 8;
export const MAX_CLAIM_CHARS = 200;
export const MAX_HEADLINE_CHARS = 120;

const claim = z.object({
  text: z.string().min(1).max(MAX_CLAIM_CHARS).describe("One sentence. Any number in it must be copied verbatim from a quote of a cited result."),
  refs: z.array(z.string().min(1).max(40)).max(8).describe("The refs (r1, r2, ...) of the tool results this sentence rests on."),
});

const headline = z.object({
  text: z.string().min(1).max(MAX_HEADLINE_CHARS).describe("One warm, short sentence for the picture of this moment. Ideally no numbers; any number must be copied verbatim from a quote of a cited result."),
  refs: z.array(z.string().min(1).max(40)).max(8).describe("The refs of the tool results this sentence rests on (the observe_scene ref when it uses a quote)."),
});

const action = z
  .object({
    kind: enumOf(["none", "free_fix", "lightest_touch", "worth_it"] as const),
    ref: z.string().min(1).max(40).optional().describe("The ref of the find_free_fix, lightest_touch or worth_it result. Leave out for none."),
    claim,
  })
  .refine((a) => a.kind === "none" || !!a.ref, { message: "action.ref is required unless kind is none", path: ["ref"] });

const moment = z.object({
  time: z.string().max(40).nullable().optional().describe("As the user said it (9am, after work), or null."),
  title: z.string().min(1).max(60),
  scene: sceneInput.describe("The same scene, light, viewer and call you passed to observe_scene."),
  headline: headline.describe("The one sentence shown big under the picture of what the person there sees. Relief first."),
  observeRef: z.string().min(1).max(40).describe("The ref of this moment's observe_scene result."),
  assumptions: z.array(z.string().min(1).max(160)).max(4).describe("How you mapped the user's words to this scene, in words, with no numbers."),
  notice: z.array(claim).max(4).describe("What a typical viewer could notice here. Empty when nothing."),
  outOfSight: z.array(claim).max(4).describe("What is out of sight here. Put the good news first."),
  action,
});

export const finalAnswerInput = z.object({
  moments: z.array(moment).min(1).max(MAX_MOMENTS).describe("In time order."),
  summary: claim.describe("The day in one or two sentences, leading with what is out of sight."),
});

export type FinalAnswerInput = z.infer<typeof finalAnswerInput>;

/** A readable reason for the first things wrong in a parse (for error tool results and verifier issues). */
export function describeZodIssue(error: z.ZodError): string {
  const shown = error.issues.slice(0, 3).map((issue) => {
    const where = issue.path.length ? issue.path.map(String).join(".") : "input";
    return `${where}: ${issue.message}`;
  });
  return shown.join("; ") + (error.issues.length > 3 ? `; and ${error.issues.length - 3} more` : "");
}

// ---------------------------------------------------------------------------------------------------------------
// Tool spec JSON Schema
// ---------------------------------------------------------------------------------------------------------------

/** JSON Schema for a tool input: every object closed (additionalProperties: false), no $schema key. */
export function toToolSchema(schema: z.ZodType): Record<string, unknown> {
  const json = z.toJSONSchema(schema, { io: "input", target: "draft-7" }) as Record<string, unknown>;
  delete json.$schema;
  closeObjects(json);
  return json;
}

function closeObjects(node: unknown): void {
  if (Array.isArray(node)) return node.forEach(closeObjects);
  if (!node || typeof node !== "object") return;
  const obj = node as Record<string, unknown>;
  if (obj.type === "object" && obj.properties) obj.additionalProperties = false;
  Object.values(obj).forEach(closeObjects);
}

/** Models sometimes send null for an optional argument. Drop those so `optional()` fields accept it. */
export function dropNulls(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(dropNulls);
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value)
        .filter(([, v]) => v !== null)
        .map(([k, v]) => [k, dropNulls(v)]),
    );
  }
  return value;
}

// ---------------------------------------------------------------------------------------------------------------
// The HTTP request. A live face is numbers only (never the photo), validated so a hostile body can't reach the engines.
// ---------------------------------------------------------------------------------------------------------------

const num = z.number();
const pt = z.object({ x: num, y: num });
const box = z.object({ x: num, y: num, w: num, h: num });
const contrast = z.object({ lum: num, rg: num });
const basis = enumOf(["surround", "counterfactual"] as const);
const str = (max: number) => z.string().max(max);

const feature = z.object({
  id: str(40),
  concern: enumOf(ALL_CONCERN_IDS),
  shape: enumOf(["spot", "line"] as const),
  region: str(40),
  centroid: pt,
  bbox: box,
  areaPx: num,
  diameterMm: num.optional(),
  lengthMm: num.optional(),
  widthMm: num.optional(),
  sizeSource: enumOf(["mask", "photo", "prior"] as const),
  contrast,
  contrastBasis: basis.optional(),
});

const region = z.object({
  id: str(40),
  concern: enumOf(ALL_CONCERN_IDS),
  bbox: box,
  areaPx: num,
  widthMm: num,
  heightMm: num,
  contrast,
  reference: str(40),
  contrastBasis: basis.optional(),
});

const measurements = z.object({
  scale: z.object({ mmPerPx: num.positive(), relSd: num.min(0), source: enumOf(["iris", "card", "assumed"] as const), irisPx: num.optional() }),
  features: z.array(feature).max(5000),
  regions: z.array(region).max(200),
  skipped: z.array(z.object({ concern: enumOf(ALL_CONCERN_IDS), reason: str(80) })).max(16),
});

// The photo never travels here: an image reference that is data is refused.
const renderResult = z.object({
  imageRef: str(200).refine((s) => !s.startsWith("data:"), { message: "no image data" }),
  width: num,
  height: num,
  offset: z.object({ dx: num, dy: num }),
  unitsCharged: num,
  source: enumOf(["live", "replay", "preview"] as const),
  taskIds: z.array(str(200)).max(4).optional(),
});

const coverageStep = z.object({
  lever: z.object({ category: str(40), field: str(40), value: num }),
  render: renderResult,
  maxDistanceM: num,
  fractionAtTarget: num.optional(),
});

const coveragePlan = z.object({
  concern: enumOf(ALL_CONCERN_IDS),
  targetDistanceM: num,
  baselineDistanceM: num,
  steps: z.array(coverageStep).max(12),
  chosen: coverageStep.nullable(),
  status: enumOf(["met", "not_met", "no_lever"] as const),
  reason: str(80).optional(),
  baselineFraction: num.optional(),
});

const profile = z.array(z.object({ distanceM: num, count: num, fraction: num })).max(80);
const strength = num.min(0).max(1).optional();

const whatIfLite = z.object({
  concern: enumOf(ALL_CONCERN_IDS),
  strengths: z.object({
    wrinkle: strength,
    radiance: strength,
    oiliness: strength,
    acne: strength,
    eye_bags: strength,
    dark_circle: strength,
    spots: strength,
    pores: strength,
    texture: strength,
    redness: strength,
  }),
  beforeDistanceM: num,
  afterDistanceM: num,
  differenceMaxDistanceM: num.optional(),
  differenceMedianDistanceM: num.optional(),
  differenceProfile: profile.optional(),
  differenceNominalProfile: profile.optional(),
  differenceNominalMaxDistanceM: num.optional(),
});

export const liveFaceSchema: z.ZodType<RehearseFace> = z.object({
  measurements,
  coverage: z.array(coveragePlan).max(16),
  worthIt: z.array(whatIfLite).max(16),
});

const scenePick = z.object({ title: str(120), time: str(60).nullable(), scene: sceneInput });

export const MAX_BODY_BYTES = 1_500_000;
export const MAX_DAY_CHARS = 1200;

export const rehearseRequestSchema = z.object({
  face: z.union([z.strictObject({ demoId: z.string().min(1).max(40) }), z.strictObject({ live: liveFaceSchema })]),
  day: z.string().trim().min(1).max(MAX_DAY_CHARS),
  prefs: z.object({ callDevice: enumOf(["laptop", "phone"] as const), noMakeup: z.boolean() }),
  followUp: z
    .object({
      question: z.string().trim().min(1).max(400),
      previous: z.object({ day: str(MAX_DAY_CHARS), moments: z.array(scenePick).max(MAX_MOMENTS) }),
    })
    .optional(),
});

export type ParsedRehearseRequest = z.infer<typeof rehearseRequestSchema>;
