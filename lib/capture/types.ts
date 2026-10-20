import type { ScaleEstimate } from "@/lib/contracts";
import type { CaptureQuality } from "./quality";

/** What CaptureFlow hands to the app once the user accepts a photo. */
export interface CaptureResult {
  /** JPEG data URL, cropped around the face and resized per planResize (ready for POST /api/youcam/analysis). */
  image: string;
  /** Which YouCam Skin Analysis engine the frame qualifies for: HD needs a 1080 px short side, SD 480. */
  engine: "hd" | "sd";
  /** The frame is an enlargement of the camera's pixels (up to 2x for HD): the finest detail is less certain. */
  upscaled: boolean;
  /** Output px per source px along x (1 when not enlarged). */
  upscale: number;
  /** Millimetres per pixel of `image`, from the iris. */
  scale: ScaleEstimate;
  quality: CaptureQuality;
  /** Size of `image` in px. */
  size: { width: number; height: number };
}
