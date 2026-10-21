"use client";

import { useDeferredValue, useEffect, useMemo, useRef, useState, type PointerEvent as ReactPointerEvent } from "react";
import { receiptSentences } from "@/lib/integration/receipt";
import { fmtArcmin, fmtMetres, fmtMm, fmtPct } from "@/lib/science/format";
import { boundaryLine, diskReceipt, doublingCheck, ratioGrid, viewingAt, INDOOR } from "@/lib/science/visibility";
import { RangeField, useElementWidth } from "./controls";
import { DataTable, INK, MUTED, OnWidget, PAPER, Plate, Reading, RULE, SVG_FONT } from "./kit";

const MAX_SIZE = 6;
const MIN_SIZE = 0.2;
const MAX_DIST = 10;
const MIN_DIST = 0.2;
const COLS = 64;
const ROWS = 40;
const BOUNDARY_SIZES = [MIN_SIZE, 1, 2, 3, 4, 5, MAX_SIZE];
const VIEWING = viewingAt(INDOOR, 6);

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));
const snap = (v: number, step: number) => Math.round(v / step) * step;

/**
 * "Angle is everything": a disk's diameter, its contrast and the distance, with the visual angle and the verdict, and the
 * size-by-distance map behind them. Every number is `buildReceipt` / `rawDistances` / `visibilityRatio` from lib/vision.
 */
export function AngleExplorer() {
  const [size, setSize] = useState(2);
  const [contrast, setContrast] = useState(12);
  const [distance, setDistance] = useState(3);
  const deferredContrast = useDeferredValue(contrast);

  const receipt = useMemo(() => diskReceipt(size, contrast, distance, VIEWING), [size, contrast, distance]);
  const sentences = receipt ? receiptSentences(receipt) : null;
  const doubling = useMemo(() => doublingCheck(size, contrast, VIEWING), [size, contrast]);
  const line = useMemo(() => boundaryLine(deferredContrast, VIEWING, BOUNDARY_SIZES), [deferredContrast]);
  const grid = useMemo(() => ratioGrid(deferredContrast, VIEWING, MAX_SIZE, MAX_DIST, COLS, ROWS), [deferredContrast]);

  const canDouble = size * 2 <= MAX_SIZE && distance * 2 <= MAX_DIST;
  const canHalve = size / 2 >= MIN_SIZE && distance / 2 >= MIN_DIST;
  const tableRows = line.map((p) => [`${fmtMm(p.sizeMm)} mm`, fmtMetres(p.typicalM), fmtMetres(p.perfectM)]);

  return (
    <Plate
      label="Angle is everything: a disk's size, contrast and distance, its visual angle, and the size-by-distance map"
      caption={
        <>
          The line is where a typical sharp-eyed person stops being able to pick the disk out, at the contrast you chose; the dashed line is the same for
          even perfect eyes (6 dB more sensitive). Both are straight lines through the corner of the chart: twice the size reaches twice as far, at any contrast,
          because vision only sees the angle.
        </>
      }
      on={
        <OnWidget
          files={[
            { path: "lib/integration/receipt.ts", label: "buildReceipt" },
            { path: "lib/vision/visibility.ts", label: "visibilityRatio, rawDistances" },
            { path: "lib/vision/tables.ts", label: "blobThresholdLookup" },
          ]}
        >
          The angle, both thresholds and the verdict come from <code className="font-mono text-[0.875rem]">buildReceipt</code>, the same function behind the
          &ldquo;How we know&rdquo; sheet. The map and its lines are <code className="font-mono text-[0.875rem]">visibilityRatio</code> and the{" "}
          <code className="font-mono text-[0.875rem]">rawDistances</code> scan, which read the precomputed disk table. Indoor light, 45 cd/m². See
        </OnWidget>
      }
    >
      <div className="grid gap-8 lg:grid-cols-[minmax(0,4fr)_minmax(0,9fr)] lg:gap-14">
        <div className="space-y-2">
          <RangeField
            label="Disk diameter"
            value={size}
            min={MIN_SIZE}
            max={MAX_SIZE}
            step={0.1}
            onChange={(v) => setSize(Math.round(v * 10) / 10)}
            display={`${fmtMm(size)} mm`}
            valueText={`${fmtMm(size)} millimetres`}
          />
          <RangeField
            label="Contrast"
            value={contrast}
            min={2}
            max={40}
            step={1}
            onChange={setContrast}
            display={`${contrast}%`}
            valueText={`${contrast} percent darker than the skin around it`}
          />
          <RangeField
            label="Distance"
            value={distance}
            min={MIN_DIST}
            max={MAX_DIST}
            step={0.05}
            onChange={(v) => setDistance(Math.round(v * 100) / 100)}
            display={fmtMetres(distance)}
            valueText={`${distance.toFixed(2)} metres`}
          />
          <div className="flex flex-wrap gap-3 pt-3">
            <button
              type="button"
              className="btn btn-ghost btn-sm"
              disabled={!canDouble}
              onClick={() => {
                setSize((s) => Math.round(s * 20) / 10);
                setDistance((d) => Math.round(d * 200) / 100);
              }}
            >
              Double both
            </button>
            <button
              type="button"
              className="btn btn-ghost btn-sm"
              disabled={!canHalve}
              onClick={() => {
                setSize((s) => Math.round(s * 5) / 10);
                setDistance((d) => Math.round(d * 50) / 100);
              }}
            >
              Halve both
            </button>
          </div>
          <p className="max-w-[26rem] pt-1 text-[0.875rem] leading-snug text-ink-soft">
            Double both and the angle below does not move, and neither does the verdict. You can also drag on the map.
          </p>
        </div>

        <SizeDistanceMap
          size={size}
          distance={distance}
          line={line}
          grid={grid}
          doubling={doubling}
          onPick={(d, s) => {
            setDistance(Math.round(clamp(d, MIN_DIST, MAX_DIST) * 20) / 20);
            setSize(clamp(snap(s, 0.1), MIN_SIZE, MAX_SIZE));
          }}
        />
      </div>

      <div className="mt-8 grid gap-x-10 gap-y-6 border-t border-ink pt-6 md:grid-cols-2 lg:grid-cols-[minmax(0,1.05fr)_minmax(0,1fr)_minmax(0,1.35fr)_minmax(0,1.1fr)]" aria-live="polite">
        {receipt && sentences ? (
          <>
            <div data-testid="angle-arcmin">
              <Reading value={fmtArcmin(receipt.angleArcmin)} unit="arcmin" size="xl" caption={`${fmtMm(size)} mm at ${fmtMetres(distance)}`} />
            </div>
            <dl className="grid grid-cols-[1fr_auto] content-start gap-x-5 gap-y-1.5 text-[0.9375rem]">
              <dt className="text-ink-soft">A typical sharp-eyed person needs</dt>
              <dd className="num text-right">{fmtPct(receipt.typicalThresholdPct)}%</dd>
              <dt className="text-ink-soft">Even perfect eyes need</dt>
              <dd className="num text-right">{fmtPct(receipt.thresholdPct)}%</dd>
              <dt className="border-t border-rule pt-1.5 font-medium">The disk has</dt>
              <dd className="num border-t border-rule pt-1.5 text-right font-medium">{fmtPct(receipt.contrastPct)}%</dd>
            </dl>
            <p data-testid="angle-verdict" className="serif text-[1.25rem] leading-snug" style={{ fontWeight: 400 }}>
              {sentences.verdict}
            </p>
          </>
        ) : (
          <p>No usable size or contrast.</p>
        )}
        <div className="content-start">
          <p className="eyebrow">Double the size</p>
          <p data-testid="angle-doubling" className="serif num mt-1 text-[clamp(2.25rem,1.8rem+1.8vw,3.25rem)] leading-none" style={{ fontWeight: 320 }} aria-label={`Twice the size reaches ${doubling.typicalFactor.toFixed(3)} times as far`}>
            ×{doubling.typicalFactor.toFixed(3)}
          </p>
          <p className="mt-2 text-[0.875rem] leading-snug text-ink-soft">
            <span className="num">{fmtMm(doubling.one.sizeMm)} mm</span> reaches <span className="num">{fmtMetres(doubling.one.typicalM)}</span>, <span className="num">{fmtMm(doubling.two.sizeMm)} mm</span> reaches{" "}
            <span className="num">{fmtMetres(doubling.two.typicalM)}</span> (perfect eyes <span className="num">{fmtMetres(doubling.one.perfectM)}</span> and <span className="num">{fmtMetres(doubling.two.perfectM)}</span>).
          </p>
        </div>
      </div>
      <DataTable label="Where the boundary lies at this contrast: farthest distance for each disk size" head={["Disk diameter", "Typical eyes reach", "Perfect eyes reach"]} rows={tableRows} />
    </Plate>
  );
}

interface MapProps {
  size: number;
  distance: number;
  line: ReturnType<typeof boundaryLine>;
  grid: ReturnType<typeof ratioGrid>;
  doubling: ReturnType<typeof doublingCheck>;
  onPick: (distanceM: number, sizeMm: number) => void;
}

const M = { l: 58, r: 18, t: 14, b: 50 };

function SizeDistanceMap({ size, distance, line, grid, doubling, onPick }: MapProps) {
  const box = useRef<HTMLDivElement>(null);
  const canvas = useRef<HTMLCanvasElement>(null);
  const width = useElementWidth(box);
  const height = Math.round(clamp(width * 0.64, 300, 470));
  const pw = Math.max(0, width - M.l - M.r);
  const ph = height - M.t - M.b;
  const x = (d: number) => M.l + (d / MAX_DIST) * pw;
  const y = (s: number) => M.t + ph - (s / MAX_SIZE) * ph;

  // Paint the heat: how far above its threshold a disk is, for typical eyes. The cells are blurred by the canvas scaling.
  useEffect(() => {
    const c = canvas.current;
    const ctx = c?.getContext("2d");
    if (!c || !ctx) return;
    const img = ctx.createImageData(COLS, ROWS);
    for (let j = 0; j < ROWS; j++) {
      for (let i = 0; i < COLS; i++) {
        const v = grid.typicalLog[j * COLS + i];
        const a = v > 0 ? 0.1 + 0.42 * Math.min(1, v / 1.1) : 0;
        const o = ((ROWS - 1 - j) * COLS + i) * 4;
        img.data[o] = 22;
        img.data[o + 1] = 21;
        img.data[o + 2] = 19;
        img.data[o + 3] = Math.round(a * 255);
      }
    }
    ctx.putImageData(img, 0, 0);
  }, [grid, width]);

  const pick = (e: ReactPointerEvent<SVGSVGElement>) => {
    const r = e.currentTarget.getBoundingClientRect();
    const px = e.clientX - r.left - M.l;
    const py = e.clientY - r.top - M.t;
    if (px < 0 || py < 0 || px > pw || py > ph) return;
    onPick((px / pw) * MAX_DIST, (1 - py / ph) * MAX_SIZE);
  };

  const typical = [{ d: 0, s: 0 }, ...line.map((p) => ({ d: p.typicalM, s: p.sizeMm }))];
  const perfect = [{ d: 0, s: 0 }, ...line.map((p) => ({ d: p.perfectM, s: p.sizeMm }))];
  const path = (pts: { d: number; s: number }[]) => pts.map((p, i) => `${i ? "L" : "M"}${x(p.d).toFixed(1)} ${y(p.s).toFixed(1)}`).join(" ");
  // The band between the two lines: where only perfect eyes could still pick the disk out.
  const band = `${path(typical)} ${perfect
    .slice()
    .reverse()
    .map((p) => `L${x(p.d).toFixed(1)} ${y(p.s).toFixed(1)}`)
    .join(" ")} Z`;

  // A label along a line: at 45% of its visible length, turned to follow it, set just above (or below) the stroke.
  const alongLine = (pts: { d: number; s: number }[], text: string, offset: number) => {
    const last = pts[pts.length - 1];
    const k = last.s / last.d; // mm per metre
    const reach = Math.min(MAX_DIST, MAX_SIZE / k);
    const d = reach * 0.45;
    const px = x(d);
    const py = y(d * k);
    const slope = (k * (ph / MAX_SIZE)) / (pw / MAX_DIST);
    const deg = -(Math.atan(slope) * 180) / Math.PI;
    return { text, transform: `translate(${px.toFixed(1)} ${py.toFixed(1)}) rotate(${deg.toFixed(1)}) translate(0 ${offset})` };
  };
  const labels = [alongLine(typical, "typical eyes", -9), alongLine(perfect, "perfect eyes", 19)];

  const dTicks = [0, 2, 4, 6, 8, 10];
  const sTicks = [0, 1, 2, 3, 4, 5, 6];
  const label = `Map of disk size against distance. The disk is ${fmtMm(size)} millimetres at ${distance.toFixed(2)} metres. The boundary for a typical sharp-eyed person is a straight line from the origin: a ${fmtMm(doubling.one.sizeMm)} millimetre disk reaches ${fmtMetres(doubling.one.typicalM)} and a ${fmtMm(doubling.two.sizeMm)} millimetre disk reaches ${fmtMetres(doubling.two.typicalM)}.`;

  return (
    <div ref={box} className="relative w-full" style={{ height: width ? height : 360 }}>
      {width > 0 && (
        <>
          <canvas ref={canvas} width={COLS} height={ROWS} aria-hidden="true" className="absolute" style={{ left: M.l, top: M.t, width: pw, height: ph }} />
          <svg
            width={width}
            height={height}
            role="img"
            aria-label={label}
            className="absolute inset-0 cursor-crosshair select-none"
            style={{ fontFamily: SVG_FONT, touchAction: "pan-y" }}
            onPointerDown={pick}
            onPointerMove={(e) => e.buttons === 1 && e.pointerType !== "touch" && pick(e)}
          >
            <defs>
              <pattern id="sci-band" width="7" height="7" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
                <line x1="0" y1="0" x2="0" y2="7" stroke={INK} strokeOpacity="0.45" strokeWidth="1" />
              </pattern>
              <clipPath id="sci-plot">
                <rect x={M.l} y={M.t} width={pw} height={ph} />
              </clipPath>
            </defs>

            {dTicks.map((d) => (
              <g key={`d${d}`}>
                <line x1={x(d)} x2={x(d)} y1={M.t} y2={M.t + ph} stroke={RULE} strokeWidth="1" />
                <text x={x(d)} y={M.t + ph + 20} textAnchor="middle" fontSize="13" fill={MUTED} className="num">
                  {d}
                </text>
              </g>
            ))}
            {sTicks.map((s) => (
              <g key={`s${s}`}>
                <line x1={M.l} x2={M.l + pw} y1={y(s)} y2={y(s)} stroke={RULE} strokeWidth="1" />
                <text x={M.l - 10} y={y(s) + 4} textAnchor="end" fontSize="13" fill={MUTED} className="num">
                  {s}
                </text>
              </g>
            ))}
            <line x1={M.l} x2={M.l + pw} y1={M.t + ph} y2={M.t + ph} stroke={INK} strokeWidth="1" />
            <line x1={M.l} x2={M.l} y1={M.t} y2={M.t + ph} stroke={INK} strokeWidth="1" />
            <text x={M.l + pw / 2} y={height - 8} textAnchor="middle" fontSize="13" fill={INK} letterSpacing="0.4">
              DISTANCE FROM THE VIEWER (m)
            </text>
            <text transform={`translate(15 ${M.t + ph / 2}) rotate(-90)`} textAnchor="middle" fontSize="13" fill={INK} letterSpacing="0.4">
              DISK DIAMETER (mm)
            </text>

            <g clipPath="url(#sci-plot)">
              <path d={band} fill="url(#sci-band)" />
              <path d={path(perfect)} fill="none" stroke={INK} strokeWidth="1.5" strokeDasharray="6 4" strokeLinejoin="round" />
              <path d={path(typical)} fill="none" stroke={INK} strokeWidth="2.25" strokeLinejoin="round" />
            </g>

            {/* the doubling pair, on the typical line */}
            {[doubling.one, doubling.two].map((r, i) => (
              <g key={i}>
                <line x1={x(r.typicalM)} x2={x(r.typicalM)} y1={y(r.sizeMm)} y2={M.t + ph} stroke={INK} strokeOpacity="0.55" strokeWidth="1" strokeDasharray="2 3" />
                <line x1={M.l} x2={x(r.typicalM)} y1={y(r.sizeMm)} y2={y(r.sizeMm)} stroke={INK} strokeOpacity="0.55" strokeWidth="1" strokeDasharray="2 3" />
                <circle cx={x(r.typicalM)} cy={y(r.sizeMm)} r="4.5" fill={INK} stroke={PAPER} strokeWidth="2" />
                {x(r.typicalM) < M.l + pw - 10 && (
                  <text
                    x={x(r.typicalM) - 9}
                    y={y(r.sizeMm) - 9}
                    textAnchor="end"
                    fontSize="13"
                    fill={INK}
                    stroke={PAPER}
                    strokeWidth="4"
                    paintOrder="stroke"
                    className="num"
                  >
                    {fmtMm(r.sizeMm)} mm: {fmtMetres(r.typicalM)}
                  </text>
                )}
              </g>
            ))}

            {/* direct labels, turned along their lines, with a paper halo so they read over the heat */}
            {labels.map((l) => (
              <text key={l.text} transform={l.transform} textAnchor="middle" fontSize="14" fill={INK} stroke={PAPER} strokeWidth="4" paintOrder="stroke" style={{ fontWeight: 500 }}>
                {l.text}
              </text>
            ))}
            <text x={M.l + 12} y={M.t + 22} fontSize="13" fill={MUTED} stroke={PAPER} strokeWidth="4" paintOrder="stroke">
              Seen
            </text>
            <text x={M.l + pw - 10} y={M.t + ph - 12} textAnchor="end" fontSize="13" fill={MUTED} stroke={PAPER} strokeWidth="4" paintOrder="stroke">
              Out of sight, even for perfect eyes
            </text>

            {/* where you are */}
            <line x1={x(distance)} x2={x(distance)} y1={y(size)} y2={M.t + ph} stroke={INK} strokeWidth="1" />
            <line x1={M.l} x2={x(distance)} y1={y(size)} y2={y(size)} stroke={INK} strokeWidth="1" />
            <circle cx={x(distance)} cy={y(size)} r="8" fill={PAPER} stroke={INK} strokeWidth="2.5" />
            <circle cx={x(distance)} cy={y(size)} r="2.5" fill={INK} />
            <text x={x(distance)} y={M.t + ph - 6} textAnchor={distance > 8.5 ? "end" : "start"} dx={distance > 8.5 ? -6 : 6} fontSize="13" fill={INK} stroke={PAPER} strokeWidth="4" paintOrder="stroke" className="num">
              {fmtMetres(distance)}
            </text>
          </svg>
        </>
      )}
    </div>
  );
}
