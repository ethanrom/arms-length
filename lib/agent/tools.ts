/**
 * The tools the model can call. Each validates its input (Zod), runs a deterministic engine function, files the result
 * under a per-run ref (r1, r2, ...) and returns the model a compact view: refs, the quotes it must use verbatim for any
 * number, and which concerns are in sight. The model never sees a raw measurement it could be tempted to restate.
 */
import { SCENES, VIEWER_ACUITY, type CallGeometry, type ConcernId, type RehearseFace, type RehearsePrefs, type SceneInput, type ToolName } from "@/lib/contracts";
import { CONCERN_COPY } from "@/lib/copy/concerns";
import { lintText } from "@/lib/copy/lint";
import {
  callGeometry,
  describeZodIssue,
  dropNulls,
  findFreeFixInput,
  lightestTouchInput,
  listScenesInput,
  observeSceneInput,
  receiptInput,
  toToolSchema,
  videoCallFrameInput,
  worthItInput,
  finalAnswerInput,
  LIGHT_IDS,
  VIEWER_IDS,
} from "./schemas";
import { afterRef, createRunStore, isFreeFix, isObserve } from "./results";
import { isSceneError, type AnyResult, type LlmTool, type RehearseEngine } from "./types";

/** The share of a concern a typical viewer may still see for it to count as out of sight (the lightest-touch goal). */
export const OUT_OF_SIGHT_SHARE = 0.1;

export const TOOL_NAMES: readonly ToolName[] = [
  "list_scenes",
  "observe_scene",
  "video_call_frame",
  "find_free_fix",
  "lightest_touch",
  "worth_it",
  "receipt",
  "final_answer",
];

const DESCRIPTIONS: Record<ToolName, string> = {
  list_scenes:
    "Lists the scenes (id, label, default distance and allowed range, default light, source), the lights with their luminance, and the viewers. Optional: the scene ids are also in your instructions.",
  observe_scene:
    "Runs the vision model for one moment: how much of each skin concern a typical viewer, and the sharpest eyes, could see at that distance, light and viewer. Returns a ref and quotes, the only numbers you may write. Call it once per moment, all moments in the same turn. For video_call, call video_call_frame first and pass the same call.",
  video_call_frame:
    "For a video call: how large your face looks to the other person and the smallest detail the video can carry. Call it before observe_scene for a video_call moment.",
  find_free_fix:
    "Searches the free levers (seat or camera distance, call layout, light) for the smallest change that puts the listed concerns out of sight for a typical viewer. Returns whether that is reachable, the change as quotes, and the scene re-observed after it.",
  lightest_touch:
    "The user's measured least makeup coverage for one concern (already measured, nothing new is run). Only when no free fix works and the user has not said no makeup.",
  worth_it:
    "How much of a measured skincare change a typical viewer would notice at a distance (default light). Only when the user asks about skincare.",
  receipt: "The evidence for one concern at a moment: the most visible mark's size, contrast, angle and the thresholds. Only when the user asks how we know.",
  final_answer:
    "Submit the finished day plan. Call it alone, once, after every other result is in. It is checked against the tool results; if the check fails you get the issues back once.",
};

const INPUT_SCHEMAS = {
  list_scenes: listScenesInput,
  observe_scene: observeSceneInput,
  video_call_frame: videoCallFrameInput,
  find_free_fix: findFreeFixInput,
  lightest_touch: lightestTouchInput,
  worth_it: worthItInput,
  receipt: receiptInput,
  final_answer: finalAnswerInput,
} as const;

export function toolSpecs(): LlmTool[] {
  return TOOL_NAMES.map((name) => ({ name, description: DESCRIPTIONS[name], inputSchema: toToolSchema(INPUT_SCHEMAS[name]) }));
}

/** Near-misses are accepted when only one tool can be meant: "observeScene", "functions.observe_scene", "Observe-Scene". */
export function resolveToolName(raw: string): ToolName | null {
  const squash = (s: string) => s.toLowerCase().replace(/[^a-z]/g, "");
  const wanted = squash(raw);
  if (!wanted) return null;
  const exact = TOOL_NAMES.find((n) => squash(n) === wanted);
  if (exact) return exact;
  const contained = TOOL_NAMES.filter((n) => wanted.endsWith(squash(n)) || wanted.startsWith(squash(n)));
  return contained.length === 1 ? contained[0] : null;
}

// ---------------------------------------------------------------------------------------------------------------
// Step labels: templates, not LLM text. The only model-written part is a sanitized moment title.
// ---------------------------------------------------------------------------------------------------------------

export function cleanTitle(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const t = value
    .replace(/[\u0000-\u001f\u007f"]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 60);
  return t && lintText(t).length === 0 ? t : null;
}

function concernName(value: unknown): string {
  return typeof value === "string" && value in CONCERN_COPY ? CONCERN_COPY[value as ConcernId].plural : "this concern";
}

export function describeStep(tool: ToolName, input: unknown): string {
  const args = (input && typeof input === "object" ? input : {}) as Record<string, unknown>;
  const title = cleanTitle(args.label);
  const moment = title ? `"${title}"` : "this moment";
  switch (tool) {
    case "list_scenes":
      return "Looking up the scenes and lights";
    case "observe_scene":
      return `Running the vision model for ${moment}`;
    case "video_call_frame":
      return `Working out how you will look on the call for ${moment}`;
    case "find_free_fix":
      return `Looking for a free change for ${moment}`;
    case "lightest_touch":
      return `Reading your measured lightest touch for ${concernName(args.concern)}`;
    case "worth_it":
      return `Checking what a skincare change would show for ${concernName(args.concern)}`;
    case "receipt":
      return `Writing the receipt for ${concernName(args.concern)} at ${moment}`;
    case "final_answer":
      return "Checking every number in your day plan";
  }
}

// ---------------------------------------------------------------------------------------------------------------
// The toolbox: one per run.
// ---------------------------------------------------------------------------------------------------------------

export interface ToolOutcome {
  ok: boolean;
  /** JSON text for the tool result block. */
  text: string;
  ref?: string;
  /** The stored result (ok outcomes of the engine tools). */
  result?: AnyResult;
}

export interface Toolbox {
  /** Every result of the run by ref, including `${ref}.after` for free fixes. */
  results: Map<string, AnyResult>;
  /** Runs any tool except final_answer. Never throws. */
  run(tool: ToolName, input: unknown): ToolOutcome;
  /** For the fallback: run an engine tool with typed input (same refs, same storage). */
  engine: RehearseEngine;
  face: RehearseFace;
}

const fail = (message: string): ToolOutcome => ({ ok: false, text: JSON.stringify({ error: message }) });

function sceneTable(): string {
  return SCENES.map((s) => `${s.id}${s.rangeM ? ` (${s.rangeM[0]} to ${s.rangeM[1]} m)` : " (distance from the call geometry)"}`).join(", ");
}

/** Strip the helper-only keys and null out nothing: exactly what the engine takes. */
function toSceneInput(args: { scene: SceneInput["scene"]; light?: SceneInput["light"]; viewer?: SceneInput["viewer"]; distanceM?: number; call?: CallGeometry }): SceneInput {
  const out: SceneInput = { scene: args.scene };
  if (args.light) out.light = args.light;
  if (args.viewer) out.viewer = args.viewer;
  if (args.distanceM !== undefined) out.distanceM = args.distanceM;
  if (args.call) out.call = args.call;
  return out;
}

export function createToolbox(opts: { face: RehearseFace; engine: RehearseEngine; prefs: RehearsePrefs }): Toolbox {
  const { face, engine } = opts;
  const { results, nextRef, commit } = createRunStore();

  function guardedScene(args: SceneInput): string | null {
    if (args.scene === "video_call" && !args.call) {
      return `video_call needs "call": { device: laptop|phone|desktop, cameraDistanceCm, layout: speaker|gallery }.`;
    }
    return null;
  }

  function sceneFailure(error: unknown, args: SceneInput): ToolOutcome {
    if (isSceneError(error)) {
      const scene = SCENES.find((s) => s.id === args.scene);
      const range = scene?.rangeM ? ` For ${scene.id} a distanceM override must be between ${scene.rangeM[0]} and ${scene.rangeM[1]} m.` : "";
      return fail(`${error.message} Valid scenes: ${sceneTable()}. Valid lights: ${LIGHT_IDS.join(", ")}. Valid viewers: ${VIEWER_IDS.join(", ")}.${range}`);
    }
    return fail("That tool could not run. Continue without it.");
  }

  function run(tool: ToolName, rawInput: unknown): ToolOutcome {
    if (tool === "final_answer") return fail("final_answer is handled separately.");
    const parsed = INPUT_SCHEMAS[tool].safeParse(dropNulls(rawInput ?? {}));
    if (!parsed.success) return fail(`Invalid input for ${tool}: ${describeZodIssue(parsed.error)}.`);

    try {
      switch (tool) {
        case "list_scenes":
          return {
            ok: true,
            text: JSON.stringify({
              scenes: SCENES.map((s) => ({ id: s.id, label: s.label, distanceM: s.distanceM, rangeM: s.rangeM, defaultLight: s.light, source: s.source })),
              lights: LIGHT_IDS.map((id) => ({ id, luminanceCdM2: engine.lightLuminance(id) })),
              viewers: VIEWER_IDS.map((id) => ({ id, acuityScale: VIEWER_ACUITY[id] })),
              note: "For choosing only. Do not write these numbers in the plan.",
            }),
          };

        case "observe_scene": {
          const args = parsed.data as ReturnType<typeof observeSceneInput.parse>;
          const input = toSceneInput(args);
          const problem = guardedScene(input);
          if (problem) return fail(problem);
          const result = engine.observeScene(face, input, nextRef());
          commit(result);
          return { ok: true, ref: result.ref, result, text: JSON.stringify(viewOf(result)) };
        }

        case "video_call_frame": {
          const args = parsed.data as ReturnType<typeof videoCallFrameInput.parse>;
          const call = callGeometry.parse({ device: args.device, cameraDistanceCm: args.cameraDistanceCm, layout: args.layout });
          const result = engine.videoCallFrame(call, nextRef());
          commit(result);
          return { ok: true, ref: result.ref, result, text: JSON.stringify(viewOf(result)) };
        }

        case "find_free_fix": {
          const args = parsed.data as ReturnType<typeof findFreeFixInput.parse>;
          const moment = toSceneInput(args.moment);
          const problem = guardedScene(moment);
          if (problem) return fail(problem);
          const result = engine.findFreeFix(face, { moment, concerns: args.concerns }, nextRef());
          commit(result);
          return { ok: true, ref: result.ref, result, text: JSON.stringify(viewOf(result)) };
        }

        case "lightest_touch": {
          const args = parsed.data as ReturnType<typeof lightestTouchInput.parse>;
          if (opts.prefs.noMakeup) return fail("The user would rather not wear makeup. Do not use lightest_touch.");
          const result = engine.lightestTouch(face, args.concern, nextRef());
          commit(result);
          return { ok: true, ref: result.ref, result, text: JSON.stringify(viewOf(result)) };
        }

        case "worth_it": {
          const args = parsed.data as ReturnType<typeof worthItInput.parse>;
          const result = engine.worthIt(face, args.concern, args.distanceM, nextRef());
          commit(result);
          return { ok: true, ref: result.ref, result, text: JSON.stringify(viewOf(result)) };
        }

        case "receipt": {
          const args = parsed.data as ReturnType<typeof receiptInput.parse>;
          const input = { ...toSceneInput(args), concern: args.concern };
          const problem = guardedScene(input);
          if (problem) return fail(problem);
          const result = engine.receiptAt(face, input, nextRef());
          if (!result) return fail(`No ${concernName(args.concern)} were measured on this face, so there is no receipt for them.`);
          commit(result);
          return { ok: true, ref: result.ref, result, text: JSON.stringify(viewOf(result)) };
        }
      }
    } catch (error) {
      const scene = (parsed.data as { scene?: SceneInput["scene"] }).scene ?? (parsed.data as { moment?: SceneInput }).moment?.scene;
      return sceneFailure(error, { scene: scene ?? "conversation" });
    }
  }

  return { results, run, engine, face };
}

// ---------------------------------------------------------------------------------------------------------------
// What the model sees of a result
// ---------------------------------------------------------------------------------------------------------------

const ids = (list: { concern: ConcernId }[]) => list.map((c) => c.concern);

function viewOf(result: AnyResult): Record<string, unknown> {
  if (isObserve(result)) return observeView(result);
  if ("resolutionFloorMm" in result) return { ref: result.ref, quotes: result.quotes, use: "Quote these when the video shapes what is seen." };
  if (isFreeFix(result)) {
    return {
      ref: result.ref,
      reachable: result.reachable,
      lever: result.lever,
      quotes: result.quotes,
      after: { ref: afterRef(result.ref), ...observeView(result.after, false) },
      use: result.reachable ? "A free fix works: use action kind free_fix with this ref." : "No free change reaches the goal for these concerns.",
    };
  }
  if ("coveragePct" in result) {
    return {
      ref: result.ref,
      concern: result.concern,
      status: result.status,
      quotes: result.quotes,
      use: result.status === "met" || result.status === "not_met" ? "Quote the coverage together with measuredAt." : "No measured plan: do not use lightest_touch.",
    };
  }
  if ("simulated" in result) return { ref: result.ref, concern: result.concern, simulated: result.simulated, quotes: result.quotes };
  return {
    ref: result.ref,
    concern: result.concern,
    visibleToTypicalViewer: result.visibleTypical,
    visibleToSharpestEyes: result.visibleBound,
    quotes: result.quotes,
  };
}

function observeView(result: Extract<AnyResult, { luminanceCdM2: number }>, withRef = true): Record<string, unknown> {
  const measured = result.concerns.filter((c) => c.targetCount > 0);
  const view: Record<string, unknown> = {
    ...(withRef ? { ref: result.ref } : {}),
    visibleToTypicalViewer: ids(measured.filter((c) => c.typicalCount > 0)),
    needsAChange: ids(measured.filter((c) => c.typicalShare > OUT_OF_SIGHT_SHARE)),
    outOfSightForTypicalViewer: ids(measured.filter((c) => c.typicalCount === 0)),
    seenOnlyBySharpestEyes: ids(measured.filter((c) => c.typicalCount === 0 && c.boundCount > 0)),
    noneFound: ids(result.concerns.filter((c) => c.targetCount === 0)),
    quotes: result.quotes,
  };
  const lost = ids(result.concerns.filter((c) => (c.belowCameraCount ?? 0) > 0));
  if (lost.length) view.partlyLostInTheVideo = lost;
  return view;
}
