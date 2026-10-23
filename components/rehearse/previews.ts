import type { ObserveResult, SceneInput } from "@/lib/contracts/rehearse";
import { defaultCall, resolveScene } from "@/lib/rehearse";

/** The three pictures on the results page: the same scenes the day uses, at the table's own distances and lights. */
export const PREVIEW_SCENES: readonly { key: string; label: string; input: SceneInput }[] = [
  { key: "call", label: "On a laptop call", input: { scene: "video_call", call: defaultCall("laptop") } },
  { key: "lunch", label: "Across a lunch table", input: { scene: "dinner_table", light: "overcast" } },
  { key: "dinner", label: "Dinner at home", input: { scene: "dinner_table", light: "home" } },
];

/**
 * The distance and viewing the model would use for a scene, in an ObserveResult with no counts: all a picture needs, and cheap
 * (no visibility report), so the results page can show the teaser without running the agent or the full model.
 */
export function previewObserve(input: SceneInput, ref: string): ObserveResult {
  const r = resolveScene(input);
  return {
    ref,
    quotes: {},
    assumptions: [],
    input: { scene: r.scene.id, light: r.light, viewer: r.viewer, ...(r.call ? { call: r.call.call } : {}) },
    distanceM: r.distanceM,
    luminanceCdM2: r.viewing.luminanceCdM2,
    acuityScale: r.viewing.acuityScale,
    concerns: [],
  };
}
