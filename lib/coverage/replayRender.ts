// Render adapters that serve recorded fixture renders (tests, and the demo mode of the app). Node only: it reads the
// disk and decodes PNGs with sharp, so it is not part of the barrel in index.ts.
// Matching is lib/youcam/replay.ts's: foundation takes the recorded render with the nearest `coverageIntensity` among
// those made with skin_smooth at 0; a simulation is served only if it changed every concern asked for. Each render
// carries the offset measured against the persona's input.
import sharp from "sharp";
import type { Lever, MakeupEffect, RenderResult, RgbaImage, SimulationStrengths } from "../contracts";
import { YouCamError } from "../youcam/errors";
import { decodeImageDataUrl } from "../youcam/imageinfo";
import { replayMakeup, replaySimulation } from "../youcam/replay";
import type { RenderedImage } from "./common";

async function decoded(result: RenderResult): Promise<RenderedImage> {
  const bytes = decodeImageDataUrl(result.imageRef);
  if (!bytes) throw new YouCamError("fixture_invalid", "That demo face is unavailable.", 500);
  const { data, info } = await sharp(bytes).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const photo: RgbaImage = { width: info.width, height: info.height, data: new Uint8ClampedArray(data.buffer, data.byteOffset, data.length) };
  return { photo, result };
}

/** `render` for `planCoverage`: the recorded makeup render nearest to the lever. The shade in `effects` does not matter. */
export function replayMakeupRender(persona: string) {
  return async (_lever: Lever, effects: MakeupEffect[]): Promise<RenderedImage> => decoded(await replayMakeup(persona, effects));
}

/** `render` for `whatIf`. */
export function replaySimulationRender(persona: string) {
  return async (strengths: SimulationStrengths): Promise<RenderedImage> => decoded(await replaySimulation(persona, strengths));
}
