/**
 * Our model's answer for a moment, on a demo face. The unaided model picks a scene, light and viewer; this turns that choice into
 * a SceneInput (a video call gets the default call of the device the day implies) and asks observeScene.
 */
import type { ObserveResult, RehearseFace, SceneInput } from "../../lib/contracts/rehearse";
import { SCENES, VIEWER_ACUITY } from "../../lib/contracts/rehearse";
import { loadBundle } from "../../lib/integration/demo";
import { LIGHTS, defaultCall, faceFromBundle, observeScene } from "../../lib/rehearse";
import type { MomentChoice } from "./score";

const faces = new Map<string, RehearseFace>();

export function faceOf(id: string): RehearseFace {
  let f = faces.get(id);
  if (!f) {
    const bundle = loadBundle(id);
    if (!bundle) throw new Error(`no demo bundle for ${id}`);
    faces.set(id, (f = faceFromBundle(bundle)));
  }
  return f;
}

/** null when the ids are not in the tables: the choice cannot be scored. */
export function sceneInputOf(m: Pick<MomentChoice, "scene" | "light" | "viewer">, device: "laptop" | "phone"): SceneInput | null {
  const scene = SCENES.find((s) => s.id === m.scene);
  if (!scene) return null;
  if (!Object.prototype.hasOwnProperty.call(LIGHTS, m.light)) return null;
  if (!Object.prototype.hasOwnProperty.call(VIEWER_ACUITY, m.viewer)) return null;
  const base = { scene: scene.id, light: m.light as SceneInput["light"], viewer: m.viewer as SceneInput["viewer"] };
  return scene.id === "video_call" ? { ...base, call: defaultCall(device) } : base;
}

export function truthFor(face: RehearseFace, input: SceneInput): ObserveResult {
  return observeScene(face, input, "truth");
}
