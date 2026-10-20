"use client";

import { motion } from "motion/react";
import type { Box, ScaleEstimate, ViewingConditions } from "@/lib/contracts";
import { FrameCanvas } from "./FrameCanvas";
import { useRenderedFrame } from "./useDistanceFrames";

interface RenderedCropProps {
  src: string;
  frame: { width: number; height: number };
  scale: ScaleEstimate;
  viewing: ViewingConditions;
  distanceM: number;
  /** The part of the frame to show, in frame px. */
  crop: Box;
  className?: string;
}

/** A crop of the photo as an observer at `distanceM` sees it, drawn by the DistanceRenderer. */
export function RenderedCrop({ src, frame, scale, viewing, distanceM, crop, className }: RenderedCropProps) {
  const { frame: image, busy, error } = useRenderedFrame(src, scale, viewing, distanceM);

  return (
    <div className={`relative overflow-hidden ${className ?? ""}`} style={{ aspectRatio: `${crop.w} / ${crop.h}` }} aria-busy={busy}>
      <motion.div
        className="absolute"
        initial={{ opacity: 0 }}
        animate={{ opacity: image ? (busy ? 0.7 : 1) : 0 }}
        transition={{ duration: 0.5 }}
        style={{
          width: `${(frame.width / crop.w) * 100}%`,
          left: `${(-crop.x / crop.w) * 100}%`,
          top: `${(-crop.y / crop.h) * 100}%`,
          aspectRatio: `${frame.width} / ${frame.height}`,
        }}
      >
        <FrameCanvas image={image} className="block h-full w-full" />
      </motion.div>
      {error && <p className="absolute inset-0 grid place-items-center p-4 text-center text-[0.8125rem]">This view could not be drawn here.</p>}
    </div>
  );
}
