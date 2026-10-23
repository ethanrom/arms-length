import { describe, expect, it } from "vitest";
import { EXAMPLE_DAYS, type DayPlan, type RehearseEvent, type RunStats } from "@/lib/contracts";
import { UI_LISTS } from "@/lib/copy/banned";
import { lintText } from "@/lib/copy/lint";
import { buildFallbackPlan, parseDayFallback } from "./fallback";
import { realEngine } from "./realEngine";
import { DEMO_IDS, demoFace } from "./test-helpers";
import type { AgentRequest } from "./types";
import { verifyPlan } from "./verify";

const stats: RunStats = { ms: 0, turns: 0, toolCalls: 0, inputTokens: 0, outputTokens: 0, repairs: 0 };

/** Every string a user could read in a plan. */
function visibleText(plan: DayPlan): string[] {
  return [
    plan.summary.text,
    ...plan.moments.flatMap((m) => [m.title, m.time ?? "", ...m.assumptions, ...m.notice.map((c) => c.text), ...m.outOfSight.map((c) => c.text), m.action.claim.text]),
  ].filter(Boolean);
}

function check(plan: DayPlan, request: AgentRequest) {
  expect(plan.verified).toBe(false);
  expect(plan.moments.length).toBeGreaterThanOrEqual(1);
  expect(plan.moments.length).toBeLessThanOrEqual(8);
  expect(verifyPlan({ moments: plan.moments, summary: plan.summary }, plan.results, request.prefs)).toEqual([]);
  for (const text of visibleText(plan)) {
    expect(lintText(text, UI_LISTS), text).toEqual([]);
    expect(text.length).toBeLessThanOrEqual(200);
  }
  // Every ref a claim cites is in the plan's results, and so is a free fix's re-observed scene.
  for (const m of plan.moments) {
    for (const ref of [m.observeRef, ...[...m.notice, ...m.outOfSight, m.action.claim].flatMap((c) => c.refs)]) expect(plan.results[ref], ref).toBeDefined();
    if (m.action.kind === "free_fix") expect(plan.results[`${m.action.ref}.after`]).toBeDefined();
    if (request.prefs.noMakeup) expect(m.action.kind).not.toBe("lightest_touch");
  }
}

describe("buildFallbackPlan", () => {
  for (const id of DEMO_IDS) {
    for (const example of EXAMPLE_DAYS) {
      for (const prefs of [
        { callDevice: "laptop" as const, noMakeup: false },
        { callDevice: "phone" as const, noMakeup: true },
      ]) {
        it(`passes the verifier: ${id} / ${example.id} / ${prefs.callDevice}${prefs.noMakeup ? " / no makeup" : ""}`, () => {
          const request: AgentRequest = { day: example.day, prefs };
          check(buildFallbackPlan({ request, face: demoFace(id), engine: realEngine, stats }), request);
        });
      }
    }
  }

  it("is deterministic and keeps the stats and issues it is given", () => {
    const request: AgentRequest = { day: EXAMPLE_DAYS[0].day, prefs: { callDevice: "laptop", noMakeup: false } };
    const issues = [{ momentId: "m1", code: "stray_number" as const, detail: "x" }];
    const a = buildFallbackPlan({ request, face: demoFace("p3a"), engine: realEngine, stats: { ...stats, turns: 2 }, issues });
    const b = buildFallbackPlan({ request, face: demoFace("p3a"), engine: realEngine, stats: { ...stats, turns: 2 }, issues });
    expect(a).toEqual(b);
    expect(a.stats.turns).toBe(2);
    expect(a.issues).toEqual(issues);
  });

  it("uses the moments the model chose, and the scene's own defaults when its distance is out of range", () => {
    const request: AgentRequest = { day: "anything", prefs: { callDevice: "laptop", noMakeup: false } };
    const plan = buildFallbackPlan({
      request,
      face: demoFace("p2b"),
      engine: realEngine,
      stats,
      moments: [
        { title: "Dinner date", time: "7pm", scene: { scene: "dinner_table", distanceM: 9 } },
        { title: "Not a flaw treatment 5", time: null, scene: { scene: "presenting" } },
        { title: null, time: "x".repeat(40), scene: { scene: "video_call" } },
      ],
    });
    check(plan, request);
    expect(plan.moments.map((m) => [m.title, m.time, m.scene.scene])).toEqual([
      ["Dinner date", "7pm", "dinner_table"],
      ["Presenting", null, "presenting"],
      ["Video call", null, "video_call"],
    ]);
    expect(plan.moments[2].scene.call?.device).toBe("laptop");
    expect(plan.moments[0].scene.distanceM).toBe(1.5);
  });

  it("builds a call for the user's device", () => {
    const request: AgentRequest = { day: "a video call", prefs: { callDevice: "phone", noMakeup: false } };
    const plan = buildFallbackPlan({ request, face: demoFace("p3a"), engine: realEngine, stats });
    check(plan, request);
    expect(plan.moments[0].scene.call).toMatchObject({ device: "phone", cameraDistanceCm: 35 });
  });

  it("emits a step per tool it runs", () => {
    const events: RehearseEvent[] = [];
    const request: AgentRequest = { day: EXAMPLE_DAYS[0].day, prefs: { callDevice: "laptop", noMakeup: false } };
    buildFallbackPlan({ request, face: demoFace("p2b"), engine: realEngine, stats, emit: (e) => events.push(e) });
    const steps = events.flatMap((e) => (e.type === "step" ? [e] : []));
    expect(steps.length).toBeGreaterThanOrEqual(3);
    expect(steps[0]).toMatchObject({ tool: "observe_scene", label: 'Running the vision model for "Video call"' });
    for (const s of steps) expect(lintText(s.label)).toEqual([]);
  });

  describe("follow-ups", () => {
    const previous = {
      day: EXAMPLE_DAYS[0].day,
      moments: [
        { title: "Video standup", time: "9am", scene: { scene: "video_call" as const, call: { device: "laptop" as const, cameraDistanceCm: 50, layout: "gallery" as const } } },
        { title: "Client lunch", time: null, scene: { scene: "dinner_table" as const, light: "home" as const } },
      ],
    };

    it("changes the light of the moment the question names", () => {
      const request: AgentRequest = { day: previous.day, prefs: { callDevice: "laptop", noMakeup: false }, followUp: { question: "What if lunch is outdoors?", previous } };
      const plan = buildFallbackPlan({ request, face: demoFace("p3a"), engine: realEngine, stats });
      check(plan, request);
      expect(plan.moments.map((m) => m.scene.light)).toEqual(["videoCall", "daylight"]);
      expect(plan.summary.text).not.toContain("could not work out");
    });

    it("says so when it cannot apply the change", () => {
      const request: AgentRequest = { day: previous.day, prefs: { callDevice: "laptop", noMakeup: false }, followUp: { question: "What about the weather?", previous } };
      const plan = buildFallbackPlan({ request, face: demoFace("p3a"), engine: realEngine, stats });
      check(plan, request);
      expect(plan.moments).toHaveLength(2);
      expect(plan.summary.text).toContain("I could not work out that change");
    });
  });
});

describe("parseDayFallback", () => {
  const scenes = (day: string) => parseDayFallback(day).map((m) => [m.scene.scene, m.scene.light ?? null]);

  it("maps the keywords to scenes", () => {
    expect(scenes("a zoom call")).toEqual([["video_call", null]]);
    expect(scenes("morning standup")).toEqual([["video_call", null]]);
    expect(scenes("dinner")).toEqual([["dinner_table", null]]);
    expect(scenes("a date")).toEqual([["dinner_table", null]]);
    expect(scenes("coffee with Sam")).toEqual([["cafe_table", null]]);
    expect(scenes("I am presenting")).toEqual([["presenting", null]]);
    expect(scenes("the quarterly meeting")).toEqual([["meeting_room", null]]);
    expect(scenes("a wedding")).toEqual([["close_talk", null]]);
    expect(scenes("dancing")).toEqual([["close_talk", null]]);
    expect(scenes("a big hug")).toEqual([["close_talk", null]]);
  });

  it("reads light from outdoor and sun words", () => {
    expect(scenes("lunch outdoors")).toEqual([["dinner_table", "daylight"]]);
    expect(scenes("coffee in the sun")).toEqual([["cafe_table", "daylight"]]);
  });

  it("splits the example days into the moments a person would", () => {
    expect(scenes(EXAMPLE_DAYS[0].day)).toEqual([["video_call", null], ["dinner_table", "daylight"], ["dinner_table", null]]);
    expect(scenes(EXAMPLE_DAYS[1].day)).toEqual([["presenting", null], ["conversation", null]]);
    expect(scenes(EXAMPLE_DAYS[2].day)).toEqual([["close_talk", "daylight"], ["dinner_table", null], ["close_talk", null]]);
    expect(parseDayFallback(EXAMPLE_DAYS[0].day).map((m) => m.time)).toEqual(["9am", null, "at 7"]);
  });

  it("falls back to one standing conversation, and never returns more than 8 moments", () => {
    expect(scenes("nothing in particular")).toEqual([["conversation", null]]);
    expect(parseDayFallback(Array.from({ length: 12 }, () => "coffee").join(", "))).toHaveLength(8);
  });
});
