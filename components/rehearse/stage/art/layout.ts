/**
 * Where things sit on the stage: the in-person eye lines and the laptop screen's tiles. Pure numbers (fractions of
 * the stage for the layout, 1600 x 1000 pixels for the drawing) so the art, the face and the tests share one source.
 */
import { SCENES, type CallGeometry, type SceneId } from "@/lib/contracts/rehearse";
import { callTileHeightFraction, inPersonHeightFraction } from "../pov";
import { STAGE_VIEWBOX, type SceneLayout, type StageRect } from "../types";

const { width: VW, height: VH } = STAGE_VIEWBOX;

/** The demo faces' photos are 228 to 277 mm tall; the picture is composed for a photo of this height. */
export const NOMINAL_PHOTO_MM = 250;
/** Eyes sit about 42% down the demo photos, so about 8% of the photo's height above its centre. */
const EYE_ABOVE_CENTRE = 0.08;

export type InPersonScene = Exclude<SceneId, "video_call">;

/** Eye line and horizontal centre of the face per scene, as fractions of the stage. */
const FRAME: Record<InPersonScene, { eyeY: number; cx: number }> = {
  close_talk: { eyeY: 0.43, cx: 0.5 },
  cafe_table: { eyeY: 0.4, cx: 0.5 },
  conversation: { eyeY: 0.38, cx: 0.5 },
  dinner_table: { eyeY: 0.4, cx: 0.5 },
  meeting_room: { eyeY: 0.4, cx: 0.5 },
  presenting: { eyeY: 0.37, cx: 0.6 },
};

/** The scene's default distance (video calls have none). */
function defaultDistanceM(scene: InPersonScene): number {
  return SCENES.find((s) => s.id === scene)?.distanceM ?? 1;
}

/** The photo's height as a fraction of the stage at the scene's default distance: what the props are sized to. */
export function nominalPhotoHeight(scene: InPersonScene): number {
  return inPersonHeightFraction(NOMINAL_PHOTO_MM, defaultDistanceM(scene));
}

export function inPersonFace(scene: InPersonScene): { cx: number; cy: number } {
  const f = FRAME[scene];
  return { cx: f.cx, cy: f.eyeY + EYE_ABOVE_CENTRE * nominalPhotoHeight(scene) };
}

/** Eye line in drawing pixels. */
export function eyeLineY(scene: InPersonScene): number {
  return FRAME[scene].eyeY * VH;
}

// ---------------------------------------------------------------------------------------------------------------
// The viewer's laptop on a desk, seen from the chair. Pixels in the 1600 x 1000 drawing space. The display is about
// 0.45 of the stage height (a 19 cm display at 60 cm is about 18 degrees of the 40 degree view), and the tiles are the
// heights pov.ts gives, so the face in a tile comes out the size it has in person at the call's equivalent distance.
// ---------------------------------------------------------------------------------------------------------------

export interface PxRect {
  x: number;
  y: number;
  w: number;
  h: number;
}

export const LAPTOP = {
  /** The lid's outer edge. */
  lid: { x: 380, y: 100, w: 840, h: 506 } satisfies PxRect,
  /** The display inside the bezel (16:9, a 15 inch laptop). */
  screen: { x: 400, y: 130, w: 800, h: 450 } satisfies PxRect,
  camera: { x: 800, y: 115 },
  /** Gap between the display's edge and the tiles, and between gallery tiles. */
  pad: 7,
  gap: 10,
  /** The control bar under the tiles. */
  barH: 26,
} as const;

/** Tiles are 16:9. */
export const TILE_ASPECT = 16 / 9;

/** Your tile on a call, in drawing pixels, plus the other tiles in gallery layout (2 x 2, yours top left). */
export function callTilesPx(layout: CallGeometry["layout"] | undefined): { tile: PxRect; others: PxRect[]; bar: PxRect } {
  const { screen, pad, gap, barH } = LAPTOP;
  const mode = layout === "gallery" ? "gallery" : "speaker";
  const h = callTileHeightFraction(mode) * VH;
  const w = h * TILE_ASPECT;
  const speakerH = callTileHeightFraction("speaker") * VH;
  const top = screen.y + pad;
  const bar: PxRect = { x: screen.x + screen.w / 2 - 150, y: top + speakerH + 8, w: 300, h: barH };
  if (mode === "speaker") return { tile: { x: screen.x + (screen.w - w) / 2, y: top, w, h }, others: [], bar };
  const gridW = 2 * w + gap;
  const gridH = 2 * h + gap;
  const x0 = screen.x + (screen.w - gridW) / 2;
  const y0 = top + (speakerH - gridH) / 2;
  const cell = (col: number, row: number): PxRect => ({ x: x0 + col * (w + gap), y: y0 + row * (h + gap), w, h });
  return { tile: cell(0, 0), others: [cell(1, 0), cell(0, 1), cell(1, 1)], bar };
}

const frac = (r: PxRect): StageRect => ({ x: r.x / VW, y: r.y / VH, w: r.w / VW, h: r.h / VH });

export function layoutFor(scene: SceneId, call?: CallGeometry): SceneLayout {
  if (scene !== "video_call") return { face: inPersonFace(scene) };
  const { tile, others } = callTilesPx(call?.layout);
  const t = frac(tile);
  const out: SceneLayout = { face: { cx: t.x + t.w / 2, cy: t.y + t.h / 2 }, tile: t };
  if (others.length) out.otherTiles = others.map(frac);
  return out;
}

/** Your tile and the whole display, as fractions of the stage (the light tint stays inside them). */
export function callRects(call?: CallGeometry): { tile: StageRect; screen: StageRect } {
  return { tile: frac(callTilesPx(call?.layout).tile), screen: frac(LAPTOP.screen) };
}

/**
 * The photo's box in drawing pixels: at the scene's default distance, or at `heightFraction` of the stage when the caller
 * knows how tall the face is drawn. Props that meet the shoulders are sized to it.
 */
export function nominalPhotoBox(scene: InPersonScene, heightFraction?: number, aspect = 0.67): { cx: number; top: number; w: number; h: number } {
  const { cx, cy } = inPersonFace(scene);
  const h = (heightFraction ?? nominalPhotoHeight(scene)) * VH;
  return { cx: cx * VW, top: cy * VH - h / 2, w: h * aspect, h };
}
