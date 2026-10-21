"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { luminanceGain } from "@/lib/vision/castle";
import { STANDARD_A } from "@/lib/vision/params";
import { csf } from "@/lib/vision/standard";
import {
  contrastToGrey,
  ditherAt,
  CSF_F_MAX,
  CSF_F_MIN,
  csfPeak,
  csfSeries,
  gaborFieldDeg,
  gaborImage,
  PATCH_F_MAX,
  patchThreshold,
  patchThresholdPerfect,
} from "@/lib/science/csf";
import { fmtPct } from "@/lib/science/format";
import { DAYLIGHT, INDOOR } from "@/lib/science/visibility";
import { logScale, RangeField, Segmented, useElementWidth } from "./controls";
import { DataTable, FAINT, INK, MUTED, OnWidget, PAPER, Plate, Reading, RULE, SVG_FONT } from "./kit";

type Light = "indoor" | "daylight";
const LUMINANCE: Record<Light, number> = { indoor: INDOOR, daylight: DAYLIGHT };
const FREQ = logScale(0.5, 30, 100);
const CONTRAST = logScale(0.1, 50, 100);
const Y_MIN = 0.5;
const Y_MAX = 500;
const PEAK = csfPeak();

const M = { l: 52, r: 16, t: 14, b: 50 };

/**
 * "The contrast sensitivity function": Standard A's filter gain on log axes, the sensitivity it implies for a one-octave
 * Gabor patch at the chosen light, and a patch drawn at the chosen frequency and contrast.
 */
export function CsfExplorer() {
  const [fStep, setFStep] = useState(FREQ.toStep(4));
  const [cStep, setCStep] = useState(CONTRAST.toStep(20));
  const [light, setLight] = useState<Light>("indoor");
  const f0 = FREQ.toValue(fStep);
  const contrastPct = CONTRAST.toValue(cStep);
  const L = LUMINANCE[light];

  const typicalNeed = patchThreshold(f0, L) * 100;
  const perfectNeed = patchThresholdPerfect(f0, L) * 100;
  const gIndoor = luminanceGain(INDOOR, f0);
  const gDay = luminanceGain(DAYLIGHT, f0);
  const g = light === "indoor" ? gIndoor : gDay;
  const verdict =
    contrastPct >= typicalNeed
      ? "Visible to a typical sharp-eyed person looking right at it."
      : contrastPct >= perfectNeed
        ? "Only perfect eyes could pick it out."
        : "Out of sight, even for perfect eyes.";

  const rows = [0.5, 1, 2, 4, 8, 16, 30].map((f) => [
    `${f} cycles/deg`,
    csf(f, STANDARD_A).toFixed(1),
    (1 / patchThreshold(f, INDOOR)).toFixed(1),
    (1 / patchThreshold(f, DAYLIGHT)).toFixed(1),
    `×${luminanceGain(INDOOR, f).toFixed(2)} / ×${luminanceGain(DAYLIGHT, f).toFixed(2)}`,
  ]);

  return (
    <Plate
      label="The contrast sensitivity function on log axes, and a Gabor patch at a chosen frequency and contrast"
      caption={
        <>
          The solid curve is the filter the detector applies to every image. It peaks at {PEAK.gain.toFixed(1)} near {PEAK.f.toFixed(2)} cycles per degree and falls
          steeply either side. The dashed curve is what that filter, the Gaussian window and the pooling add up to for a one-octave patch: one over the contrast
          needed to see it. A patch is visible wherever the dashed curve is above the line for your contrast. Brighter light lifts the curve, most at fine detail.
        </>
      }
      on={
        <OnWidget
          files={[
            { path: "lib/vision/standard.ts", label: "csf" },
            { path: "lib/vision/tables.ts", label: "patchThresholdLookup" },
            { path: "lib/vision/castle.ts", label: "luminanceGain" },
          ]}
        >
          The solid curve is <code className="font-mono text-[0.875rem]">csf()</code> with Standard A&rsquo;s constants. The dashed curves are{" "}
          <code className="font-mono text-[0.875rem]">patchThresholdLookup</code> divided by <code className="font-mono text-[0.875rem]">luminanceGain</code>,
          the rule the Step back picture uses for every octave band. The patch is drawn in this page&rsquo;s canvas from the same definition (
          <code className="font-mono text-[0.875rem]">gaborImage</code>). See
        </OnWidget>
      }
    >
      <div className="grid gap-8 lg:grid-cols-[minmax(0,7fr)_minmax(0,5fr)] lg:gap-14">
        <div>
          <CsfPlot f0={f0} contrastPct={contrastPct} light={light} />
          <p className="mt-1 text-[0.875rem] leading-snug text-ink-soft">
            Solid: filter gain S(f). Dashed: sensitivity to a one-octave patch in indoor light. Dotted: in daylight. The bar on the axis marks the frequencies where your contrast is visible.
          </p>
          <div className="mt-4 grid gap-x-10 gap-y-2 sm:grid-cols-2">
            <RangeField
              label="Spatial frequency"
              value={fStep}
              min={0}
              max={FREQ.steps}
              step={1}
              onChange={setFStep}
              display={`${f0 < 10 ? f0.toFixed(1) : Math.round(f0)} cpd`}
              valueText={`${f0.toFixed(1)} cycles per degree`}
            />
            <RangeField
              label="Contrast"
              value={cStep}
              min={0}
              max={CONTRAST.steps}
              step={1}
              onChange={setCStep}
              display={`${fmtPct(contrastPct)}%`}
              valueText={`${contrastPct.toFixed(1)} percent`}
            />
          </div>
          <div className="mt-3">
            <Segmented
              legend="Light on the face"
              value={light}
              onChange={setLight}
              options={[
                { value: "indoor", label: "Indoor", sub: "45 cd/m²" },
                { value: "daylight", label: "Daylight", sub: "1,000 cd/m²" },
              ]}
            />
          </div>
        </div>

        <div>
          <GaborCanvas f0={f0} contrastPct={contrastPct} />
          <div className="mt-5 grid grid-cols-[auto_minmax(0,1fr)] items-end gap-x-6 gap-y-1">
            <Reading value={fmtPct(typicalNeed)} unit="%" size="lg" />
            <p className="pb-1 text-[0.875rem] leading-snug text-ink-soft">needed by a typical sharp-eyed person at {f0 < 10 ? f0.toFixed(1) : Math.round(f0)} cycles/degree</p>
          </div>
          <dl className="mt-3 grid grid-cols-[1fr_auto] gap-x-6 gap-y-1.5 text-[0.9375rem]">
            <dt className="text-ink-soft">Even perfect eyes need</dt>
            <dd className="num text-right">{fmtPct(perfectNeed)}%</dd>
            <dt className="text-ink-soft">Luminance factor in this light</dt>
            <dd className="num text-right">×{g.toFixed(2)}</dd>
            <dt className="text-ink-soft">Indoor, then daylight</dt>
            <dd className="num text-right">
              ×{gIndoor.toFixed(2)}, ×{gDay.toFixed(2)}
            </dd>
          </dl>
          <p className="serif mt-4 text-[1.375rem] leading-snug" style={{ fontWeight: 400 }} aria-live="polite">
            {verdict}
          </p>
          <p className="mt-2 text-[0.875rem] leading-snug text-ink-soft">
            Perfect eyes use the factor floored at 1, so a dim room never shortens the bound.
          </p>
        </div>
      </div>
      <DataTable
        label="The filter gain and the patch sensitivity at a few frequencies"
        head={["Frequency", "Filter gain S(f)", "Patch sensitivity, indoor", "Patch sensitivity, daylight", "Luminance factor indoor / daylight"]}
        rows={rows}
      />
    </Plate>
  );
}

function CsfPlot({ f0, contrastPct, light }: { f0: number; contrastPct: number; light: Light }) {
  const box = useRef<HTMLDivElement>(null);
  const width = useElementWidth(box);
  const narrow = width > 0 && width < 560;
  const height = Math.round(narrow ? Math.max(320, width * 0.9) : Math.min(460, Math.max(300, width * 0.66)));
  const pw = Math.max(0, width - M.l - M.r);
  const ph = height - M.t - M.b;
  const lx = (f: number) => M.l + (Math.log(f / CSF_F_MIN) / Math.log(CSF_F_MAX / CSF_F_MIN)) * pw;
  const ly = (s: number) => M.t + ph - (Math.log(Math.max(s, Y_MIN) / Y_MIN) / Math.log(Y_MAX / Y_MIN)) * ph;

  const indoor = useMemo(() => csfSeries(INDOOR, 140), []);
  const day = useMemo(() => csfSeries(DAYLIGHT, 140), []);
  const path = (pts: { f: number; v: number | null }[]) => {
    let d = "";
    for (const p of pts) {
      if (p.v === null || p.v < Y_MIN) continue;
      d += `${d ? "L" : "M"}${lx(p.f).toFixed(1)} ${ly(p.v).toFixed(1)} `;
    }
    return d;
  };
  const gainPath = path(indoor.map((s) => ({ f: s.f, v: s.gain })));
  const indoorPath = path(indoor.map((s) => ({ f: s.f, v: s.patchSensitivity })));
  const dayPath = path(day.map((s) => ({ f: s.f, v: s.patchSensitivity })));

  const need = 1 / (contrastPct / 100); // sensitivity this contrast calls for
  const selected = light === "indoor" ? indoor : day;
  // Frequencies where the selected patch curve is at or above the line: the band of visible patches.
  const visible: [number, number][] = [];
  let start: number | null = null;
  for (const s of selected) {
    const up = s.patchSensitivity !== null && s.patchSensitivity >= need;
    if (up && start === null) start = s.f;
    if (!up && start !== null) {
      visible.push([start, s.f]);
      start = null;
    }
  }
  if (start !== null) visible.push([start, PATCH_F_MAX]);

  const here = 1 / patchThreshold(f0, LUMINANCE[light]);
  const fTicks = [0.1, 0.3, 1, 3, 10, 30];
  const sTicks = [1, 10, 100];

  const label = `Contrast sensitivity against spatial frequency on log axes. The filter gain peaks at ${PEAK.gain.toFixed(0)} near ${PEAK.f.toFixed(1)} cycles per degree. At ${f0.toFixed(1)} cycles per degree the patch sensitivity is ${here.toFixed(0)} in ${light} light, and a ${contrastPct.toFixed(1)} percent contrast patch needs ${need.toFixed(0)}.`;

  return (
    <div ref={box} className="relative w-full" style={{ height: width ? height : 340 }}>
      {width > 0 && (
        <svg width={width} height={height} role="img" aria-label={label} style={{ fontFamily: SVG_FONT }} className="absolute inset-0">
          {sTicks.map((s) => (
            <g key={s}>
              <line x1={M.l} x2={M.l + pw} y1={ly(s)} y2={ly(s)} stroke={RULE} strokeWidth="1" />
              <text x={M.l - 10} y={ly(s) + 4} textAnchor="end" fontSize="13" fill={MUTED} className="num">
                {s}
              </text>
            </g>
          ))}
          {fTicks.map((f) => (
            <g key={f}>
              <line x1={lx(f)} x2={lx(f)} y1={M.t} y2={M.t + ph} stroke={RULE} strokeWidth="1" />
              <text x={lx(f)} y={M.t + ph + 20} textAnchor="middle" fontSize="13" fill={MUTED} className="num">
                {f}
              </text>
            </g>
          ))}
          <line x1={M.l} x2={M.l + pw} y1={M.t + ph} y2={M.t + ph} stroke={INK} strokeWidth="1" />
          <line x1={M.l} x2={M.l} y1={M.t} y2={M.t + ph} stroke={INK} strokeWidth="1" />
          <text x={M.l + pw / 2} y={height - 8} textAnchor="middle" fontSize="13" fill={INK} letterSpacing="0.4">
            {narrow ? "CYCLES PER DEGREE" : "SPATIAL FREQUENCY (CYCLES PER DEGREE, FINER TO THE RIGHT)"}
          </text>
          <text transform={`translate(14 ${M.t + ph / 2}) rotate(-90)`} textAnchor="middle" fontSize="13" fill={INK} letterSpacing="0.4">
            SENSITIVITY
          </text>

          {/* where this contrast is visible: a band on the axis */}
          {visible.map(([a, b]) => (
            <rect key={a} x={lx(a)} y={M.t + ph - 6} width={Math.max(2, lx(b) - lx(a))} height="6" fill={INK} />
          ))}

          <path d={gainPath} fill="none" stroke={INK} strokeWidth="2.25" strokeLinejoin="round" />
          <path d={dayPath} fill="none" stroke={INK} strokeOpacity={light === "daylight" ? 1 : 0.4} strokeWidth={light === "daylight" ? 1.75 : 1.25} strokeDasharray="2 4" strokeLinecap="round" />
          <path d={indoorPath} fill="none" stroke={INK} strokeOpacity={light === "indoor" ? 1 : 0.4} strokeWidth={light === "indoor" ? 1.75 : 1.25} strokeDasharray="7 4" />

          {/* the sensitivity this contrast calls for */}
          <line x1={M.l} x2={M.l + pw} y1={ly(need)} y2={ly(need)} stroke={INK} strokeWidth="1" />
          <text x={M.l + pw - 6} y={ly(need) - 6} textAnchor="end" fontSize="13" fill={INK} stroke={PAPER} strokeWidth="4" paintOrder="stroke" className="num">
            {fmtPct(contrastPct)}% contrast needs {need < 10 ? need.toFixed(1) : Math.round(need)}
          </text>

          {/* direct labels */}
          <text x={lx(0.13)} y={ly(csf(0.13, STANDARD_A)) - 10} fontSize="14" fill={INK} stroke={PAPER} strokeWidth="4" paintOrder="stroke" style={{ fontWeight: 500 }}>
            Filter gain S(f)
          </text>
          {!narrow && (
            <text x={lx(PATCH_F_MAX * 0.5)} y={ly(1 / patchThreshold(PATCH_F_MAX * 0.5, LUMINANCE[light])) - 12} textAnchor="end" fontSize="14" fill={INK} stroke={PAPER} strokeWidth="4" paintOrder="stroke" style={{ fontWeight: 500 }}>
              Patch sensitivity
            </text>
          )}

          {/* the chosen frequency */}
          <line x1={lx(f0)} x2={lx(f0)} y1={ly(here)} y2={M.t + ph} stroke={INK} strokeWidth="1" strokeDasharray="2 3" />
          <circle cx={lx(f0)} cy={ly(here)} r="6" fill={PAPER} stroke={INK} strokeWidth="2.5" />
          <circle cx={lx(f0)} cy={ly(csf(f0, STANDARD_A))} r="4" fill={INK} stroke={PAPER} strokeWidth="2" />
          <text x={lx(PEAK.f)} y={M.t + 12} textAnchor="middle" fontSize="13" fill={MUTED} className="num" stroke={PAPER} strokeWidth="4" paintOrder="stroke">
            peak {PEAK.gain.toFixed(1)}
          </text>
          <line x1={lx(PEAK.f)} x2={lx(PEAK.f)} y1={M.t + 18} y2={ly(PEAK.gain) - 6} stroke={FAINT} strokeWidth="1" />
        </svg>
      )}
    </div>
  );
}

const GABOR_PX = 256;

function GaborCanvas({ f0, contrastPct }: { f0: number; contrastPct: number }) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const c = ref.current;
    const ctx = c?.getContext("2d");
    if (!c || !ctx) return;
    const img = gaborImage(f0, contrastPct / 100, GABOR_PX);
    const out = ctx.createImageData(GABOR_PX, GABOR_PX);
    for (let i = 0; i < img.length; i++) {
      const v = contrastToGrey(img[i], ditherAt(i));
      out.data[i * 4] = v;
      out.data[i * 4 + 1] = v;
      out.data[i * 4 + 2] = v;
      out.data[i * 4 + 3] = 255;
    }
    ctx.putImageData(out, 0, 0);
  }, [f0, contrastPct]);

  const field = gaborFieldDeg(f0);
  return (
    <div className="w-[min(100%,19rem)]">
      <canvas
        ref={ref}
        width={GABOR_PX}
        height={GABOR_PX}
        role="img"
        aria-label={`A Gabor patch of ${f0.toFixed(1)} cycles per degree at ${contrastPct.toFixed(1)} percent contrast, drawn on mid grey`}
        className="aspect-square w-full border border-ink"
        style={{ background: "#808080" }}
      />
      <p className="mt-1 text-[0.875rem] leading-snug text-ink-soft">Drawn over {field.toFixed(1)}° of visual field.</p>
    </div>
  );
}
