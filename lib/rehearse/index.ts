/**
 * "Rehearse your day" engines: pure, deterministic, isomorphic tools (no Node APIs) that run our vision model on a face's
 * existing measurements. The agent (lib/agent, server) and the UI (browser) both call these; every number a tool returns
 * is in its result's `quotes` (key scheme in ./quotes.ts), and the verifier accepts a number only from there.
 * Nothing here calls YouCam or any LLM.
 */
import type { ReadingBundle } from "../integration/types";
import type { RehearseFace } from "../contracts/rehearse";

export { SceneError } from "./errors";
export { lightLuminance, resolveScene, listScenes, LIGHTS, VIEWER_LABEL } from "./scenes";
export type { ResolvedScene, SceneCatalog } from "./scenes";
export { videoCallFrame, defaultCall, DEVICES, VIEWER_SCREEN, CAMERA_CM_RANGE } from "./call";
export { observeScene } from "./observe";
export { findFreeFix, softerLight, FREE_FIX_GOAL } from "./fix";
export { lightestTouch, worthIt, receiptAt } from "./tools";

/** The numbers the tools run on: measurements plus the recorded try-on plans and Skin Simulations (no renders, no photo). */
export function faceFromBundle(bundle: ReadingBundle): RehearseFace {
  return {
    measurements: bundle.measurements,
    coverage: bundle.coverageEntries.map((e) => e.plan),
    worthIt: bundle.worthIt.map((w) => {
      const { render, ...lite } = w.whatIf;
      void render;
      return lite;
    }),
  };
}
