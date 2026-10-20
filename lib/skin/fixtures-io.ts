// Node-only helper: loads a recorded fixture persona as the inputs of `measureAnalysis`.
// Used by tests and scripts/skin; never imported by app or worker code (it needs sharp and the disk).
import sharp from "sharp";
import { concernFromAction, type ConcernResult, type RgbaImage, type SkinAnalysis } from "../contracts";
import { fixturePath, loadFixtureAnalysis, type FixtureQuality } from "../youcam/fixtures";

export async function decodeImage(file: string): Promise<RgbaImage> {
  const { data, info } = await sharp(file).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  return { width: info.width, height: info.height, data: new Uint8ClampedArray(data.buffer, data.byteOffset, data.length) };
}

export interface LoadedPersona {
  analysis: SkinAnalysis;
  /** Keyed by `ConcernResult.maskRef` (the persona-relative path, e.g. "masks/hd/hd_pore_whole.png"). */
  masks: Map<string, RgbaImage>;
  photo: RgbaImage;
}

export async function loadPersona(persona: string, quality: FixtureQuality = "hd"): Promise<LoadedPersona> {
  const raw = loadFixtureAnalysis(persona, quality);
  const photo = await decodeImage(fixturePath(persona, "input.jpg"));
  const results: ConcernResult[] = [];
  const masks = new Map<string, RgbaImage>();
  let skinAge: number | null = null;
  let overall: number | null = null;
  for (const item of raw.results.output) {
    if (item.type === "skin_age") skinAge = item.score ?? null;
    else if (item.type === "all") overall = item.score ?? null;
    const concern = concernFromAction(item.type);
    if (!concern) continue;
    const rel = item.mask_urls?.[0] ?? null;
    if (rel && !masks.has(rel)) masks.set(rel, await decodeImage(fixturePath(persona, rel)));
    results.push({ concern, region: item.region ?? "whole", rawScore: item.raw_score ?? 0, uiScore: item.ui_score ?? 0, maskRef: rel });
  }
  return {
    analysis: { engine: quality, frame: { width: photo.width, height: photo.height }, results, skinAge, overall },
    masks,
    photo,
  };
}
