/**
 * Turning a SceneInput into a ResolvedScene: the validated scene, light and viewer, the distance the model is run at, and
 * the viewing conditions. The agent picks ids; every number comes from the tables here and in the contract.
 */
import type { CallGeometry, LightId, SceneInput, SceneTemplate, ViewerId } from "../contracts/rehearse";
import { SCENES, VIEWER_ACUITY } from "../contracts/rehearse";
import type { CallFrameResult } from "../contracts/rehearse";
import type { ViewingConditions } from "../contracts/vision";
import { formatDistance } from "../copy/distance";
import { viewingAt } from "../science/visibility";
import { LUMINANCE_PRESETS } from "../vision/params";
import { DEVICES, VIEWER_SCREEN, videoCallFrame, validateCall } from "./call";
import { SceneError, hasOwn } from "./errors";

export interface ResolvedScene {
  scene: SceneTemplate;
  light: LightId;
  viewer: ViewerId;
  distanceM: number;
  viewing: ViewingConditions;
  /** video_call only: the geometry result (its ref is "call"; observe_scene re-keys it). */
  call?: CallFrameResult;
}

export interface LightInfo {
  /** Plain label, as quoted ("evening light at home"). */
  label: string;
  /** What it is, in words, and where the number comes from. */
  source: string;
}

/** The cd/m^2 are LUMINANCE_PRESETS (lib/vision/params.ts, research 7); these are only the words. */
export const LIGHTS: Record<LightId, LightInfo> = {
  home: { label: "evening light at home", source: "Evening light at home: lamps, roughly 50 to 150 lux on the face. Skin is modelled as a matte surface that reflects about 35% (research 7)." },
  indoor: { label: "indoor light", source: "Office or well-lit indoor light, roughly 400 lux on the face. Skin is modelled as a matte surface that reflects about 35% (research 7)." },
  overcast: { label: "window or overcast light", source: "Overcast sky or light from a window, roughly 1,000 to 5,000 lux on the face. Skin is modelled as a matte surface that reflects about 35% (research 7)." },
  daylight: { label: "bright daylight", source: "Daylight outdoors in shade or sun, roughly 10,000 to 25,000 lux on the face. Skin is modelled as a matte surface that reflects about 35% (research 7)." },
  videoCall: { label: "video call light", source: "On a video call the other person's eyes are adapted to a screen of 200 to 300 cd/m2, and a face on it is about 0.35 of white (research 7)." },
};

export const VIEWER_LABEL: Record<ViewerId, string> = {
  typical: "typical eyes (20/20)",
  blurry: "blurrier eyes (20/40), such as without glasses",
};

export function lightLuminance(light: LightId): number {
  if (!hasOwn(LUMINANCE_PRESETS, light)) throw new SceneError(`Unknown light "${String(light)}". Valid lights: ${Object.keys(LUMINANCE_PRESETS).join(", ")}.`);
  return LUMINANCE_PRESETS[light];
}

export function viewingFor(light: LightId, viewer: ViewerId): ViewingConditions {
  return { ...viewingAt(lightLuminance(light)), acuityScale: VIEWER_ACUITY[viewer] };
}

const EPS = 1e-9;

/**
 * Validates and resolves a scene. Throws SceneError (code "bad_scene") for: an unknown scene, light or viewer; a distance
 * override outside the scene's range, or on a video call; a video call without a call. `null` counts as "not given".
 */
export function resolveScene(input: SceneInput): ResolvedScene {
  const scene = SCENES.find((s) => s.id === input?.scene);
  if (!scene) throw new SceneError(`Unknown scene "${String(input?.scene)}". Valid scenes: ${SCENES.map((s) => s.id).join(", ")}.`);

  const light = input.light ?? scene.light;
  if (!hasOwn(LUMINANCE_PRESETS, light)) throw new SceneError(`Unknown light "${String(light)}". Valid lights: ${Object.keys(LUMINANCE_PRESETS).join(", ")}.`);
  const viewer = input.viewer ?? "typical";
  if (!hasOwn(VIEWER_ACUITY, viewer)) throw new SceneError(`Unknown viewer "${String(viewer)}". Valid viewers: ${Object.keys(VIEWER_ACUITY).join(", ")}.`);
  const viewing = viewingFor(light, viewer);

  if (scene.id === "video_call") {
    if (input.distanceM != null) throw new SceneError("video_call has no distanceM: the distance comes from the camera and screen geometry. Give call instead.");
    if (input.call == null) throw new SceneError("video_call needs call: { device, cameraDistanceCm, layout }.");
    const call = videoCallFrame(validateCall(input.call), "call");
    return { scene, light, viewer, distanceM: call.equivalentDistanceM, viewing, call };
  }

  const [lo, hi] = scene.rangeM as [number, number];
  let distanceM = scene.distanceM as number;
  if (input.distanceM != null) {
    const d = input.distanceM;
    if (typeof d !== "number" || !Number.isFinite(d) || d < lo - EPS || d > hi + EPS) {
      throw new SceneError(`distanceM ${String(d)} is outside the range for ${scene.id}: ${formatDistance(lo)} to ${formatDistance(hi)} (${lo} to ${hi} m). ${scene.source}`);
    }
    distanceM = d;
  }
  return { scene, light, viewer, distanceM, viewing };
}

// ---------------------------------------------------------------------------------------------------------------
// The catalogue the agent's list_scenes tool shows.
// ---------------------------------------------------------------------------------------------------------------

export interface SceneCatalog {
  scenes: SceneTemplate[];
  lights: { id: LightId; label: string; source: string }[];
  viewers: { id: ViewerId; label: string }[];
  calls: {
    device: CallGeometry["device"];
    typicalCameraCm: number;
    maxCameraCm: number;
    layouts: CallGeometry["layout"][];
  }[];
  viewerScreen: { distanceCm: number; speakerTileCm: number; galleryTileCm: number };
}

export function listScenes(): SceneCatalog {
  return {
    scenes: [...SCENES],
    lights: (Object.keys(LIGHTS) as LightId[]).map((id) => ({ id, label: LIGHTS[id].label, source: LIGHTS[id].source })),
    viewers: (Object.keys(VIEWER_ACUITY) as ViewerId[]).map((id) => ({ id, label: VIEWER_LABEL[id] })),
    calls: (Object.keys(DEVICES) as CallGeometry["device"][]).map((device) => ({
      device,
      typicalCameraCm: DEVICES[device].typicalCm,
      maxCameraCm: DEVICES[device].maxCm,
      layouts: ["speaker", "gallery"],
    })),
    viewerScreen: {
      distanceCm: VIEWER_SCREEN.distanceM * 100,
      speakerTileCm: VIEWER_SCREEN.tileHeightM.speaker * 100,
      galleryTileCm: VIEWER_SCREEN.tileHeightM.gallery * 100,
    },
  };
}
