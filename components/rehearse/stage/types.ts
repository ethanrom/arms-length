/**
 * Shared shapes for the "Tomorrow, from their side" stage. Every scene is drawn on a 16:10 stage; all positions here are
 * fractions of the stage (0..1), so the scene art (scenes.tsx), the true-size face (PovFace.tsx) and the shell agree.
 */
import type { Box, ScaleEstimate } from "@/lib/contracts";
import type { CallGeometry, LightId, ObserveResult, SceneId } from "@/lib/contracts/rehearse";

export const STAGE_ASPECT = 16 / 10;
/** The SVG coordinate space the scene art uses for the same stage. */
export const STAGE_VIEWBOX = { width: 1600, height: 1000 } as const;

export interface StageRect {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface SceneLayout {
  /** In person: where the centre of the face photo sits. Its size comes from pov.ts (true angular size). */
  face: { cx: number; cy: number };
  /** Video calls: your tile on the viewer's screen. The face is drawn inside it instead. */
  tile?: StageRect;
  /** Video calls in gallery layout: the other people's tiles (plain placeholders). */
  otherTiles?: StageRect[];
}

export interface SceneArtProps {
  scene: SceneId;
  light: LightId;
  /** Video calls only. */
  call?: CallGeometry;
  /** 0..1: how much of the line art has drawn in (the building stage animates it). Default 1. */
  drawn?: number;
}

export interface StagePhoto {
  src: string;
  alt: string;
  frame: { width: number; height: number };
  scale: ScaleEstimate;
  /** The cheek and nose patch the Step back loupe magnifies (frame px). */
  focus?: Box;
}

export interface PovFaceProps {
  photo: StagePhoto;
  /** Distance and viewing for the model's render (for calls: the equivalent distance and the call light). */
  observe: ObserveResult;
  layout: SceneLayout;
  call?: CallGeometry;
  /** Held "your mirror": the 25 cm view, the face filling the stage. */
  mirror?: boolean;
  /** Render order hint: the visible moment first, its neighbours later. */
  priority?: "now" | "later";
}
