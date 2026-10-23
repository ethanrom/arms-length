"use client";

/**
 * STUB (owned by the scene-art agent): line-art scenes per SceneId, light tints and layouts. Replace the bodies, keep
 * the exports and their props.
 */
import type { CallGeometry, LightId, SceneId } from "@/lib/contracts/rehearse";
import type { SceneArtProps, SceneLayout } from "./types";

export function sceneLayout(scene: SceneId, call?: CallGeometry): SceneLayout {
  if (scene === "video_call") {
    const gallery = call?.layout === "gallery";
    return gallery
      ? { face: { cx: 0.5, cy: 0.45 }, tile: { x: 0.53, y: 0.2, w: 0.2, h: 0.25 }, otherTiles: [{ x: 0.27, y: 0.2, w: 0.2, h: 0.25 }, { x: 0.27, y: 0.5, w: 0.2, h: 0.25 }, { x: 0.53, y: 0.5, w: 0.2, h: 0.25 }] }
      : { face: { cx: 0.5, cy: 0.45 }, tile: { x: 0.18, y: 0.08, w: 0.64, h: 0.72 } };
  }
  return { face: { cx: 0.5, cy: 0.42 } };
}

export function SceneBack(props: SceneArtProps) {
  void props;
  return null;
}

export function SceneFront(props: SceneArtProps) {
  void props;
  return null;
}

export function LightTint({ light, scene }: { light: LightId; scene: SceneId }) {
  void light;
  void scene;
  return null;
}
