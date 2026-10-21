import Image from "next/image";
import type { Box, Feature } from "@/lib/contracts";

interface MeasureFigureProps {
  src: string;
  alt: string;
  frame: { width: number; height: number };
  crop: Box;
  features: Feature[];
  stageGrey?: string;
  /** Captions for the three panels. */
  captions: [string, string, string];
}

/** Three panels, one cheek: the photo, the marks YouCam found, the same marks with measured sizes. */
export function MeasureFigure({ src, alt, frame, crop, features, stageGrey = "#787878", captions }: MeasureFigureProps) {
  const panels = [0, 1, 2] as const;
  return (
    <figure>
      <ol className="grid grid-cols-1 gap-px bg-rule-strong sm:grid-cols-3">
        {panels.map((p) => (
          <li key={p} className="bg-paper">
            <div className="relative overflow-hidden" style={{ background: stageGrey, aspectRatio: `${crop.w} / ${crop.h}` }}>
              <Image
                src={src}
                alt={p === 0 ? alt : ""}
                width={frame.width}
                height={frame.height}
                sizes="(min-width: 1024px) 220px, (min-width: 640px) 30vw, 92vw"
                className="absolute max-w-none"
                style={{
                  width: `${(frame.width / crop.w) * 100}%`,
                  left: `${(-crop.x / crop.w) * 100}%`,
                  top: `${(-crop.y / crop.h) * 100}%`,
                  height: "auto",
                }}
              />
              {p > 0 && (
                <svg aria-hidden="true" viewBox={`${crop.x} ${crop.y} ${crop.w} ${crop.h}`} className="absolute inset-0 h-full w-full" preserveAspectRatio="none">
                  {features.map((f) => {
                    const r = Math.max(f.bbox.w, f.bbox.h) * 0.9 + 9;
                    return (
                      <g key={f.id}>
                        <circle cx={f.centroid.x} cy={f.centroid.y} r={r} fill="none" stroke="#161513" strokeOpacity="0.55" strokeWidth="4.5" vectorEffect="non-scaling-stroke" />
                        <circle cx={f.centroid.x} cy={f.centroid.y} r={r} fill="none" stroke="#f5f3ef" strokeWidth="1.8" vectorEffect="non-scaling-stroke" />
                      </g>
                    );
                  })}
                </svg>
              )}
              {p === 2 &&
                features.map((f) => (
                  <span
                    key={f.id}
                    className="num absolute whitespace-nowrap border border-ink/15 bg-paper px-1.5 py-1 font-mono text-[0.875rem] leading-none"
                    style={{
                      left: `${((f.centroid.x - crop.x) / crop.w) * 100}%`,
                      top: `${((f.centroid.y - crop.y + Math.max(f.bbox.w, f.bbox.h) * 0.9 + 14) / crop.h) * 100}%`,
                      transform: "translateX(-50%)",
                    }}
                  >
                    {f.diameterMm?.toFixed(1)} mm
                  </span>
                ))}
            </div>
            <p className="px-3 py-3 text-[0.9375rem] leading-snug text-ink-soft">
              <span className="num mr-2 font-mono text-[0.875rem] text-muted">0{p + 1}</span>
              {captions[p]}
            </p>
          </li>
        ))}
      </ol>
    </figure>
  );
}
