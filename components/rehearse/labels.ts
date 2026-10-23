import { SCENES, type LightId, type SceneId, type SceneTemplate, type ViewerId } from "@/lib/contracts/rehearse";

/** The words for the lights the model knows (LUMINANCE_PRESETS, lib/vision/params.ts). */
export const LIGHT_OPTIONS: readonly { id: LightId; label: string }[] = [
  { id: "home", label: "Evening at home" },
  { id: "indoor", label: "Indoor light" },
  { id: "overcast", label: "Window light" },
  { id: "daylight", label: "Daylight" },
  { id: "videoCall", label: "Screen glow" },
];

export const VIEWER_OPTIONS: readonly { id: ViewerId; label: string; short: string }[] = [
  { id: "typical", label: "Typical eyes", short: "Typical eyes" },
  { id: "blurry", label: "Blurrier eyes (20/40)", short: "Blurrier eyes" },
];

export const lightLabel = (id: LightId): string => LIGHT_OPTIONS.find((l) => l.id === id)?.label ?? id;
export const viewerShort = (id: ViewerId): string => VIEWER_OPTIONS.find((v) => v.id === id)?.short ?? id;

export const sceneOf = (id: SceneId): SceneTemplate | undefined => SCENES.find((s) => s.id === id);

/** The chip text for a scene: the table's label up to the first colon ("Close: a hug, a whisper" reads as "Close"). */
export const sceneLabel = (id: SceneId): string => {
  const label = sceneOf(id)?.label ?? id;
  return label.split(":")[0];
};
