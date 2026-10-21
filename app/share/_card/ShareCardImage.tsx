/* eslint-disable @next/next/no-img-element -- Satori (next/og) draws plain <img>, flex boxes and inline styles only */
import { toUnit } from "@/app/_lib/axis";

export type CardFormat = "4x5" | "9x16" | "wide";

export const CARD_SIZES: Record<CardFormat, { width: number; height: number }> = {
  "4x5": { width: 1080, height: 1350 },
  "9x16": { width: 1080, height: 1920 },
  wide: { width: 1200, height: 630 },
};

export interface CardLine {
  /** "Pores" */
  title: string;
  /** "out of sight across a table" */
  rest: string;
  /** Where the tape's dot sits, metres. */
  distanceM: number;
}

export interface ShareCardImageProps {
  format: CardFormat;
  lines: CardLine[];
  /** Said when no relief line is on offer. */
  fallback: string;
  /** Data URL of a synthetic demo face, only when asked for. Never an own photo. */
  face: string | null;
  /** "Synthetic face (AI-generated)": burned in for demo faces, on the face when there is one. */
  tag: string | null;
  qualifier: string;
  /** The mark-safety line, when a chosen line is about dark spots or breakouts. */
  safety: string | null;
}

const PAPER = "#f5f3ef";
const INK = "#161513";
const INK_SOFT = "#3a3833";
const MUTED = "#5f5c56";
const HAIRLINE = "#8a867c";
const SERIF = "Newsreader";

/** The share card: a face-less, relief-only column of lines on a distance tape. Flex boxes and absolute px only, for Satori. */
export function ShareCardImage({ format, lines, fallback, face, tag, qualifier, safety }: ShareCardImageProps) {
  const { width, height } = CARD_SIZES[format];
  if (format === "wide") return <Wide lines={lines} fallback={fallback} tag={tag} qualifier={qualifier} width={width} height={height} />;

  const tall = format === "9x16";
  const pad = 76;
  const inner = width - pad * 2;
  const titleSize = tall ? 132 : 112;
  const faceHeight = face ? (tall ? 760 : 470) : 0;

  return (
    <div style={{ display: "flex", flexDirection: "column", width, height, background: PAPER, color: INK, padding: `${tall ? 96 : 72}px ${pad}px ${tall ? 84 : 64}px`, fontFamily: "Geist" }}>
      <div style={{ display: "flex", fontSize: 28, letterSpacing: 6, textTransform: "uppercase", color: MUTED }}>Arm&apos;s Length</div>

      <div style={{ display: "flex", flexDirection: "column", marginTop: tall ? 52 : 36, fontFamily: SERIF, fontSize: titleSize, lineHeight: 1.0, letterSpacing: -3 }}>
        <div style={{ display: "flex" }}>From where</div>
        <div style={{ display: "flex", fontStyle: "italic" }}>others stand.</div>
      </div>

      {face && (
        <div style={{ display: "flex", position: "relative", width: inner, height: faceHeight, marginTop: tall ? 56 : 40, background: "#808080" }}>
          <img src={face} alt="" width={inner} height={faceHeight} style={{ width: inner, height: faceHeight, objectFit: "cover", objectPosition: "50% 26%" }} />
          {tag && (
            <div style={{ display: "flex", position: "absolute", left: 0, bottom: 0, padding: "12px 20px", background: PAPER, fontSize: 32, color: INK }}>{tag}</div>
          )}
        </div>
      )}

      <div style={{ display: "flex", flexDirection: "column", marginTop: tall ? 64 : 44, borderTop: `2px solid ${INK}` }}>
        {lines.length === 0 ? (
          <div style={{ display: "flex", padding: "36px 0", fontFamily: SERIF, fontSize: tall ? 64 : 56, lineHeight: 1.1, letterSpacing: -1 }}>{fallback}</div>
        ) : (
          lines.map((line, i) => <Line key={line.title + i} line={line} width={inner} size={tall ? 1.15 : 1} />)
        )}
      </div>

      <div style={{ display: "flex", flexDirection: "column", marginTop: "auto" }}>
        {safety && <div style={{ display: "flex", fontSize: 28, lineHeight: 1.35, color: INK_SOFT, marginBottom: 22 }}>{safety}</div>}
        <div style={{ display: "flex", fontSize: 34, lineHeight: 1.3, color: INK_SOFT }}>{qualifier}</div>
        {tag && !face && (
          <div style={{ display: "flex", marginTop: 22 }}>
            <div style={{ display: "flex", padding: "10px 18px", border: `2px solid ${INK}`, fontSize: 32, color: INK }}>{tag}</div>
          </div>
        )}
      </div>
    </div>
  );
}

function Line({ line, width, size }: { line: CardLine; width: number; size: number }) {
  const barWidth = width;
  const end = Math.max(8, toUnit(line.distanceM) * barWidth);
  return (
    <div style={{ display: "flex", flexDirection: "column", padding: `${30 * size}px 0 ${26 * size}px`, borderBottom: `1px solid ${HAIRLINE}` }}>
      <div style={{ display: "flex", flexDirection: "column" }}>
        <div style={{ display: "flex", fontFamily: SERIF, fontSize: 76 * size, lineHeight: 1.05, letterSpacing: -1.4 }}>{line.title}</div>
        <div style={{ display: "flex", fontSize: 42 * size, color: INK_SOFT, marginTop: 4 }}>{line.rest}</div>
      </div>
      <div style={{ display: "flex", position: "relative", width: barWidth, height: 30, marginTop: 20 * size }}>
        <div style={{ display: "flex", position: "absolute", left: 0, top: 14, width: barWidth, height: 2, background: HAIRLINE }} />
        <div style={{ display: "flex", position: "absolute", left: 0, top: 10, width: end, height: 10, background: INK }} />
        <div style={{ display: "flex", position: "absolute", left: end - 14, top: 1, width: 28, height: 28, borderRadius: 14, background: INK, border: `4px solid ${PAPER}` }} />
      </div>
      <div style={{ display: "flex", justifyContent: "space-between", marginTop: 8, fontSize: 28, color: MUTED }}>
        <div style={{ display: "flex" }}>25 cm</div>
        <div style={{ display: "flex" }}>6 m</div>
      </div>
    </div>
  );
}

function Wide({ lines, fallback, tag, qualifier, width, height }: Pick<ShareCardImageProps, "lines" | "fallback" | "tag" | "qualifier"> & { width: number; height: number }) {
  return (
    <div style={{ display: "flex", width, height, background: PAPER, color: INK, padding: "52px 64px", fontFamily: "Geist" }}>
      <div style={{ display: "flex", flexDirection: "column", width: 470 }}>
        <div style={{ display: "flex", fontSize: 22, letterSpacing: 5, textTransform: "uppercase", color: MUTED }}>Arm&apos;s Length</div>
        <div style={{ display: "flex", flexDirection: "column", marginTop: 26, fontFamily: SERIF, fontSize: 92, lineHeight: 1.0, letterSpacing: -2 }}>
          <div style={{ display: "flex" }}>From where</div>
          <div style={{ display: "flex", fontStyle: "italic" }}>others stand.</div>
        </div>
        <div style={{ display: "flex", marginTop: "auto", fontSize: 25, lineHeight: 1.3, color: INK_SOFT }}>{qualifier}</div>
        {tag && <div style={{ display: "flex", marginTop: 12, fontSize: 25, color: INK }}>{tag}</div>}
      </div>
      <div style={{ display: "flex", flexDirection: "column", flex: 1, marginLeft: 56, justifyContent: "center", borderTop: `2px solid ${INK}` }}>
        {lines.length === 0 ? (
          <div style={{ display: "flex", padding: "26px 0", fontFamily: SERIF, fontSize: 46, lineHeight: 1.1 }}>{fallback}</div>
        ) : (
          lines.map((line, i) => (
            <div key={line.title + i} style={{ display: "flex", flexDirection: "column", padding: "22px 0", borderBottom: `1px solid ${HAIRLINE}` }}>
              <div style={{ display: "flex", fontFamily: SERIF, fontSize: 48, letterSpacing: -0.8 }}>{line.title}</div>
              <div style={{ display: "flex", fontSize: 30, color: INK_SOFT, marginTop: 4 }}>{line.rest}</div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
