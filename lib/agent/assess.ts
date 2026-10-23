/**
 * assess_moment: everything the plan needs to know about one moment, in one deterministic step. It is the old tool chain run
 * server-side: the video call frame (calls), the observation, a free-fix search for the concerns a typical viewer can pick out, and
 * the measured lightest touch for what no free change reaches. Every sub-result is filed under its own ref, exactly as the single
 * tools would have filed it, so the verifier and the UI are unchanged. A model turn costs 5 to 9 seconds; this saves three of them.
 *
 * The free-fix search is a group search: all the concerns together first, then, if that is not reachable (a large soft area such as
 * under-eye shadows usually is not), the largest group of the easiest concerns that one change does reach. The fallback plan uses the
 * same function, so the agent and its fallback choose actions the same way.
 */
import type { ConcernId, FreeFixResult, LightestTouchResult, ObserveResult, CallFrameResult, RehearseFace, SceneInput, ToolName } from "@/lib/contracts";
import { FREE_FIX_GOAL } from "@/lib/rehearse";
import type { createRunStore } from "./results";
import type { RehearseEngine } from "./types";

type Store = ReturnType<typeof createRunStore>;
export type StepFn = (tool: ToolName, input: unknown) => void;

export interface Assessment {
  frame: CallFrameResult | null;
  observe: ObserveResult;
  /** The concerns a typical viewer can pick out (share above the goal, or a soft area in sight), easiest first. */
  needs: ConcernId[];
  /** The largest group of `needs` one free change reaches, and the search for it (reachable). Empty when none does. */
  group: ConcernId[];
  freeFix: FreeFixResult | null;
  /** The search over all of `needs` when it was not reachable: its `limit` quote says what the strongest free setting leaves. */
  limit: FreeFixResult | null;
  /** The measured plans (met or not_met) for the concerns no free change reaches. Empty when the user would rather not wear makeup. */
  touches: LightestTouchResult[];
  /** Why there may be no touches: the user's preference, or no measured plan for the concerns that need one. */
  makeup: "not_needed" | "declined" | "available" | "none_measured";
}

/** Concerns in sight, easiest (smallest share) first. Soft areas (share 1) come last, which is where the group search stops. */
export function concernsToPutOutOfSight(observe: ObserveResult): ConcernId[] {
  return observe.concerns
    .filter((c) => c.targetCount > 0 && c.typicalShare > FREE_FIX_GOAL + 1e-9)
    .sort((a, b) => a.typicalShare - b.typicalShare)
    .map((c) => c.concern);
}

/** The free-fix and lightest-touch part, for an observation that is already filed. */
export function assessObserved(args: {
  observe: ObserveResult;
  scene: SceneInput;
  title: string;
  face: RehearseFace;
  engine: RehearseEngine;
  noMakeup: boolean;
  store: Store;
  step?: StepFn;
}): Omit<Assessment, "frame" | "observe"> {
  const { observe, scene, title, face, engine, noMakeup, store, step } = args;
  const needs = concernsToPutOutOfSight(observe);
  if (needs.length === 0) return { needs, group: [], freeFix: null, limit: null, touches: [], makeup: "not_needed" };

  step?.("find_free_fix", { label: title });
  // Probes use a throwaway ref: only the searches that are kept get a real one.
  const all = engine.findFreeFix(face, { moment: scene, concerns: needs }, "probe");
  let group: ConcernId[] = [];
  if (all.reachable && all.lever) group = needs;
  else {
    for (let k = 1; k < needs.length; k++) {
      const probe = engine.findFreeFix(face, { moment: scene, concerns: needs.slice(0, k) }, "probe");
      if (!probe.reachable || !probe.lever) break;
      group = needs.slice(0, k);
    }
  }

  let freeFix: FreeFixResult | null = null;
  if (group.length) {
    freeFix = engine.findFreeFix(face, { moment: scene, concerns: group }, store.nextRef());
    store.commit(freeFix);
  }
  let limit: FreeFixResult | null = null;
  if (group.length < needs.length) {
    limit = engine.findFreeFix(face, { moment: scene, concerns: needs }, store.nextRef());
    store.commit(limit);
  }

  const rest = needs.filter((c) => !group.includes(c));
  const touches: LightestTouchResult[] = [];
  let makeup: Assessment["makeup"] = "not_needed";
  if (rest.length) {
    if (noMakeup) makeup = "declined";
    else {
      for (const concern of rest) {
        step?.("lightest_touch", { concern });
        const touch = engine.lightestTouch(face, concern, store.nextRef());
        if (touch.status === "met" || touch.status === "not_met") {
          store.commit(touch);
          touches.push(touch);
        }
      }
      makeup = touches.length ? "available" : "none_measured";
    }
  }
  return { needs, group, freeFix, limit, touches, makeup };
}

/** Frame (calls), observation, then the rest. Throws what the engine throws for a scene it cannot resolve (SceneError). */
export function assessMoment(args: {
  scene: SceneInput;
  title: string;
  face: RehearseFace;
  engine: RehearseEngine;
  noMakeup: boolean;
  store: Store;
  step?: StepFn;
}): Assessment {
  const { scene, title, face, engine, noMakeup, store, step } = args;
  let frame: CallFrameResult | null = null;
  if (scene.scene === "video_call" && scene.call) {
    step?.("video_call_frame", { label: title });
    frame = engine.videoCallFrame(scene.call, store.nextRef());
    store.commit(frame);
  }
  step?.("observe_scene", { label: title, scene: scene.scene });
  const observe = engine.observeScene(face, scene, store.nextRef());
  store.commit(observe);
  return { frame, observe, ...assessObserved({ observe, scene, title, face, engine, noMakeup, store, step }) };
}
