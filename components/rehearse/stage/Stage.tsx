"use client";

/**
 * One moment as the person there sees it: the scene's line art behind and in front, your face between them at its true
 * size (drawn by the model), and the light's tint. Held "mirror" shows the 25 cm view with no scene. Used for the
 * teaser, the building panels, the day view and the ribbon.
 */
import type { CallGeometry, LightId, ObserveResult, SceneId } from "@/lib/contracts/rehearse";
import { PovFace } from "./PovFace";
import { inPersonHeightFraction, photoHeightMm } from "./pov";
import { LightTint, SceneBack, SceneFront, sceneLayout } from "./scenes";
import type { StagePhoto } from "./types";

export interface StageProps {
  scene: SceneId;
  light: LightId;
  call?: CallGeometry;
  /** Null while the moment is still being worked out: the scene shows, the face doesn't yet. */
  observe: ObserveResult | null;
  photo: StagePhoto;
  mirror?: boolean;
  /** Their view enlarged to the mirror's framing, with no scene: for the "as they see it, closer" inset. */
  closer?: boolean;
  drawn?: number;
  priority?: "now" | "later";
  /** What the stage shows, for assistive tech. */
  label: string;
  className?: string;
}

export function Stage({ scene, light, call, observe, photo, mirror = false, closer = false, drawn = 1, priority = "now", label, className }: StageProps) {
  const layout = sceneLayout(scene, call);
  const bare = mirror || closer;
  // The scene's garment and foreground fit the face's drawn height (in person only; a call draws inside its tile).
  const photoHeight = observe && !call ? inPersonHeightFraction(photoHeightMm(photo.frame, photo.scale), observe.distanceM) : undefined;
  return (
    <div role="img" aria-label={label} className={`stage relative overflow-hidden ${className ?? ""}`} style={{ aspectRatio: "16 / 10" }}>
      {!bare && <SceneBack scene={scene} light={light} call={call} drawn={drawn} photoHeight={photoHeight} />}
      {observe && <PovFace photo={photo} observe={observe} layout={layout} call={call} mirror={mirror} closer={closer} priority={priority} />}
      {!bare && <SceneFront scene={scene} light={light} call={call} drawn={drawn} photoHeight={photoHeight} />}
      {!bare && <LightTint light={light} scene={scene} call={call} />}
    </div>
  );
}
