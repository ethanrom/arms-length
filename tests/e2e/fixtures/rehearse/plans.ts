/**
 * Hand-written /api/rehearse answers for the UI tests, typed against the frozen contract so a contract change breaks the
 * build here first. They are shaped like the real thing for the demo face p1a (counts from its recorded analysis), but
 * they are fixtures: no model ran to make them. The e2e spec serves them with page.route, so the UI never depends on the
 * agent being built or on Bedrock.
 */
import type { ConcernId } from "../../../../lib/contracts/concerns";
import {
  EXAMPLE_DAYS,
  type CallFrameResult,
  type CallGeometry,
  type ConcernAtScene,
  type DayPlan,
  type FreeFixResult,
  type LightId,
  type LightestTouchResult,
  type ObserveResult,
  type PlannedMoment,
  type ReceiptResult,
  type RehearseEvent,
  type SceneId,
  type ViewerId,
} from "../../../../lib/contracts/rehearse";

export const WORKDAY = EXAMPLE_DAYS[0].day;

const LUMINANCE: Record<LightId, number> = { home: 12, indoor: 45, overcast: 300, daylight: 1000, videoCall: 80 };

/** [concern, marks, typical share, sharpest-eyes share, soft] for one scene; counts are rounded from the shares. */
type Row = [ConcernId, number, number, number, boolean?, number?];

function concerns(rows: Row[]): ConcernAtScene[] {
  return rows.map(([concern, targetCount, typicalShare, boundShare, soft = false, belowCameraCount]) => ({
    concern,
    targetCount,
    typicalShare,
    typicalCount: Math.round(targetCount * typicalShare),
    boundShare,
    boundCount: Math.round(targetCount * boundShare),
    soft,
    ...(belowCameraCount === undefined ? {} : { belowCameraCount }),
  }));
}

function observe(ref: string, scene: SceneId, light: LightId, viewer: ViewerId, distanceM: number, rows: Row[], assumptions: string[], call?: CallGeometry): ObserveResult {
  return {
    ref,
    quotes: { distance: `${distanceM} m` },
    assumptions,
    input: { scene, light, viewer, ...(call ? { call } : {}) },
    distanceM,
    luminanceCdM2: LUMINANCE[light],
    acuityScale: viewer === "typical" ? 1 : 2,
    concerns: concerns(rows),
  };
}

const VIDEO_ROWS: Row[] = [
  ["pore", 450, 0, 0.02, false, 390],
  ["wrinkle", 93, 0.12, 0.35, false, 41],
  ["age_spot", 64, 0.3, 0.55],
  ["acne", 40, 0.1, 0.25],
  ["dark_circle", 2, 0, 1, true],
  ["eye_bag", 2, 0, 0, true],
  ["redness", 5, 1, 1, true],
];

const obsVideo = observe("obs-0900", "video_call", "videoCall", "typical", 1.9, VIDEO_ROWS, [
  "Screen light: your face is lit at about 80 cd/m2 while you look at a bright screen.",
  "A typical viewer has 20/20 eyesight.",
], { device: "laptop", cameraDistanceCm: 55, layout: "speaker" });

const callVideo: CallFrameResult = {
  ref: "call-0900",
  quotes: { equivalentDistance: "1.9 m", cameraDistance: "55 cm", resolutionFloor: "0.9 mm" },
  assumptions: [
    "Laptop webcam about 55 cm from your face, with a 70 degree field of view.",
    "The other person sees you full-screen on a 14 inch display, about 60 cm from their eyes.",
    "Video compression is not modelled, so what you see here is the most the call can carry.",
  ],
  call: { device: "laptop", cameraDistanceCm: 55, layout: "speaker" },
  equivalentDistanceM: 1.9,
  resolutionFloorMm: 0.9,
};

const obsVideoFurther = observe("obs-0900-after", "video_call", "videoCall", "typical", 2.6, [
  ["pore", 450, 0, 0, false, 450],
  ["wrinkle", 93, 0, 0.12, false, 70],
  ["age_spot", 64, 0.09, 0.3],
  ["acne", 40, 0, 0.1],
  ["dark_circle", 2, 0, 0, true],
  ["eye_bag", 2, 0, 0, true],
  ["redness", 5, 1, 1, true],
], ["Same screen and webcam as the call at 55 cm, with the camera moved back."], { device: "laptop", cameraDistanceCm: 80, layout: "speaker" });

const fixVideo: FreeFixResult = {
  ref: "fix-0900",
  quotes: { cameraDistance: "80 cm", equivalentDistance: "2.6 m", darkSpots: "9%" },
  assumptions: ["The goal is a typical viewer picking out at most 10% of the marks you chose.", "Only the camera distance was changed."],
  reachable: true,
  lever: "camera_distance",
  from: { scene: "video_call", light: "videoCall", viewer: "typical", call: { device: "laptop", cameraDistanceCm: 55, layout: "speaker" } },
  to: { scene: "video_call", light: "videoCall", viewer: "typical", call: { device: "laptop", cameraDistanceCm: 80, layout: "speaker" } },
  after: obsVideoFurther,
};

const obsLunch = observe(
  "obs-1230",
  "dinner_table",
  "overcast",
  "typical",
  1.5,
  [
    ["pore", 450, 0, 0.04],
    ["wrinkle", 93, 0.22, 0.48],
    ["age_spot", 64, 0.45, 0.7],
    ["acne", 40, 0.3, 0.55],
    ["dark_circle", 2, 1, 1, true],
    ["eye_bag", 2, 0, 1, true],
    ["redness", 5, 1, 1, true],
  ],
  ["Lunch by a window: bright, even window light, about 300 cd/m2.", "A table for two puts you about 1.5 m apart."],
);

const rcptLunch: ReceiptResult = {
  ref: "rcpt-1230",
  quotes: { size: "1.1 mm", contrast: "9%", angle: "2.5 arcmin" },
  assumptions: ["The mark is measured on the photo, using the width of your iris as the ruler.", "Contrast is measured in linear light against the skin around it."],
  concern: "age_spot",
  targetId: "age_spot-12",
  distanceM: 1.5,
  sizeMm: 1.1,
  contrastPct: 9.2,
  angleArcmin: 2.52,
  thresholdPct: 3.1,
  typicalThresholdPct: 6.4,
  visibleBound: true,
  visibleTypical: true,
};

const obsDinner = observe(
  "obs-1900",
  "cafe_table",
  "home",
  "typical",
  0.9,
  [
    ["pore", 450, 0.08, 0.3],
    ["wrinkle", 93, 0.2, 0.5],
    ["age_spot", 64, 0.3, 0.6],
    ["acne", 40, 0.6, 0.85],
    ["dark_circle", 2, 0, 0, true],
    ["eye_bag", 2, 0, 0, true],
    ["redness", 5, 0, 1, true],
  ],
  ["Dinner at 7 in the evening: lamplight, about 12 cd/m2.", "A small table puts you about 0.9 m apart."],
);

const touchDinner: LightestTouchResult = {
  ref: "touch-1900",
  quotes: { coverage: "60%", measuredAt: "1.5 m" },
  assumptions: ["Measured on a virtual try-on of foundation, in indoor light, at 1.5 m.", "No new render was made for this plan."],
  concern: "acne",
  status: "met",
  coveragePct: 60,
  measuredAtM: 1.5,
  baselineShare: 0.3,
  afterShare: 0.05,
};

const moments: PlannedMoment[] = [
  {
    id: "m1",
    time: "9am",
    title: "Video standup",
    headline: { text: "On the call, your pores and fine lines stay soft; a few dark spots come through.", refs: ["obs-0900"] },
    scene: { scene: "video_call", light: "videoCall", viewer: "typical", call: { device: "laptop", cameraDistanceCm: 55, layout: "speaker" } },
    observeRef: "obs-0900",
    assumptions: ["Calls are on a laptop, about 55 cm from the camera.", "You are the speaker on screen, not a small tile."],
    notice: [
      { text: "Dark spots: about 30% (19 of 64) could be picked out by a typical viewer on the call.", refs: ["obs-0900"] },
      { text: "Fine lines: about 12% (11 of 93) come through at this size.", refs: ["obs-0900"] },
    ],
    outOfSight: [
      { text: "Pores are out of sight, and 390 of 450 are finer than the call can carry.", refs: ["obs-0900", "call-0900"] },
      { text: "Under-eye puffiness is out of sight for a typical viewer.", refs: ["obs-0900"] },
    ],
    action: {
      kind: "free_fix",
      ref: "fix-0900",
      claim: { text: "Move the laptop back to about 80 cm and you will look as if you were 2.6 m away; dark spots drop to 9%.", refs: ["fix-0900", "obs-0900-after"] },
    },
  },
  {
    id: "m2",
    time: "12:30",
    title: "Client lunch by the window",
    headline: { text: "Across the table in window light, only the larger marks can be picked out.", refs: ["obs-1230"] },
    scene: { scene: "dinner_table", light: "overcast", viewer: "typical" },
    observeRef: "obs-1230",
    assumptions: ["Lunch is at a table for two, about 1.5 m across.", "A window seat means soft daylight."],
    notice: [
      { text: "Dark spots: about 45% (29 of 64) could be picked out across the table.", refs: ["obs-1230"] },
      { text: "The largest dark spot is 1.1 mm across and 9% darker than the skin around it, just inside what a typical viewer can see.", refs: ["obs-1230", "rcpt-1230"] },
    ],
    outOfSight: [{ text: "Pores are out of sight for a typical viewer.", refs: ["obs-1230"] }],
    action: { kind: "none", claim: { text: "Nothing needed. Sat across a table, most of what shows is large and soft, and window light is kind.", refs: ["obs-1230"] } },
  },
  {
    id: "m3",
    time: "7pm",
    title: "Dinner date",
    headline: { text: "In lamplight, breakouts are the one thing that still shows.", refs: ["obs-1900"] },
    scene: { scene: "cafe_table", light: "home", viewer: "typical" },
    observeRef: "obs-1900",
    assumptions: ["A small restaurant table, about 0.9 m across.", "Evening lamplight, much dimmer than the office."],
    notice: [{ text: "Breakouts: about 60% (24 of 40) could be picked out at this distance.", refs: ["obs-1900"] }],
    outOfSight: [
      { text: "Under-eye shadows and puffiness are out of sight in this light.", refs: ["obs-1900"] },
      { text: "Redness is out of sight for a typical viewer.", refs: ["obs-1900"] },
    ],
    action: {
      kind: "lightest_touch",
      ref: "touch-1900",
      claim: { text: "If you would like breakouts out of sight: 60% foundation coverage, measured at 1.5 m in indoor light.", refs: ["touch-1900"] },
    },
  },
];

const STATS = { ms: 9420, turns: 4, toolCalls: 14, inputTokens: 21800, outputTokens: 1900, repairs: 0 };

const results: DayPlan["results"] = {
  "obs-0900": obsVideo,
  "call-0900": callVideo,
  "fix-0900": fixVideo,
  "obs-0900-after": obsVideoFurther,
  "obs-1230": obsLunch,
  "rcpt-1230": rcptLunch,
  "obs-1900": obsDinner,
  "touch-1900": touchDinner,
};

/** The agent's plan after it passed the verifier. */
export const VERIFIED_PLAN: DayPlan = {
  day: WORKDAY,
  moments,
  summary: {
    text: "Only the video call is worth a thought: move the laptop back a little. Lunch and dinner look relaxed from where you will be.",
    refs: ["fix-0900", "obs-1230", "obs-1900"],
  },
  results,
  verified: true,
  issues: [],
  stats: STATS,
};

/** The deterministic fallback: built from the same results with fixed templates when the agent's wording was not accepted. */
export const FALLBACK_PLAN: DayPlan = {
  day: WORKDAY,
  moments: moments.map(({ headline, ...m }) => ({
    ...(void headline, m),
    notice: m.notice.slice(0, 1),
    outOfSight: m.outOfSight.slice(0, 1),
    action:
      m.action.kind === "none"
        ? m.action
        : { ...m.action, claim: { text: m.action.kind === "free_fix" ? "A change that works for free: the camera distance." : "A measured option: foundation coverage.", refs: [m.action.ref] } },
  })),
  summary: { text: "3 moments, each run through the model. Each card lists what shows from where you will be.", refs: ["obs-0900", "obs-1230", "obs-1900"] },
  results,
  verified: false,
  issues: [{ momentId: "m1", code: "stray_number", detail: "A number in the call advice is not in the cited results." }],
  stats: { ...STATS, repairs: 1 },
};

/** What the follow-up "What if lunch is outdoors?" returns: the same day with a new summary. */
export const FOLLOW_UP_PLAN: DayPlan = {
  ...VERIFIED_PLAN,
  summary: { text: "Outdoors at lunch, daylight is stronger and more of the fine detail shows; the plan for the call and for dinner stays as it was.", refs: ["obs-1230"] },
};

export const STEP_LABELS = [
  "Found 3 moments",
  "Working out how you will look on the call",
  "Running the vision model for lunch",
  "Running the vision model for dinner",
  "Looking for a free change for the call",
  "Checking each number against the model’s results",
];

/** The run's steps. Those that name a moment carry it, so the storyboard can sketch its scene as it is found. */
export function stepEvents(): RehearseEvent[] {
  return [
    { type: "step", tool: "list_scenes", label: STEP_LABELS[0] },
    { type: "step", tool: "video_call_frame", label: STEP_LABELS[1], moment: { title: "Video standup", scene: "video_call" } },
    { type: "step", tool: "observe_scene", label: STEP_LABELS[2], moment: { title: "Client lunch by the window", scene: "dinner_table" } },
    { type: "step", tool: "observe_scene", label: STEP_LABELS[3], moment: { title: "Dinner date", scene: "cafe_table" } },
    { type: "step", tool: "find_free_fix", label: STEP_LABELS[4] },
    { type: "step", tool: "final_answer", label: STEP_LABELS[5] },
  ];
}

/** The NDJSON body of a successful run: the steps, then the plan. */
export function ndjson(plan: DayPlan): string {
  return [...stepEvents(), { type: "plan", plan } satisfies RehearseEvent].map((e) => JSON.stringify(e)).join("\n") + "\n";
}

export function errorBody(code: Extract<RehearseEvent, { type: "error" }>["code"], message = "Not now."): string {
  return JSON.stringify({ type: "error", code, message } satisfies RehearseEvent) + "\n";
}
