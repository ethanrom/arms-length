"use client";

import { useMemo, useRef, useState } from "react";
import { DISTANCE_ANCHORS } from "@/lib/copy/distance";
import { fmtMetres, fmtRatio } from "@/lib/science/format";
import { diskSpec, INDOOR, marginBand, marginCurve, poreSpec } from "@/lib/science/visibility";
import { RangeField, Segmented, useElementWidth } from "./controls";
import { Cite, DataTable, INK, MUTED, OnWidget, PAPER, Plate, Reading, RULE, SVG_FONT } from "./kit";

type Sample = "spot" | "pore";

const SAMPLES: Record<Sample, { label: string; sub: string; spec: ReturnType<typeof diskSpec>; noun: string }> = {
  spot: { label: "Dark spot", sub: "3 mm, 12%", spec: diskSpec(3, 12), noun: "a 3 mm dark spot at 12% contrast" },
  pore: { label: "Pore", sub: "0.3 mm, 5%", spec: poreSpec(0.3, 5), noun: "a 0.3 mm pore at 5% contrast" },
};

const MARGINS = Array.from({ length: 19 }, (_, i) => i * 0.5);
const D_MIN = 0.1;
const D_MAX = 10;

/** "Typical eyes vs perfect eyes": the distance band between the two observers, and how a margin widens it. */
export function TwoEyes() {
  const [sample, setSample] = useState<Sample>("spot");
  const [margin, setMargin] = useState(6);
  const s = SAMPLES[sample];
  const band = marginBand(s.spec, INDOOR, margin);
  const curves = useMemo(
    () => ({
      spot: marginCurve(SAMPLES.spot.spec, INDOOR, MARGINS),
      pore: marginCurve(SAMPLES.pore.spec, INDOOR, MARGINS),
    }),
    [],
  );

  const rows = curves[sample].map((c) => [`${c.marginDb.toFixed(1)} dB`, fmtMetres(c.band.typicalM), fmtMetres(c.band.perfectM), fmtRatio(c.band.factor)]);

  return (
    <Plate
      label="The distance band between a typical sharp-eyed person and perfect eyes, widening as the margin grows"
      caption={
        <>
          The dot is the distance where a typical sharp-eyed person stops being able to pick out {s.noun}. The ring is the same for an observer {margin.toFixed(1)} dB more
          sensitive than average. Between them, the mark may or may not be seen; beyond the ring it is out of sight. The default margin, 6 dB, widens a dark spot&rsquo;s
          band by about ×1.5; a pore, which is far smaller, widens more.
        </>
      }
      on={
        <OnWidget files={[{ path: "lib/vision/visibility.ts", label: "rawDistances" }]}>
          Both distances are <code className="font-mono text-[0.875rem]">rawDistances</code> for the same feature with the margin set to 0 and to the slider&rsquo;s value; the bound
          also floors the luminance factor at 1. Indoor light, 45 cd/m². See
        </OnWidget>
      }
    >
      <div className="grid gap-8 lg:grid-cols-[minmax(0,4fr)_minmax(0,8fr)] lg:gap-14">
        <div className="space-y-5">
          <Segmented legend="Sample feature" value={sample} onChange={setSample} options={(Object.keys(SAMPLES) as Sample[]).map((k) => ({ value: k, label: SAMPLES[k].label, sub: SAMPLES[k].sub }))} />
          <RangeField
            label="Margin"
            value={margin}
            min={0}
            max={9}
            step={0.5}
            onChange={setMargin}
            display={`${margin.toFixed(1)} dB`}
            valueText={`${margin.toFixed(1)} decibels more sensitive than average`}
            hint="How much sharper than the average observer the second pair of eyes is. 6 dB means needing half the contrast."
          />
          <div aria-live="polite" className="border-t border-ink pt-5">
            <div data-testid="eyes-factor">
              <Reading value={fmtRatio(band.factor)} size="xl" />
            </div>
            <p className="mt-2 text-[0.9375rem] leading-snug text-ink-soft">
              typical eyes <span className="num text-ink">{fmtMetres(band.typicalM)}</span>, perfect eyes <span className="num text-ink">{fmtMetres(band.perfectM)}</span>
            </p>
          </div>
        </div>

        <div className="space-y-8">
          <BandAxis typicalM={band.typicalM} perfectM={band.perfectM} />
          <MarginCurve curves={curves} sample={sample} margin={margin} />
        </div>
      </div>

      <div className="mt-8 grid gap-x-12 gap-y-4 border-t border-ink pt-6 lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)]">
        <p className="serif text-[clamp(1.375rem,1.1rem+1vw,1.875rem)] leading-[1.2]" style={{ fontWeight: 360 }}>
          We claim the ring, not the dot: beyond it, even perfect eyes looking right at the mark could not pick it out.
        </p>
        <p className="max-w-[40rem] text-[1rem] leading-[1.65] text-ink-soft">
          A claim about what a person <em>will</em> see has to guess at glances, distraction and skin texture, and it would be wrong for someone. A claim about what is{" "}
          <em>out of sight</em> only has to be right about the sharpest eyes, and everything real viewers add makes it safer. So the distance on a card is the ring: the
          best of 16 ModelFest observers was 4.2 dB better than average <Cite k={["watson2005", "modelfest"]} />, and the model&rsquo;s largest miss on a skin-like shape (the thin line, #31)
          is 1.9 dB, so 6 dB covers both. The dot is used only to say what a typical person could pick out, always with the words &ldquo;looking right at it&rdquo;.
        </p>
      </div>
      <DataTable label={`Distance band for ${s.noun} at each margin`} head={["Margin", "Typical eyes", "Perfect eyes", "Widening"]} rows={rows} />
    </Plate>
  );
}

const M = { l: 30, r: 30, t: 74, b: 58 };

function BandAxis({ typicalM, perfectM }: { typicalM: number; perfectM: number }) {
  const box = useRef<HTMLDivElement>(null);
  const width = useElementWidth(box);
  const height = 176;
  const pw = Math.max(0, width - M.l - M.r);
  const x = (d: number) => M.l + (Math.log(Math.min(D_MAX, Math.max(D_MIN, d)) / D_MIN) / Math.log(D_MAX / D_MIN)) * pw;
  const axisY = M.t + 26;
  const fmt = (t: number) => (t < 1 ? `${Math.round(t * 100)} cm` : `${t} m`);
  // Two label rows with leader lines, so the two labels never meet however close the dots are.
  return (
    <div ref={box} className="w-full" style={{ height }}>
      {width > 0 && (
        <svg
          width={width}
          height={height}
          role="img"
          aria-label={`A log distance axis. A typical sharp-eyed person can pick the mark out up to ${fmtMetres(typicalM)}; even perfect eyes up to ${fmtMetres(perfectM)}.`}
          style={{ fontFamily: SVG_FONT }}
        >
          <defs>
            <pattern id="sci-band2" width="7" height="7" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
              <line x1="0" y1="0" x2="0" y2="7" stroke={INK} strokeOpacity="0.5" strokeWidth="1" />
            </pattern>
          </defs>
          <line x1={M.l} x2={M.l + pw} y1={axisY} y2={axisY} stroke={INK} strokeWidth="1" />
          {[0.1, 0.3, 1, 3, 10].map((t, i, all) => (
            <g key={t}>
              <line x1={x(t)} x2={x(t)} y1={axisY} y2={axisY + 7} stroke={INK} strokeWidth="1" />
              <text x={x(t)} y={axisY + 44} textAnchor={i === 0 ? "start" : i === all.length - 1 ? "end" : "middle"} fontSize="13" fill={MUTED} className="num">
                {fmt(t)}
              </text>
            </g>
          ))}
          {DISTANCE_ANCHORS.filter((a) => ["mirror", "conversation", "across_room"].includes(a.id)).map((a) => (
            <g key={a.id}>
              <line x1={x(a.m)} x2={x(a.m)} y1={axisY} y2={axisY + 4} stroke={FAINT_INK} strokeWidth="1" />
              <text x={x(a.m)} y={axisY + 24} textAnchor="middle" fontSize="13" fill={MUTED}>
                {a.label}
              </text>
            </g>
          ))}
          <rect x={x(typicalM)} y={axisY - 12} width={Math.max(0, x(perfectM) - x(typicalM))} height="24" fill="url(#sci-band2)" stroke={INK} strokeWidth="1" />
          <line x1={x(typicalM)} x2={x(typicalM)} y1={axisY - 8} y2={M.t - 40} stroke={INK} strokeWidth="1" />
          <line x1={x(perfectM)} x2={x(perfectM)} y1={axisY - 8} y2={M.t - 14} stroke={INK} strokeWidth="1" />
          <circle cx={x(typicalM)} cy={axisY} r="8" fill={INK} stroke={PAPER} strokeWidth="2" />
          <circle cx={x(perfectM)} cy={axisY} r="8" fill={PAPER} stroke={INK} strokeWidth="2.5" />
          <text x={x(typicalM) - 6} y={M.t - 36} textAnchor="end" fontSize="15" fill={INK} style={{ fontWeight: 500 }}>
            typical eyes {fmtMetres(typicalM)}
          </text>
          <text x={x(perfectM) + (x(perfectM) > M.l + pw - 150 ? -6 : 6)} y={M.t - 10} textAnchor={x(perfectM) > M.l + pw - 150 ? "end" : "start"} fontSize="15" fill={INK} style={{ fontWeight: 500 }}>
            perfect eyes {fmtMetres(perfectM)}
          </text>
        </svg>
      )}
    </div>
  );
}

const FAINT_INK = "#8a867c";

function MarginCurve({ curves, sample, margin }: { curves: Record<Sample, ReturnType<typeof marginCurve>>; sample: Sample; margin: number }) {
  const box = useRef<HTMLDivElement>(null);
  const width = useElementWidth(box);
  const height = 230;
  const m = { l: 52, r: 18, t: 16, b: 46 };
  const pw = Math.max(0, width - m.l - m.r);
  const ph = height - m.t - m.b;
  const yMax = Math.ceil((Math.max(...curves.spot.map((c) => c.band.factor), ...curves.pore.map((c) => c.band.factor)) + 0.05) * 5) / 5;
  const x = (db: number) => m.l + (db / 9) * pw;
  const y = (f: number) => m.t + ph - ((f - 1) / (yMax - 1)) * ph;
  const path = (k: Sample) => curves[k].map((c, i) => `${i ? "L" : "M"}${x(c.marginDb).toFixed(1)} ${y(c.band.factor).toFixed(1)}`).join(" ");
  const here = curves[sample].find((c) => c.marginDb === margin) ?? curves[sample][0];
  const other: Sample = sample === "spot" ? "pore" : "spot";

  return (
    <div ref={box} className="w-full" style={{ height }}>
      {width > 0 && (
        <svg
          width={width}
          height={height}
          role="img"
          aria-label={`How much a margin widens the distance. At ${margin.toFixed(1)} dB the ${sample === "spot" ? "dark spot" : "pore"} band is ${fmtRatio(here.band.factor)} wider.`}
          style={{ fontFamily: SVG_FONT }}
        >
          {Array.from({ length: Math.floor((yMax - 1) / 0.5) + 1 }, (_, i) => 1 + i * 0.5).map((f) => (
            <g key={f}>
              <line x1={m.l} x2={m.l + pw} y1={y(f)} y2={y(f)} stroke={RULE} strokeWidth="1" />
              <text x={m.l - 10} y={y(f) + 4} textAnchor="end" fontSize="13" fill={MUTED} className="num">
                ×{f}
              </text>
            </g>
          ))}
          {[0, 3, 6, 9].map((db) => (
            <g key={db}>
              <line x1={x(db)} x2={x(db)} y1={m.t + ph} y2={m.t + ph + 6} stroke={INK} strokeWidth="1" />
              <text x={x(db)} y={m.t + ph + 22} textAnchor="middle" fontSize="13" fill={MUTED} className="num">
                {db} dB
              </text>
            </g>
          ))}
          <line x1={m.l} x2={m.l + pw} y1={m.t + ph} y2={m.t + ph} stroke={INK} strokeWidth="1" />
          <text x={m.l + pw / 2} y={height - 6} textAnchor="middle" fontSize="13" fill={INK} letterSpacing="0.4">
            MARGIN: HOW MUCH MORE SENSITIVE THAN AVERAGE
          </text>
          <path d={path(other)} fill="none" stroke={INK} strokeOpacity="0.4" strokeWidth="1.25" strokeDasharray={other === "pore" ? "6 4" : undefined} />
          <path d={path(sample)} fill="none" stroke={INK} strokeWidth="2.25" strokeDasharray={sample === "pore" ? "6 4" : undefined} />
          <line x1={x(6)} x2={x(6)} y1={m.t} y2={m.t + ph} stroke={INK} strokeOpacity="0.35" strokeWidth="1" strokeDasharray="2 3" />
          <text x={x(6) - 6} y={m.t + 12} textAnchor="end" fontSize="13" fill={MUTED}>
            default, 6 dB
          </text>
          <circle cx={x(here.marginDb)} cy={y(here.band.factor)} r="7" fill={PAPER} stroke={INK} strokeWidth="2.5" />
          <text x={x(9) - 4} y={y(curves.spot[curves.spot.length - 1].band.factor) + 18} textAnchor="end" fontSize="13" fill={INK} stroke={PAPER} strokeWidth="4" paintOrder="stroke">
            {sample === "spot" ? "dark spot" : "dark spot (faint)"}
          </text>
          <text x={x(9) - 4} y={y(curves.pore[curves.pore.length - 1].band.factor) - 8} textAnchor="end" fontSize="13" fill={INK} stroke={PAPER} strokeWidth="4" paintOrder="stroke">
            {sample === "pore" ? "pore" : "pore (faint)"}
          </text>
        </svg>
      )}
    </div>
  );
}
