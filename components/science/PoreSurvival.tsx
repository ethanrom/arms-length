"use client";

import { useEffect, useMemo, useRef, useState, type PointerEvent as ReactPointerEvent } from "react";
import type { ConcernId } from "@/lib/contracts";
import { concernName } from "@/lib/copy/concerns";
import { formatDistance } from "@/lib/copy/distance";
import { fmtMetres } from "@/lib/science/format";
import { reachesOf } from "@/lib/science/reach";
import { countAtLeast, kthLargest, logGrid, matchRecordedProfile, medianOf, survivalAt, survivalSentence } from "@/lib/science/survival";
import { niceDistance } from "@/lib/science/format";
import { logScale, RangeField, Segmented, useElementWidth } from "./controls";
import { scanFeatures, type DistancesResult } from "./distancesClient";
import { Cite, DataTable, INK, MUTED, OnWidget, PAPER, Plate, Reading, RULE, SVG_FONT } from "./kit";
import { useP2b } from "./useP2b";

const D_MIN = 0.2;
const D_MAX = 8;
const DIST = logScale(D_MIN, D_MAX, 200, niceDistance);
const GRID = logGrid(D_MIN, D_MAX, 120);
const CONCERNS: { value: ConcernId; label: string }[] = [
  { value: "pore", label: "Pores" },
  { value: "age_spot", label: "Dark spots" },
  { value: "wrinkle", label: "Fine lines" },
  { value: "acne", label: "Breakouts" },
];

/** "From 649 pores to one sentence": the survival curve of a concern's features, for both observers, from the recorded face. */
export function PoreSurvival() {
  const state = useP2b();
  const [scan, setScan] = useState<DistancesResult | null>(null);
  const [concern, setConcern] = useState<ConcernId>("pore");
  const [step, setStep] = useState(DIST.toStep(1.5));
  const distance = DIST.toValue(step);

  useEffect(() => {
    if (state.status !== "ready") return;
    const b = state.bundle;
    scanFeatures(b.measurements.features, b.scale, b.viewing).then(setScan);
  }, [state]);

  const data = useMemo(() => (scan ? reachesOf(scan.reaches, concern) : null), [scan, concern]);
  const recorded = state.status === "ready" ? state.bundle.report.concerns.find((c) => c.concern === concern) : undefined;
  const total = data?.bound.length ?? 0;
  const noun = concernName(concern, "plural");

  const stats = useMemo(() => {
    if (!data || total === 0) return null;
    return {
      farthest: kthLargest(data.bound, 1),
      fifth: kthLargest(data.bound, 5),
      median: medianOf(data.bound),
      reach4: countAtLeast(data.bound, 4),
      match: recorded?.profile ? matchRecordedProfile(data.bound, recorded.profile) : null,
      matchNominal: recorded?.nominalProfile ? matchRecordedProfile(data.nominal, recorded.nominalProfile) : null,
    };
  }, [data, total, recorded]);

  const typical = data ? countAtLeast(data.nominal, distance) : 0;
  const perfect = data ? countAtLeast(data.bound, distance) : 0;

  const loading = state.status === "loading" || (state.status === "ready" && !scan);
  const rows = data
    ? GRID.filter((_, i) => i % 12 === 0).map((d) => [fmtMetres(d), countAtLeast(data.nominal, d), countAtLeast(data.bound, d)])
    : [];

  return (
    <Plate
      label={`How many ${noun} are still picked out as the viewer steps back, for a typical sharp-eyed person and for even perfect eyes`}
      caption={
        <>
          Each tick under the chart is one {concernName(concern, "singular")} and the farthest distance at which it can be picked out. The curves count the ticks to the right of the
          distance you choose. The solid curve is for a typical sharp-eyed person looking right at them; the dashed curve is the ceiling for even perfect eyes. The squares are
          the eight distances the recorded report keeps; the curves are recomputed here.
        </>
      }
      on={
        <OnWidget
          files={[
            { path: "lib/vision/visibility.ts", label: "rawDistances" },
            { path: "lib/vision/report.ts", label: "detectabilityProfile" },
            { path: "public/demo/p2b/bundle.json", label: "p2b bundle" },
          ]}
        >
          Every feature of the recorded face p2b is scanned with <code className="font-mono text-[0.875rem]">rawDistances</code>
          {scan ? ` (${scan.reaches.length} features in ${Math.round(scan.ms)} ms${scan.inWorker ? ", in a Web Worker" : ""})` : ""}; the counts are{" "}
          <code className="font-mono text-[0.875rem]">detectabilityProfile</code>&rsquo;s rule, and the squares are read from the bundle. See
        </OnWidget>
      }
    >
      <div className="grid gap-8 lg:grid-cols-[minmax(0,4fr)_minmax(0,9fr)] lg:gap-14">
        <div className="space-y-5">
          <Segmented legend="Concern" value={concern} onChange={setConcern} options={CONCERNS} />
          <RangeField
            label="Viewer's distance"
            value={step}
            min={0}
            max={DIST.steps}
            step={1}
            onChange={setStep}
            display={formatDistance(distance)}
            valueText={`${distance.toFixed(2)} metres`}
            hint="Or drag on the chart."
          />
          <div className="border-t border-ink pt-5" aria-live="polite">
            {loading || !data ? (
              <p className="text-[0.9375rem] text-ink-soft">Scanning every feature of the recorded face in a worker.</p>
            ) : (
              <>
                <div data-testid="survival-count">
                  <Reading value={`${perfect}`} unit={`of ${total}`} size="xl" caption="at most, for even perfect eyes" />
                </div>
                <p className="mt-3 text-[1rem] leading-snug">
                  About <span className="num font-medium">{typical}</span> for a typical sharp-eyed person looking right at them.
                </p>
                <p className="mt-3 text-[0.9375rem] leading-snug text-ink-soft">{survivalSentence(concern, total, typical, perfect, distance)}</p>
              </>
            )}
          </div>
        </div>

        <div>
          {data && total > 0 ? (
            <SurvivalChart data={data} distance={distance} onPick={(d) => setStep(DIST.toStep(Math.min(D_MAX, Math.max(D_MIN, d))))} recorded={recorded} />
          ) : (
            <div className="grid h-[22rem] place-items-center text-[0.9375rem] text-muted">{loading ? "Loading the recorded face." : "Nothing to count."}</div>
          )}
        </div>
      </div>

      {stats && (
        <div className="mt-8 grid gap-x-12 gap-y-6 border-t border-ink pt-6 lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)]">
          <div>
            <p className="eyebrow !text-ink">Why not quote the farthest one?</p>
            <dl className="mt-3 grid grid-cols-[1fr_auto] gap-x-6 gap-y-1.5 text-[0.9375rem]">
              <dt className="text-ink-soft">Farthest single {concernName(concern, "singular")}</dt>
              <dd className="num text-right">{fmtMetres(stats.farthest)}</dd>
              <dt className="text-ink-soft">Fifth farthest</dt>
              <dd className="num text-right">{fmtMetres(stats.fifth)}</dd>
              <dt className="text-ink-soft">Reach 4 m</dt>
              <dd className="num text-right">{stats.reach4} of {total}</dd>
              <dt className="border-t border-rule pt-1.5 font-medium">The median {concernName(concern, "singular")}</dt>
              <dd className="num border-t border-rule pt-1.5 text-right font-medium">{fmtMetres(stats.median)}</dd>
            </dl>
            {stats.match && (
              <p className="mt-4 text-[0.875rem] leading-snug text-ink-soft" role="status">
                {stats.match.allEqual && (!stats.matchNominal || stats.matchNominal.allEqual)
                  ? `Recomputed counts equal the recorded report at all ${stats.match.rows.length} distances, for both observers.`
                  : "The recomputed counts differ from the recorded report at some distances."}
              </p>
            )}
          </div>
          <div className="max-w-[40rem] space-y-3 text-[1rem] leading-[1.65] text-ink-soft">
            <p>
              The farthest {concernName(concern, "singular")} is decided by one outlier: a mark that happens to be large and dark. Quoting {fmtMetres(stats.farthest)} would say
              nothing about the other {Math.max(0, total - 1)}, and {stats.reach4 > 0 ? `only ${stats.reach4} of them` : "none of them"} get that far. So the report counts: how many are
              still picked out at each of eight distances, from a mirror to well across a room.
            </p>
            <p>
              Each count is a ceiling, because each distance is. So every sentence about relief says &ldquo;at most&rdquo; and names the viewer: even perfect eyes. What a typical
              person could pick out is a separate, smaller count. Both are the survival curve of the same ticks <Cite k="watson2005" />.
            </p>
          </div>
        </div>
      )}
      <DataTable label={`Number of ${noun} still picked out at several distances`} head={["Distance", "Typical eyes", "Perfect eyes (at most)"]} rows={rows} />
    </Plate>
  );
}

const M = { l: 50, r: 16, t: 14, b: 74 };

function SurvivalChart({
  data,
  distance,
  onPick,
  recorded,
}: {
  data: { bound: number[]; nominal: number[] };
  distance: number;
  onPick: (d: number) => void;
  recorded: { profile?: { distanceM: number; fraction: number }[]; nominalProfile?: { distanceM: number; fraction: number }[] } | undefined;
}) {
  const box = useRef<HTMLDivElement>(null);
  const width = useElementWidth(box);
  const height = Math.round(Math.min(420, Math.max(300, width * 0.52)));
  const pw = Math.max(0, width - M.l - M.r);
  const ph = height - M.t - M.b;
  const x = (d: number) => M.l + (Math.log(Math.min(D_MAX, Math.max(D_MIN, d)) / D_MIN) / Math.log(D_MAX / D_MIN)) * pw;
  const y = (f: number) => M.t + ph * (1 - f);
  const nominal = useMemo(() => survivalAt(data.nominal, GRID), [data]);
  const bound = useMemo(() => survivalAt(data.bound, GRID), [data]);
  const line = (vals: number[]) => vals.map((v, i) => `${i ? "L" : "M"}${x(GRID[i]).toFixed(1)} ${y(v).toFixed(1)}`).join(" ");
  const area = `${line(nominal)} L${x(D_MAX)} ${y(0)} L${x(D_MIN)} ${y(0)} Z`;
  const far = kthLargest(data.bound, 1);
  const total = data.bound.length;

  const pick = (e: ReactPointerEvent<SVGSVGElement>) => {
    const r = e.currentTarget.getBoundingClientRect();
    const u = (e.clientX - r.left - M.l) / pw;
    if (u < 0 || u > 1) return;
    onPick(D_MIN * Math.pow(D_MAX / D_MIN, u));
  };
  const ticks = [0.25, 0.5, 1, 2, 4, 8];
  const nAt = Math.round(survivalAt(data.nominal, [distance])[0] * 100);
  const bAt = Math.round(survivalAt(data.bound, [distance])[0] * 100);

  return (
    <div ref={box} className="w-full" style={{ height: width ? height : 340 }}>
      {width > 0 && (
        <svg
          width={width}
          height={height}
          role="img"
          aria-label={`Share of ${total} features still picked out against distance. At ${distance.toFixed(2)} metres, about ${nAt} percent for a typical sharp-eyed person and at most ${bAt} percent for even perfect eyes.`}
          style={{ fontFamily: SVG_FONT, touchAction: "pan-y" }}
          className="cursor-ew-resize select-none"
          onPointerDown={pick}
          onPointerMove={(e) => e.buttons === 1 && e.pointerType !== "touch" && pick(e)}
        >
          {[0, 0.25, 0.5, 0.75, 1].map((f) => (
            <g key={f}>
              <line x1={M.l} x2={M.l + pw} y1={y(f)} y2={y(f)} stroke={RULE} strokeWidth="1" />
              <text x={M.l - 10} y={y(f) + 4} textAnchor="end" fontSize="13" fill={MUTED} className="num">
                {Math.round(f * 100)}%
              </text>
            </g>
          ))}
          {ticks.map((t) => (
            <g key={t}>
              <line x1={x(t)} x2={x(t)} y1={M.t} y2={M.t + ph} stroke={RULE} strokeWidth="1" />
              <text x={x(t)} y={M.t + ph + 34} textAnchor="middle" fontSize="13" fill={MUTED} className="num">
                {t < 1 ? `${t * 100} cm` : `${t} m`}
              </text>
            </g>
          ))}
          <line x1={M.l} x2={M.l + pw} y1={M.t + ph} y2={M.t + ph} stroke={INK} strokeWidth="1" />

          {/* the rug: one tick per feature at its bound distance */}
          {data.bound.map((d, i) => (
            <line key={i} x1={x(d)} x2={x(d)} y1={M.t + ph + 4} y2={M.t + ph + 14} stroke={INK} strokeOpacity="0.22" strokeWidth="1" />
          ))}

          <path d={area} fill={INK} fillOpacity="0.09" />
          <path d={line(bound)} fill="none" stroke={INK} strokeWidth="1.75" strokeDasharray="7 4" strokeLinejoin="round" />
          <path d={line(nominal)} fill="none" stroke={INK} strokeWidth="2.25" strokeLinejoin="round" />

          {recorded?.profile?.map((p) => (
            <rect key={`b${p.distanceM}`} x={x(p.distanceM) - 4} y={y(p.fraction) - 4} width="8" height="8" fill={PAPER} stroke={INK} strokeWidth="1.5" />
          ))}
          {recorded?.nominalProfile?.map((p) => (
            <rect key={`n${p.distanceM}`} x={x(p.distanceM) - 4} y={y(p.fraction) - 4} width="8" height="8" fill={INK} stroke={PAPER} strokeWidth="1.5" />
          ))}

          <text x={x(0.34)} y={y(0.97) - 8} fontSize="14" fill={INK} stroke={PAPER} strokeWidth="4" paintOrder="stroke" style={{ fontWeight: 500 }}>
            even perfect eyes (at most)
          </text>
          <text x={x(0.22)} y={y(0.45)} fontSize="14" fill={INK} stroke={PAPER} strokeWidth="4" paintOrder="stroke" style={{ fontWeight: 500 }}>
            typical sharp-eyed person
          </text>
          <line x1={x(far)} x2={x(far)} y1={y(0.42)} y2={M.t + ph + 14} stroke={INK} strokeWidth="1.5" />
          <text x={x(far) - 6} y={y(0.42) + 4} textAnchor="end" fontSize="13" fill={INK} stroke={PAPER} strokeWidth="4" paintOrder="stroke">
            the farthest one: {fmtMetres(far)}
          </text>
          <text x={M.l + pw} y={height - 14} textAnchor="end" fontSize="13" fill={MUTED}>
            squares: the recorded report
          </text>
          <text x={M.l} y={height - 14} fontSize="13" fill={INK} letterSpacing="0.4">
            DISTANCE FROM THE VIEWER
          </text>

          {/* the chosen distance */}
          <line x1={x(distance)} x2={x(distance)} y1={M.t} y2={M.t + ph + 14} stroke={INK} strokeWidth="1.5" />
          <circle cx={x(distance)} cy={y(survivalAt(data.bound, [distance])[0])} r="6" fill={PAPER} stroke={INK} strokeWidth="2.5" />
          <circle cx={x(distance)} cy={y(survivalAt(data.nominal, [distance])[0])} r="5" fill={INK} stroke={PAPER} strokeWidth="2" />
        </svg>
      )}
    </div>
  );
}
