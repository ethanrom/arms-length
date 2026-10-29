"use client";

import Image from "next/image";
import { useId } from "react";
import type { Box, Feature, RegionMeasure } from "@/lib/contracts";
import type { ConcernView } from "@/components/results/derive";

interface AnnotatedFaceProps {
  src: string;
  alt: string;
  frame: { width: number; height: number };
  /** The concern to outline, or null for the plain face. */
  view: ConcernView | null;
  /** Show only this part of the frame (px of the frame). */
  crop?: Box;
  sizes?: string;
  className?: string;
}

/** Pads a box and keeps it inside the frame, with a minimum aspect so tiny clusters still show context. */
export function cropAround(bounds: Box, frame: { width: number; height: number }, pad = 0.45, aspect = 4 / 3, minW = 0): Box {
  let w = Math.max(bounds.w * (1 + pad * 2), minW);
  let h = Math.max(bounds.h * (1 + pad * 2), minW / aspect);
  const cx = bounds.x + bounds.w / 2;
  const cy = bounds.y + bounds.h / 2;
  if (w / h < aspect) w = h * aspect;
  else h = w / aspect;
  w = Math.min(w, frame.width);
  h = Math.min(h, frame.height);
  if (w / h > aspect) w = h * aspect;
  else h = w / aspect;
  const x = Math.min(frame.width - w, Math.max(0, cx - w / 2));
  const y = Math.min(frame.height - h, Math.max(0, cy - h / 2));
  return { x, y, w, h };
}

const isFeature = (t: Feature | RegionMeasure): t is Feature => "shape" in t;

/**
 * One concern's marks as SVG children, in frame px: rings for spots, boxes for lines, a soft spotlight for areas. Every mark
 * has a dark halo under a light stroke so it reads on any skin tone. Draw it inside an `<svg>` whose viewBox is `box` (the whole
 * frame, or the crop being shown).
 */
export function ConcernMarks({ view, box }: { view: ConcernView; box: Box }) {
  const uid = useId().replace(/:/g, "");
  const regions = view.targets.filter((t) => !isFeature(t));
  // Stroke widths are in px thanks to non-scaling strokes; sizes are in frame px.
  const unit = box.w / 700;
  const dense = view.targets.length > 60;

  return (
    <>
      {regions.length > 0 && (
        <>
          <defs>
            <filter id={`soft${uid}`} x="-30%" y="-30%" width="160%" height="160%">
              <feGaussianBlur stdDeviation={22 * unit} />
            </filter>
            <mask id={`dim${uid}`} maskUnits="userSpaceOnUse" x={box.x} y={box.y} width={box.w} height={box.h}>
              <rect x={box.x} y={box.y} width={box.w} height={box.h} fill="white" />
              {regions.map((r) => (
                <ellipse
                  key={r.id}
                  cx={r.bbox.x + r.bbox.w / 2}
                  cy={r.bbox.y + r.bbox.h / 2}
                  rx={r.bbox.w / 2}
                  ry={r.bbox.h / 2}
                  fill="black"
                  filter={`url(#soft${uid})`}
                />
              ))}
            </mask>
          </defs>
          <rect x={box.x} y={box.y} width={box.w} height={box.h} fill="#161513" opacity="0.46" mask={`url(#dim${uid})`} />
        </>
      )}

      {view.targets.map((t) => {
        const top = view.topIds.has(t.id);
        if (isFeature(t)) {
          if (t.shape === "line") {
            return (
              <g key={t.id} opacity={top ? 1 : 0.7}>
                <rect x={t.bbox.x} y={t.bbox.y} width={t.bbox.w} height={t.bbox.h} rx={8 * unit} fill="none" stroke="#161513" strokeOpacity="0.55" strokeWidth="4.5" vectorEffect="non-scaling-stroke" />
                <rect x={t.bbox.x} y={t.bbox.y} width={t.bbox.w} height={t.bbox.h} rx={8 * unit} fill="none" stroke="#f5f3ef" strokeWidth="1.8" strokeDasharray="6 4" vectorEffect="non-scaling-stroke" />
              </g>
            );
          }
          if (dense && !top) {
            // Hundreds of rings would hide the face; small dots show where they are.
            return (
              <g key={t.id}>
                <circle cx={t.centroid.x} cy={t.centroid.y} r={3.4 * unit} fill="#f5f3ef" fillOpacity="0.85" stroke="#161513" strokeOpacity="0.6" strokeWidth="1" vectorEffect="non-scaling-stroke" />
              </g>
            );
          }
          const r = Math.max(t.bbox.w, t.bbox.h) * (top ? 1.5 : 1.15) + 11 * unit;
          return (
            <g key={t.id} opacity={top ? 1 : 0.75}>
              <circle cx={t.centroid.x} cy={t.centroid.y} r={r} fill="none" stroke="#161513" strokeOpacity="0.55" strokeWidth={top ? 5 : 4} vectorEffect="non-scaling-stroke" />
              <circle cx={t.centroid.x} cy={t.centroid.y} r={r} fill="none" stroke="#f5f3ef" strokeWidth={top ? 2.2 : 1.6} strokeDasharray={top ? undefined : "3 3"} vectorEffect="non-scaling-stroke" />
            </g>
          );
        }
        const rx = t.bbox.w / 2;
        const ry = t.bbox.h / 2;
        return (
          <g key={t.id}>
            <ellipse cx={t.bbox.x + rx} cy={t.bbox.y + ry} rx={rx} ry={ry} fill="none" stroke="#161513" strokeOpacity="0.55" strokeWidth="4.5" vectorEffect="non-scaling-stroke" />
            <ellipse cx={t.bbox.x + rx} cy={t.bbox.y + ry} rx={rx} ry={ry} fill="none" stroke="#f5f3ef" strokeWidth="1.8" strokeDasharray="6 4" vectorEffect="non-scaling-stroke" />
          </g>
        );
      })}
    </>
  );
}

/** The face with one concern's marks drawn on it (or the plain face), optionally cropped to a part of the frame. */
export function AnnotatedFace({ src, alt, frame, view, crop, sizes = "(min-width: 1024px) 40vw, 90vw", className }: AnnotatedFaceProps) {
  const box: Box = crop ?? { x: 0, y: 0, w: frame.width, h: frame.height };

  return (
    <div
      className={`relative overflow-hidden ${className ?? ""}`}
      style={{ aspectRatio: `${box.w} / ${box.h}` }}
    >
      <Image
        src={src}
        alt={alt}
        width={frame.width}
        height={frame.height}
        sizes={sizes}
        className="absolute max-w-none"
        style={{
          width: `${(frame.width / box.w) * 100}%`,
          left: `${(-box.x / box.w) * 100}%`,
          top: `${(-box.y / box.h) * 100}%`,
          height: "auto",
        }}
      />
      <svg
        aria-hidden="true"
        viewBox={`${box.x} ${box.y} ${box.w} ${box.h}`}
        className="absolute inset-0 h-full w-full"
        preserveAspectRatio="none"
      >
        {view && <ConcernMarks view={view} box={box} />}
      </svg>
    </div>
  );
}
