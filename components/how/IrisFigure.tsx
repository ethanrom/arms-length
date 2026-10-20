import Image from "next/image";

interface IrisFigureProps {
  src: string;
  alt: string;
  frame: { width: number; height: number };
  /** Crop in frame px around one eye. */
  crop: { x: number; y: number; w: number; h: number };
  /** Iris centre and radius in frame px. */
  iris: { cx: number; cy: number; r: number };
  stageGrey?: string;
  label: string;
}

/** An eye with its iris measured: the ruler the whole scale hangs on. */
export function IrisFigure({ src, alt, frame, crop, iris, stageGrey = "#787878", label }: IrisFigureProps) {
  return (
    <figure>
      <div className="stage relative overflow-hidden" style={{ background: stageGrey, aspectRatio: `${crop.w} / ${crop.h}` }}>
        <Image
          src={src}
          alt={alt}
          width={frame.width}
          height={frame.height}
          sizes="(min-width: 1024px) 640px, 92vw"
          className="absolute max-w-none"
          style={{
            width: `${(frame.width / crop.w) * 100}%`,
            left: `${(-crop.x / crop.w) * 100}%`,
            top: `${(-crop.y / crop.h) * 100}%`,
            height: "auto",
          }}
        />
        <svg aria-hidden="true" viewBox={`${crop.x} ${crop.y} ${crop.w} ${crop.h}`} className="absolute inset-0 h-full w-full" preserveAspectRatio="none">
          <circle cx={iris.cx} cy={iris.cy} r={iris.r} fill="none" stroke="#161513" strokeOpacity="0.55" strokeWidth="5" vectorEffect="non-scaling-stroke" />
          <circle cx={iris.cx} cy={iris.cy} r={iris.r} fill="none" stroke="#f5f3ef" strokeWidth="2" vectorEffect="non-scaling-stroke" />
          {/* diameter rule with end caps */}
          <g>
            <line x1={iris.cx - iris.r} x2={iris.cx + iris.r} y1={iris.cy + iris.r + 20} y2={iris.cy + iris.r + 20} stroke="#161513" strokeOpacity="0.55" strokeWidth="5" vectorEffect="non-scaling-stroke" />
            <line x1={iris.cx - iris.r} x2={iris.cx + iris.r} y1={iris.cy + iris.r + 20} y2={iris.cy + iris.r + 20} stroke="#f5f3ef" strokeWidth="2" vectorEffect="non-scaling-stroke" />
            {[-1, 1].map((s) => (
              <g key={s}>
                <line x1={iris.cx + s * iris.r} x2={iris.cx + s * iris.r} y1={iris.cy + iris.r + 10} y2={iris.cy + iris.r + 30} stroke="#161513" strokeOpacity="0.55" strokeWidth="5" vectorEffect="non-scaling-stroke" />
                <line x1={iris.cx + s * iris.r} x2={iris.cx + s * iris.r} y1={iris.cy + iris.r + 10} y2={iris.cy + iris.r + 30} stroke="#f5f3ef" strokeWidth="2" vectorEffect="non-scaling-stroke" />
              </g>
            ))}
          </g>
        </svg>
        <span className="num absolute bottom-3 left-3 border border-ink/15 bg-paper px-2.5 py-1.5 font-mono text-[0.75rem] leading-none">{label}</span>
      </div>
    </figure>
  );
}
