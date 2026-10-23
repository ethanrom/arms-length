"use client";

/**
 * The line-art scenes for "Tomorrow, from their side": one calm picture of the place per SceneId, drawn in our own
 * SVG on the stage grey so a face photo's surround melts into the wall. SceneBack draws behind the face (walls, windows,
 * screens, chairs); SceneFront draws in front (a table edge that hides the shoulders, cups, other people's heads).
 * LightTint is a faint wash per light that never changes what the face shows. All art is decorative (aria-hidden).
 */
import type { ComponentType, CSSProperties } from "react";
import type { CallGeometry, LightId, SceneId } from "@/lib/contracts/rehearse";
import { CafeBack, CafeFront } from "./art/cafe";
import { CallBack, CallFront } from "./art/call";
import { CloseBack, CloseFront } from "./art/close";
import { DinnerBack, DinnerFront } from "./art/dinner";
import { ConversationBack, ConversationFront } from "./art/conversation";
import { Canvas, useUid } from "./art/ink";
import { callRects, layoutFor } from "./art/layout";
import { MeetingBack, MeetingFront } from "./art/meeting";
import { PresentingBack, PresentingFront } from "./art/presenting";
import type { SceneArtProps, SceneLayout } from "./types";

type ArtPart = ComponentType<{ uid: string; call?: CallGeometry }>;

const BACK: Record<SceneId, ArtPart> = {
  close_talk: CloseBack,
  cafe_table: CafeBack,
  conversation: ConversationBack,
  dinner_table: DinnerBack,
  meeting_room: MeetingBack,
  presenting: PresentingBack,
  video_call: CallBack,
};

const FRONT: Record<SceneId, ArtPart> = {
  close_talk: CloseFront,
  cafe_table: CafeFront,
  conversation: ConversationFront,
  dinner_table: DinnerFront,
  meeting_room: MeetingFront,
  presenting: PresentingFront,
  video_call: CallFront,
};

/** Where the face goes on this stage: the photo centre in person, or your tile (and the others) on a call. */
export function sceneLayout(scene: SceneId, call?: CallGeometry): SceneLayout {
  return layoutFor(scene, call);
}

export function SceneBack({ scene, call, drawn = 1 }: SceneArtProps) {
  const uid = useUid();
  const Part = BACK[scene];
  return (
    <Canvas drawn={drawn}>
      <Part uid={uid} call={call} />
    </Canvas>
  );
}

export function SceneFront({ scene, call, drawn = 1 }: SceneArtProps) {
  const uid = useUid();
  const Part = FRONT[scene];
  return (
    <Canvas drawn={drawn}>
      <Part uid={uid} call={call} />
    </Canvas>
  );
}

/** Each light is a wash of at most 0.12 alpha: warm and dim at home, nearly nothing indoors, cool and soft when overcast,
 * bright with one crisp edge in daylight. On a call the cool glow stays inside the tile. */
function tintFor(light: LightId, scene: SceneId): string[] {
  const eff = light === "videoCall" && scene !== "video_call" ? "indoor" : light;
  switch (eff) {
    case "home":
      return ["radial-gradient(ellipse 75% 85% at 50% 42%, rgba(255,170,90,0.07), rgba(60,30,0,0.12) 100%)"];
    case "indoor":
      return ["linear-gradient(180deg, rgba(255,255,255,0.03), rgba(255,255,255,0) 70%)"];
    case "overcast":
      return ["linear-gradient(180deg, rgba(255,255,255,0.05), rgba(255,255,255,0) 65%)", "linear-gradient(0deg, rgba(150,175,210,0.09), rgba(150,175,210,0.09))"];
    case "daylight":
      return [
        "linear-gradient(112deg, rgba(255,255,255,0) 40%, rgba(255,255,255,0.07) 40.4%, rgba(255,255,255,0.07) 55%, rgba(255,255,255,0) 55.4%)",
        "linear-gradient(112deg, rgba(255,248,225,0.11), rgba(255,248,225,0.02) 65%)",
      ];
    default:
      return ["radial-gradient(ellipse 70% 70% at 50% 42%, rgba(150,190,255,0.12), rgba(150,190,255,0.05) 65%, rgba(150,190,255,0) 100%)"];
  }
}

export function LightTint({ light, scene, call }: { light: LightId; scene: SceneId; call?: CallGeometry }) {
  const layers = tintFor(light, scene);
  const style: CSSProperties = { background: layers.join(", ") };
  if (light === "videoCall" && scene === "video_call") {
    const { tile, screen } = callRects(call);
    const box = call ? tile : screen;
    Object.assign(style, { left: `${box.x * 100}%`, top: `${box.y * 100}%`, width: `${box.w * 100}%`, height: `${box.h * 100}%`, right: "auto", bottom: "auto", borderRadius: "0.5%" });
  }
  return <div aria-hidden="true" className="pointer-events-none absolute inset-0" style={style} />;
}
