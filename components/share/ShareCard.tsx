/* eslint-disable @next/next/no-img-element -- plain <img> and inline flex styles keep this renderable as an OG image */
import { toUnit } from "@/app/_lib/axis";
import type { ShareData } from "@/components/results/types";

export interface ShareCardProps {
  data: ShareData;
  /** Absolute or public URL of the face photo. */
  imageSrc: string;
  /** Where in the photo to centre the thumbnail, as CSS object-position. */
  imagePosition?: string;
  /** Rendered width in px; the card is 1200 x 630 at width 1200. */
  width?: number;
  /** Font families as plain names for OG rendering; defaults use the page's CSS variables. */
  serifFamily?: string;
  sansFamily?: string;
  monoFamily?: string;
}

const PAPER = "#f5f3ef";
const INK = "#161513";
const MUTED = "#5f5c56";
const RULE = "#d8d4cb";
const STAGE = "#808080";

/**
 * The shareable "what others see" card: a face thumbnail and three distance lines.
 * Built from flexbox, absolute px sizes and inline styles only, so the same markup renders in the page and in
 * an `ImageResponse` (OG image) later. Sizes scale with `width`.
 */
export function ShareCard({
  data,
  imageSrc,
  imagePosition = "50% 38%",
  width = 1200,
  serifFamily = "var(--font-newsreader), Georgia, serif",
  sansFamily = "var(--font-geist-sans), system-ui, sans-serif",
  monoFamily = "var(--font-geist-mono), ui-monospace, monospace",
}: ShareCardProps) {
  const u = width / 1200;
  const px = (n: number) => `${Math.round(n * u * 100) / 100}px`;
  const barWidth = 400;

  return (
    <div
      style={{
        display: "flex",
        width: px(1200),
        height: px(630),
        background: PAPER,
        color: INK,
        fontFamily: sansFamily,
        overflow: "hidden",
      }}
    >
      <div style={{ display: "flex", width: px(430), height: px(630), background: STAGE }}>
        <img
          src={imageSrc}
          alt=""
          width={Math.round(430 * u)}
          height={Math.round(630 * u)}
          style={{ width: px(430), height: px(630), objectFit: "cover", objectPosition: imagePosition }}
        />
      </div>

      <div style={{ display: "flex", flexDirection: "column", flex: 1, padding: `${px(48)} ${px(56)} ${px(40)} ${px(56)}` }}>
        <div style={{ display: "flex", fontFamily: monoFamily, fontSize: px(15), letterSpacing: px(2.4), textTransform: "uppercase", color: MUTED }}>
          Arm&apos;s Length
        </div>
        <div style={{ display: "flex", fontFamily: serifFamily, fontSize: px(66), lineHeight: 1.02, letterSpacing: px(-1.4), marginTop: px(14) }}>
          {data.title}
        </div>
        <div style={{ display: "flex", fontSize: px(21), color: MUTED, marginTop: px(10) }}>{data.subtitle}</div>

        <div style={{ display: "flex", flexDirection: "column", marginTop: px(30), borderTop: `${px(1)} solid ${INK}` }}>
          {data.lines.map((line) => {
            const relief = line.tone === "relief";
            const end = toUnit(line.distanceM) * barWidth;
            return (
              <div
                key={line.concern}
                style={{ display: "flex", flexDirection: "column", padding: `${px(15)} 0 ${px(14)} 0`, borderBottom: `${px(1)} solid ${RULE}` }}
              >
                <div style={{ display: "flex", alignItems: "baseline" }}>
                  <div style={{ display: "flex", fontFamily: serifFamily, fontSize: px(34), letterSpacing: px(-0.4) }}>{line.label}</div>
                  <div style={{ display: "flex", marginLeft: px(16), fontSize: px(22), color: MUTED }}>{line.sentence}</div>
                </div>
                <div style={{ display: "flex", position: "relative", width: px(barWidth), height: px(14), marginTop: px(10) }}>
                  <div style={{ display: "flex", position: "absolute", left: 0, top: px(6), width: px(barWidth), height: px(1), background: RULE }} />
                  <div
                    style={{
                      display: "flex",
                      position: "absolute",
                      left: 0,
                      top: px(3),
                      width: px(Math.max(end, 4)),
                      height: px(8),
                      background: relief ? "transparent" : INK,
                      border: relief ? `${px(1.5)} solid ${INK}` : "none",
                    }}
                  />
                  <div
                    style={{
                      display: "flex",
                      position: "absolute",
                      left: px(Math.max(end, 4) - 7),
                      top: px(0),
                      width: px(14),
                      height: px(14),
                      borderRadius: px(7),
                      background: relief ? PAPER : INK,
                      border: `${px(2)} solid ${INK}`,
                    }}
                  />
                </div>
              </div>
            );
          })}
        </div>

        <div style={{ display: "flex", marginTop: "auto", fontSize: px(16), color: MUTED }}>{data.footnote}</div>
      </div>
    </div>
  );
}
