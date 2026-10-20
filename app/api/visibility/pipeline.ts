// The drop-in pipeline: a YouCam Skin Analysis result plus its photo -> per-concern visibility distances.
// No YouCam calls: masks come from the request or from the result URLs YouCam already returned (free to download).
import sharp, { type Metadata } from "sharp";
import { DEFAULT_VIEWING } from "@/lib/contracts";
import type { RgbaImage, ScaleEstimate, Size2, ViewingConditions, VisibilityReport, VisibilityRequest } from "@/lib/contracts";
import { estimateScaleFromMasks, type ScaleMethod } from "@/lib/scale/fromMasks";
import { measureAnalysis } from "@/lib/skin/measure";
import { buildVisibilityReport } from "@/lib/vision/report";
import { decodeImageDataUrl, sniffImage } from "@/lib/youcam/imageinfo";
import { normalizeAnalysis } from "@/lib/youcam/normalize";
import { VisibilityError } from "./errors";
import { fetchMask, isAbsoluteUrl, isYouCamResultUrl } from "./guard";

/** YouCam resizes anything with a long side over 2560 px, so masks never exceed this. */
const MAX_FRAME_SIDE = 2560;
const MAX_MASK_PIXELS = 6_600_000;
const MAX_PHOTO_PIXELS = 40_000_000;
/** Distinct mask files per request (HD returns 17). */
const MAX_MASK_FILES = 24;
/** Photo and frame aspect ratios may differ by this much (relative) before the photo is rejected. */
const ASPECT_TOLERANCE = 0.01;

export interface VisibilityResult {
  report: VisibilityReport;
  scale: ScaleEstimate;
  /** How the scale was obtained: "given" (sent by the caller) or the fromMasks method. */
  scaleMethod: ScaleMethod | "given";
}

function rgbaOf(data: Buffer, info: { width: number; height: number }): RgbaImage {
  return { width: info.width, height: info.height, data: new Uint8ClampedArray(data.buffer, data.byteOffset, data.length) };
}

async function toRgba(bytes: Uint8Array, limitInputPixels: number, message: string): Promise<RgbaImage> {
  try {
    const { data, info } = await sharp(bytes, { limitInputPixels }).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
    return rgbaOf(data, info);
  } catch {
    throw new VisibilityError("image_unreadable", message, 422);
  }
}

/** Mask bytes -> RGBA. Masks are PNGs with an alpha channel; anything else cannot carry the information. */
async function decodeMask(bytes: Uint8Array): Promise<RgbaImage> {
  const info = sniffImage(bytes);
  const unreadable = "One of the masks isn't a readable PNG. Masks must be the PNG files YouCam returned.";
  if (!info || info.mime !== "image/png") throw new VisibilityError("mask_unreadable", unreadable, 422);
  if (info.width * info.height > MAX_MASK_PIXELS || Math.max(info.width, info.height) > MAX_FRAME_SIDE) {
    throw new VisibilityError("mask_too_large", `A mask is larger than ${MAX_FRAME_SIDE} px on its long side, which YouCam never returns.`, 422);
  }
  return toRgba(bytes, MAX_MASK_PIXELS, unreadable);
}

/** The photo in the masks' frame: as stored, EXIF-rotated, and resampled if the caller sent the pre-resize original. */
async function photoInFrame(bytes: Uint8Array, frame: Size2): Promise<RgbaImage> {
  const unreadable = "We couldn't read the photo. Send the JPEG or PNG that was analysed, as a data URL.";
  let meta: Metadata;
  try {
    meta = await sharp(bytes, { limitInputPixels: MAX_PHOTO_PIXELS }).metadata();
  } catch {
    throw new VisibilityError("image_unreadable", unreadable, 422);
  }
  const w = meta.width ?? 0;
  const h = meta.height ?? 0;
  const stored: Size2 = { width: w, height: h };
  const oriented: Size2 = (meta.orientation ?? 1) >= 5 ? { width: h, height: w } : stored;
  const same = (s: Size2) => s.width === frame.width && s.height === frame.height;
  const near = (s: Size2) => s.height > 0 && Math.abs(s.width / s.height / (frame.width / frame.height) - 1) <= ASPECT_TOLERANCE;

  let rotate: boolean;
  if (same(stored)) rotate = false;
  else if (same(oriented) || near(oriented)) rotate = true;
  else if (near(stored)) rotate = false;
  else {
    throw new VisibilityError(
      "photo_mask_mismatch",
      `The photo is ${oriented.width}x${oriented.height} but the masks are ${frame.width}x${frame.height}. ` +
        `Send the photo that was analysed (or the "resize_image" YouCam returned when the long side was over 2560 px).`,
      422,
    );
  }
  let pipeline = sharp(bytes, { limitInputPixels: MAX_PHOTO_PIXELS });
  if (rotate) pipeline = pipeline.rotate();
  if (!same(rotate ? oriented : stored)) pipeline = pipeline.resize(frame.width, frame.height, { fit: "fill" });
  try {
    const { data, info } = await pipeline.ensureAlpha().raw().toBuffer({ resolveWithObject: true });
    return rgbaOf(data, info);
  } catch {
    throw new VisibilityError("image_unreadable", unreadable, 422);
  }
}

/** Most common mask size: the analysed frame. */
function modalSize(masks: RgbaImage[]): Size2 {
  const counts = new Map<string, { size: Size2; n: number }>();
  for (const m of masks) {
    const key = `${m.width}x${m.height}`;
    const entry = counts.get(key) ?? { size: { width: m.width, height: m.height }, n: 0 };
    entry.n++;
    counts.set(key, entry);
  }
  return [...counts.values()].sort((a, b) => b.n - a.n)[0].size;
}

function mergeViewing(overrides: VisibilityRequest["viewing"]): ViewingConditions {
  const given = overrides ?? {};
  const changedPhysics = given.luminanceCdM2 !== undefined || given.acuityScale !== undefined;
  return { ...DEFAULT_VIEWING, ...given, ...(changedPhysics && given.label === undefined ? { label: "custom" as const } : {}) };
}

/** Where each mask comes from. Throws before any download if a mask would need fetching from outside YouCam's storage. */
function planMasks(maskSources: Record<string, string>, inline: VisibilityRequest["masks"]) {
  const entries = Object.entries(maskSources);
  if (entries.length > MAX_MASK_FILES) {
    throw new VisibilityError("bad_request", `That analysis lists ${entries.length} mask files; the most this endpoint reads is ${MAX_MASK_FILES}.`, 400);
  }
  const plan: { ref: string; source: string; inline: string | null }[] = [];
  for (const [ref, source] of entries) {
    const data = inline && Object.hasOwn(inline, source) ? inline[source] : null;
    if (data === null) {
      if (isAbsoluteUrl(source) && !isYouCamResultUrl(source)) {
        throw new VisibilityError(
          "mask_url_not_allowed",
          "A mask URL in \"output\" doesn't point to YouCam's result storage (https, amazonaws.com S3), so it wasn't fetched. " +
            "Send that mask in the \"masks\" field instead, keyed by the URL.",
          400,
        );
      }
      if (!isYouCamResultUrl(source)) continue; // a relative path nobody supplied: treated as a missing mask
    }
    plan.push({ ref, source, inline: data });
  }
  return plan;
}

function engineOf(output: unknown[]): "hd" | "sd" {
  const isHd = (item: unknown) => {
    const type = (item as { type?: unknown } | null)?.type;
    return typeof type === "string" && type.startsWith("hd_");
  };
  return output.some(isHd) ? "hd" : "sd";
}

export async function runVisibility(body: VisibilityRequest): Promise<VisibilityResult> {
  // The frame is only known once the masks are decoded, so normalise first for the mask sources.
  const draft = normalizeAnalysis(body.output, engineOf(body.output), { width: 0, height: 0 });
  const plan = planMasks(draft.maskSources, body.masks);

  const loaded = await Promise.all(
    plan.map(async ({ ref, source, inline }) => {
      const bytes = inline !== null ? decodeImageDataUrl(inline) : await fetchMask(source);
      if (!bytes) throw new VisibilityError("mask_unreadable", "One of the masks isn't a readable PNG data URL.", 422);
      return [ref, await decodeMask(bytes)] as const;
    }),
  );
  if (loaded.length === 0) {
    throw new VisibilityError(
      "no_masks",
      "No masks could be read. Send them in the \"masks\" field (data URLs keyed by their URL in \"output\"), " +
        "or call within 2 hours of the analysis so they can be fetched from the URLs in \"output\".",
      422,
    );
  }
  const masks = new Map<string, RgbaImage>(loaded);
  const frame = modalSize(loaded.map(([, mask]) => mask));

  const photoBytes = decodeImageDataUrl(body.image);
  if (!photoBytes) throw new VisibilityError("image_unreadable", "The photo must be a JPEG or PNG data URL.", 422);
  const photo = await photoInFrame(photoBytes, frame);

  const analysis = { ...draft.analysis, frame };
  let scale: ScaleEstimate;
  let scaleMethod: VisibilityResult["scaleMethod"] = "given";
  if (body.scale) {
    scale = body.scale;
  } else {
    const { method, ...estimate } = estimateScaleFromMasks(analysis, masks);
    scale = estimate;
    scaleMethod = method;
  }

  const measurements = measureAnalysis(analysis, masks, photo, scale);
  return { report: buildVisibilityReport(measurements, mergeViewing(body.viewing)), scale, scaleMethod };
}
