import type { ScaleEstimate } from "@/lib/contracts";
import type { CaptureQuality } from "./quality";

/** What CaptureFlow hands to the app once the user accepts a photo. */
export interface CaptureResult {
  /** JPEG data URL, cropped around the face and resized per planResize (ready for POST /api/youcam/analysis). */
  image: string;
  /** Which YouCam Skin Analysis engine the frame qualifies for: HD needs a 1080 px short side, SD 480. */
  engine: "hd" | "sd";
  /** Millimetres per pixel of `image`, from the iris. */
  scale: ScaleEstimate;
  quality: CaptureQuality;
  /** Size of `image` in px. */
  size: { width: number; height: number };
}
