/**
 * "Rehearse your day": the agent turns a described day into moments and, for each, runs our vision model through
 * deterministic tools. Every number the user sees comes from a tool result (by `ref`); the LLM only picks scenes,
 * wording and which tool results to quote. Frozen: only the integrator edits this file.
 */
import type { ConcernId } from "./concerns";
import type { Measurements } from "./measure";
import type { CoveragePlan, WhatIf } from "./render";

// ---------------------------------------------------------------------------------------------------------------
// Scenes, lights and viewers. The LLM chooses ids; numbers come from these tables (sources cited), never from it.
// ---------------------------------------------------------------------------------------------------------------

export type SceneId = "close_talk" | "cafe_table" | "conversation" | "dinner_table" | "meeting_room" | "presenting" | "video_call";

export interface SceneTemplate {
  id: SceneId;
  label: string;
  /** Default viewing distance, metres. `video_call` has none: `video_call_frame` derives it from the geometry. */
  distanceM: number | null;
  /** The range an override may take (from the same source); outside it, the override is rejected. */
  rangeM: [number, number] | null;
  /** Default light for the scene, a key of LIGHTS. */
  light: LightId;
  source: string;
}

export const SCENES: readonly SceneTemplate[] = [
  {
    id: "close_talk",
    label: "Close: a hug, a whisper, getting ready together",
    distanceM: 0.5,
    rangeM: [0.45, 0.76],
    light: "indoor",
    source: "Hall (1966), The Hidden Dimension: close phase of personal distance, 0.45 to 0.76 m.",
  },
  {
    id: "cafe_table",
    label: "Coffee at a small table",
    distanceM: 0.8,
    rangeM: [0.6, 1.2],
    light: "indoor",
    source: "Project assumption: a small cafe table puts faces about 0.6 to 1.2 m apart (within Hall's far personal phase, 0.76 to 1.2 m). Not a measured figure.",
  },
  {
    id: "conversation",
    label: "Standing conversation",
    distanceM: 1,
    rangeM: [0.76, 1.2],
    light: "indoor",
    source: "Hall (1966): far phase of personal distance, 0.76 to 1.2 m.",
  },
  {
    id: "dinner_table",
    label: "Across a dinner or meeting table",
    distanceM: 1.5,
    rangeM: [1.2, 2.1],
    light: "home",
    source: "Hall (1966): close phase of social distance, 1.2 to 2.1 m. The site's 'across a table' anchor uses 1.5 m.",
  },
  {
    id: "meeting_room",
    label: "Across a meeting room",
    distanceM: 2.5,
    rangeM: [2.1, 3.7],
    light: "indoor",
    source: "Hall (1966): far phase of social distance, 2.1 to 3.7 m.",
  },
  {
    id: "presenting",
    label: "Presenting to a room",
    distanceM: 4,
    rangeM: [3.7, 6],
    light: "indoor",
    source: "Hall (1966): public distance begins at 3.7 m. The model's profiles end at 6 m.",
  },
  {
    id: "video_call",
    label: "Video call",
    distanceM: null,
    rangeM: null,
    light: "videoCall",
    source: "Distance derived per call by video_call_frame from the camera and screen geometry (assumptions listed in its result).",
  },
];

/** Keys of LUMINANCE_PRESETS (lib/vision/params.ts, research 7). Resolve the cd/m^2 there; don't copy it. */
export type LightId = "home" | "indoor" | "overcast" | "daylight" | "videoCall";

/** typical = 20/20 (acuityScale 1); blurry = 20/40, e.g. someone without their glasses (acuityScale 2). */
export type ViewerId = "typical" | "blurry";
export const VIEWER_ACUITY: Record<ViewerId, number> = { typical: 1, blurry: 2 };

// ---------------------------------------------------------------------------------------------------------------
// The face the tools run on. Demo faces: built server-side from the bundle. Live: sent by the client (numbers only,
// never the photo).
// ---------------------------------------------------------------------------------------------------------------

/** WhatIf without its render: the difference profiles are all the tools need. */
export type WhatIfLite = Omit<WhatIf, "render">;

export interface RehearseFace {
  measurements: Measurements;
  /** The measured lightest-touch plans (makeup try-on), as recorded or run. Empty if none were run. */
  coverage: CoveragePlan[];
  /** The measured Worth it? results (skin simulation). Empty if none were run. */
  worthIt: WhatIfLite[];
}

// ---------------------------------------------------------------------------------------------------------------
// Tool inputs and results. Every result has a `ref` (unique within a run) and `quotes`: pre-formatted strings the
// LLM must use verbatim for any number it writes. The verifier accepts a number in the plan only if it appears in
// the quotes of a result the claim cites.
// ---------------------------------------------------------------------------------------------------------------

export type Quotes = Record<string, string>;

interface ToolResultBase {
  ref: string;
  quotes: Quotes;
  /** Every assumption behind the result, in plain words (shown under "How we know"). */
  assumptions: string[];
}

export interface CallGeometry {
  device: "laptop" | "phone" | "desktop";
  /** Your face to the camera, cm. */
  cameraDistanceCm: number;
  /** What the other person sees: you alone (speaker view) or a gallery tile. */
  layout: "speaker" | "gallery";
}

export interface SceneInput {
  scene: SceneId;
  /** Defaults to the scene's light. */
  light?: LightId;
  /** Defaults to "typical". */
  viewer?: ViewerId;
  /** Override within the scene's rangeM. Not allowed for video_call. */
  distanceM?: number;
  /** Required for video_call, ignored otherwise. */
  call?: CallGeometry;
}

export interface CallFrameResult extends ToolResultBase {
  call: CallGeometry;
  /** The in-person distance at which your face would look the same size to the other person. */
  equivalentDistanceM: number;
  /** The smallest detail on your face the video can carry (two pixels of the received tile), mm. */
  resolutionFloorMm: number;
}

export interface ConcernAtScene {
  concern: ConcernId;
  targetCount: number;
  /** Share visible to a typical viewer (average observer, no margin). */
  typicalShare: number;
  typicalCount: number;
  /** Share visible to the sharpest eyes (the bound, 6 dB margin). */
  boundShare: number;
  boundCount: number;
  /** Large soft areas (under-eye, redness): one area, so share is 0 or 1. */
  soft: boolean;
  /** Video calls: targets smaller than the resolution floor (lost in the video whatever the eyes). */
  belowCameraCount?: number;
}

export interface ObserveResult extends ToolResultBase {
  input: Required<Pick<SceneInput, "scene" | "light" | "viewer">> & Pick<SceneInput, "call">;
  distanceM: number;
  luminanceCdM2: number;
  acuityScale: number;
  concerns: ConcernAtScene[];
}

export interface FreeFixInput {
  moment: SceneInput;
  /** The concerns to put out of sight. */
  concerns: ConcernId[];
}

export type FreeLever = "distance" | "camera_distance" | "call_layout" | "light";

export interface FreeFixResult extends ToolResultBase {
  /** Goal: typicalShare <= 0.1 for every listed concern (the same 10% the lightest-touch search uses). */
  reachable: boolean;
  /** Present when reachable (and already-met is reachable with lever null). */
  lever: FreeLever | null;
  from: SceneInput;
  to: SceneInput | null;
  /** The scene re-observed after the change (or as-is when already met / not reachable). */
  after: ObserveResult;
}

export interface LightestTouchResult extends ToolResultBase {
  concern: ConcernId;
  status: CoveragePlan["status"] | "not_measured";
  /** The chosen foundation coverage, percent, when met or not_met. */
  coveragePct: number | null;
  /** The conditions it was measured at (indoor light, its target distance). Always quoted with the number. */
  measuredAtM: number | null;
  baselineShare: number | null;
  afterShare: number | null;
}

export interface WorthItResult extends ToolResultBase {
  concern: ConcernId;
  simulated: boolean;
  distanceM: number;
  /** Share of the simulated change a typical viewer would notice at distanceM (default light). */
  typicalShareOfChange: number | null;
  boundShareOfChange: number | null;
}

export interface ReceiptInput extends SceneInput {
  concern: ConcernId;
}

export interface ReceiptResult extends ToolResultBase {
  concern: ConcernId;
  targetId: string;
  distanceM: number;
  sizeMm: number;
  contrastPct: number;
  angleArcmin: number;
  /** Contrast needed to see it at this distance: the sharpest eyes (bound) and a typical viewer. */
  thresholdPct: number;
  typicalThresholdPct: number;
  visibleBound: boolean;
  visibleTypical: boolean;
}

export type ToolName =
  | "list_scenes"
  | "observe_scene"
  | "video_call_frame"
  | "find_free_fix"
  | "lightest_touch"
  | "worth_it"
  | "receipt"
  | "final_answer";

// ---------------------------------------------------------------------------------------------------------------
// The day plan (the final_answer tool input, after verification) and the stream.
// ---------------------------------------------------------------------------------------------------------------

/** A sentence the user sees. Any number in `text` must appear in the quotes of a result listed in `refs`. */
export interface Claim {
  text: string;
  refs: string[];
}

export type MomentAction =
  | { kind: "none"; claim: Claim }
  | { kind: "free_fix"; ref: string; claim: Claim }
  | { kind: "lightest_touch"; ref: string; claim: Claim }
  | { kind: "worth_it"; ref: string; claim: Claim };

export interface PlannedMoment {
  id: string;
  /** As the user said it ("9am", "after work"), or null. */
  time: string | null;
  /** Short title in the user's words ("Video standup"). */
  title: string;
  /**
   * The one sentence the scene shows under the picture (120 characters at most, ideally with no numbers), checked like
   * every claim. Optional only so plans recorded before it still load; the UI writes a template line when it is missing.
   */
  headline?: Claim;
  scene: SceneInput;
  /** The ObserveResult this moment rests on. */
  observeRef: string;
  /** What the agent assumed to map the user's words to a scene ("lunch by a window: daylight"). No numbers. */
  assumptions: string[];
  notice: Claim[];
  outOfSight: Claim[];
  action: MomentAction;
}

export interface VerifierIssue {
  momentId: string | null;
  code: "unknown_ref" | "stray_number" | "bound_wording" | "banned_word" | "absolute" | "bad_action" | "bad_scene" | "schema";
  detail: string;
}

export interface RunStats {
  ms: number;
  turns: number;
  toolCalls: number;
  inputTokens: number;
  outputTokens: number;
  /** Repair rounds used (0 or 1). */
  repairs: number;
}

export interface DayPlan {
  day: string;
  moments: PlannedMoment[];
  summary: Claim;
  /** Every tool result the plan cites, keyed by ref, so the UI can show receipts and re-check offline. */
  results: Record<string, ObserveResult | CallFrameResult | FreeFixResult | LightestTouchResult | WorthItResult | ReceiptResult>;
  /** true: the agent's plan passed the verifier. false: the deterministic fallback built from tool results. */
  verified: boolean;
  /** The verifier's findings on the agent's last attempt (empty when verified on the first try). */
  issues: VerifierIssue[];
  stats: RunStats;
}

/** The example chips. Replay fixtures are recorded for exactly these texts (fixtures/rehearse/<demoId>/<id>.json). */
export const EXAMPLE_DAYS = [
  { id: "workday", chip: "Video standup, client lunch, dinner date", day: "9am video standup on my laptop, lunch with a client by the window, dinner date at 7" },
  { id: "presenting", chip: "Presenting at work", day: "Presenting to the team at 2pm in the big meeting room, then drinks with colleagues after work" },
  { id: "wedding", chip: "Wedding guest", day: "Wedding guest: outdoor ceremony in the afternoon sun, then dinner and dancing in the evening" },
] as const;

export interface RehearsePrefs {
  callDevice: "laptop" | "phone";
  noMakeup: boolean;
}

export interface RehearseRequest {
  face: { demoId: string } | { live: RehearseFace };
  day: string;
  prefs: RehearsePrefs;
  /** A follow-up ("what if lunch is outdoors?") on an earlier plan. */
  followUp?: { question: string; previous: DayPlan };
}

/** NDJSON lines from POST /api/rehearse. `step` labels are deterministic templates, not LLM text. */
export type RehearseEvent =
  /** `moment` is set on observe_scene / video_call_frame steps, so the UI can sketch that moment's scene as it is found. */
  | { type: "step"; tool: ToolName; label: string; moment?: { title: string; scene: SceneId } }
  | { type: "plan"; plan: DayPlan }
  | { type: "error"; code: "disabled" | "kill_switch" | "rate_limited" | "bad_request" | "too_large" | "unknown_face" | "upstream" | "timeout"; message: string };
