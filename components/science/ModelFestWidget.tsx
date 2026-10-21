"use client";

import { useEffect, useRef, useState, type KeyboardEvent } from "react";
import { getStimulus, MODELFEST_SIZE } from "@/eval/modelfest/stimuli";
import { fmtDb } from "@/lib/science/format";
import { MODELFEST_POINTS, summarize, type ModelFestPoint } from "@/lib/science/modelfest";
import { useElementWidth } from "./controls";
import { DataTable, INK, MUTED, OnWidget, PAPER, Plate, Reading, RULE, SVG_FONT } from "./kit";
import { rerunStimulus, type RerunResult } from "./modelfestClient";

const D_MIN = -45;
const D_MAX = -5;
const M = { l: 52, r: 14, t: 14, b: 48 };
const SUMMARY = summarize();
const BY_OBSERVED = [...MODELFEST_POINTS].sort((a, b) => a.observedDb - b.observedDb);

/** Grey code of a stimulus value in [-1, 1], as in the ModelFest images: g = 128 + 127 c. */
const grey = (c: number) => Math.max(0, Math.min(255, Math.round(128 + 127 * c)));

const pixelCache = new Map<number, ImageData>();

/** The stimulus image, generated in the browser from eval/modelfest/stimuli.ts (about 5 ms each), cached. */
function stimulusImage(id: number): ImageData {
  let img = pixelCache.get(id);
  if (img) return img;
  const build = getStimulus(id).build;
  img = new ImageData(MODELFEST_SIZE, MODELFEST_SIZE);
  if (build) {
    const v = build();
    for (let i = 0; i < v.length; i++) {
      const g = grey(v[i]);
      img.data[i * 4] = g;
      img.data[i * 4 + 1] = g;
      img.data[i * 4 + 2] = g;
      img.data[i * 4 + 3] = 255;
    }
  }
  pixelCache.set(id, img);
  return img;
}

let scratch: HTMLCanvasElement | null = null;

/** Draws a stimulus scaled into a canvas of any size. */
function drawStimulus(target: HTMLCanvasElement, id: number) {
  const ctx = target.getContext("2d");
  if (!ctx) return;
  scratch ??= Object.assign(document.createElement("canvas"), { width: MODELFEST_SIZE, height: MODELFEST_SIZE });
  scratch.getContext("2d")?.putImageData(stimulusImage(id), 0, 0);
  ctx.imageSmoothingEnabled = true;
  ctx.drawImage(scratch, 0, 0, target.width, target.height);
}

function StimulusCanvas({ id, px, delay = 0, className }: { id: number; px: number; delay?: number; className?: string }) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const c = ref.current;
    if (!c) return;
    // Draw in turn, one stimulus per timer tick, so 41 thumbnails never block a frame for long.
    const t = window.setTimeout(() => drawStimulus(c, id), delay);
    return () => window.clearTimeout(t);
  }, [id, delay]);
  return <canvas ref={ref} width={px} height={px} aria-hidden="true" className={className} />;
}

/**
 * "Validated on ModelFest": the stimuli drawn from their published definitions, and predicted against observed thresholds
 * for the production detector. Hover or focus a point (or a thumbnail) to see the stimulus and its error.
 */
export function ModelFestWidget() {
  const [hover, setHover] = useState<number | null>(null);
  const [pinned, setPinned] = useState<number>(40);
  const activeId = hover ?? pinned;
  const active = MODELFEST_POINTS.find((p) => p.id === activeId) ?? MODELFEST_POINTS[0];

  const rows = MODELFEST_POINTS.map((p) => [`#${p.id} ${p.name}`, p.skinRelevant ? "yes" : "", p.observedDb.toFixed(2), p.predictedDb.toFixed(2), fmtDb(p.errorDb)]);

  return (
    <Plate
      label="ModelFest: predicted against observed thresholds for 41 stimuli, with the stimuli drawn from their definitions"
      caption={
        <>
          Each point is one ModelFest stimulus: the contrast 16 observers needed to just see it (across), against the contrast the detector says it needs (up). Points on the
          diagonal are perfect; the shaded strip is ±1 dB. Filled points are the {SUMMARY.nSkin} shapes that look like skin features: soft blobs, a disk, a thin line and
          its dipole, an edge. The two missing stimuli of the 43 are random noise and a photograph, which have no parameters to generate. Nothing was tuned on this data.
        </>
      }
      on={
        <OnWidget
          files={[
            { path: "eval/modelfest/stimuli.ts", label: "stimuli.ts" },
            { path: "eval/modelfest/run.ts", label: "runModelFest" },
            { path: "eval/results/modelfest.json", label: "modelfest.json" },
          ]}
        >
          The thumbnails are drawn in your browser by the stimulus definitions in <code className="font-mono text-[0.875rem]">stimuli.ts</code>. The points are the committed result of{" "}
          <code className="font-mono text-[0.875rem]">npx tsx eval/run.ts --detector=standard</code>; &ldquo;Run it here&rdquo; repeats that search for one stimulus in a Web Worker. See
        </OnWidget>
      }
    >
      <div className="grid gap-x-12 gap-y-6 md:grid-cols-[auto_1fr] md:items-end">
        <Reading value={SUMMARY.rmsAllDb.toFixed(2)} unit="dB RMS" size="xl" caption={`over ${SUMMARY.nAll} analytic stimuli`} />
        <div className="grid gap-x-10 gap-y-3 sm:grid-cols-3">
          <p className="text-[0.9375rem] leading-snug">
            <span className="serif num text-[1.75rem]" style={{ fontWeight: 340 }}>
              {SUMMARY.rmsSkinDb.toFixed(2)} dB
            </span>
            <br />
            <span className="text-ink-soft">over the {SUMMARY.nSkin} skin-like shapes</span>
          </p>
          <p className="text-[0.9375rem] leading-snug">
            <span className="serif num text-[1.75rem]" style={{ fontWeight: 340 }}>
              {SUMMARY.paperRms43Db.toFixed(2)} dB
            </span>
            <br />
            <span className="text-ink-soft">the paper&rsquo;s figure over all {SUMMARY.paperN}, noise and photograph included</span>
          </p>
          <p className="text-[0.9375rem] leading-snug">
            <span className="serif num text-[1.75rem]" style={{ fontWeight: 340 }}>
              {SUMMARY.observerRms0Db.toFixed(2)} dB
            </span>
            <br />
            <span className="text-ink-soft">how far one person is from the observer average</span>
          </p>
        </div>
      </div>

      <div className="mt-8 grid gap-8 border-t border-ink pt-8 lg:grid-cols-[minmax(0,17rem)_minmax(0,1fr)_minmax(0,17rem)] lg:gap-10 xl:grid-cols-[minmax(0,19rem)_minmax(0,1fr)_minmax(0,19rem)]">
        <div className="order-3 lg:order-1">
          <p className="eyebrow !text-ink">The 41 stimuli</p>
          <ul className="mt-3 grid grid-cols-6 gap-1.5" aria-label="Stimulus thumbnails">
            {BY_OBSERVED.map((p, i) => (
              <li key={p.id}>
                <button
                  type="button"
                  className={`relative block aspect-square w-full border ${p.id === activeId ? "border-ink shadow-[0_0_0_2px_var(--ink)]" : "border-rule-strong"}`}
                  aria-label={`Stimulus ${p.id}: ${p.name}`}
                  aria-pressed={p.id === pinned}
                  onClick={() => setPinned(p.id)}
                  onPointerEnter={() => setHover(p.id)}
                  onPointerLeave={() => setHover(null)}
                >
                  <StimulusCanvas id={p.id} px={56} delay={i * 6} className="block h-full w-full" />
                  {p.skinRelevant && <span aria-hidden="true" className="absolute right-0.5 top-0.5 h-1.5 w-1.5 rounded-full bg-ink ring-1 ring-paper" />}
                </button>
              </li>
            ))}
          </ul>
          <p className="mt-2 text-[0.875rem] leading-snug text-ink-soft">Ordered from the easiest to see to the hardest. A dot marks the skin-like shapes.</p>
        </div>

        <Scatter activeId={activeId} pinned={pinned} onHover={setHover} onPin={setPinned} />

        <div className="order-2 lg:order-3">
          <StimulusPanel point={active} />
        </div>
      </div>

      <DataTable label="Observed and predicted threshold for each of the 41 ModelFest stimuli" head={["Stimulus", "Skin-like", "Observed (dB)", "Predicted (dB)", "Error"]} rows={rows} />
    </Plate>
  );
}

function Scatter({ activeId, pinned, onHover, onPin }: { activeId: number; pinned: number; onHover: (id: number | null) => void; onPin: (id: number) => void }) {
  const box = useRef<HTMLDivElement>(null);
  const width = useElementWidth(box);
  const size = Math.min(width, 620);
  const pw = Math.max(0, size - M.l - M.r);
  const ph = size - M.t - M.b;
  const px = (db: number) => M.l + ((db - D_MIN) / (D_MAX - D_MIN)) * pw;
  const py = (db: number) => M.t + ph - ((db - D_MIN) / (D_MAX - D_MIN)) * ph;
  const ticks = [-40, -30, -20, -10];
  const active = MODELFEST_POINTS.find((p) => p.id === activeId);

  const onKey = (e: KeyboardEvent<HTMLElement>) => {
    const i = BY_OBSERVED.findIndex((p) => p.id === pinned);
    let next = i;
    if (e.key === "ArrowRight" || e.key === "ArrowUp") next = Math.min(BY_OBSERVED.length - 1, i + 1);
    else if (e.key === "ArrowLeft" || e.key === "ArrowDown") next = Math.max(0, i - 1);
    else if (e.key === "Home") next = 0;
    else if (e.key === "End") next = BY_OBSERVED.length - 1;
    else return;
    e.preventDefault();
    const id = BY_OBSERVED[next].id;
    onPin(id);
    box.current?.querySelector<HTMLButtonElement>(`[data-point="${id}"]`)?.focus();
  };

  // ±1 dB strip around the diagonal.
  const strip = `M${px(D_MIN)} ${py(D_MIN + 1)} L${px(D_MAX - 1)} ${py(D_MAX)} L${px(D_MAX)} ${py(D_MAX - 1)} L${px(D_MIN + 1)} ${py(D_MIN)} Z`;

  return (
    <div ref={box} className="order-1 min-w-0 lg:order-2">
      <div className="relative mx-auto" style={{ width: size || undefined, height: size || 360 }}>
        {size > 0 && (
          <>
            <svg width={size} height={size} role="img" aria-label="Scatter of predicted against observed threshold in decibels for 41 ModelFest stimuli. Points lie close to the diagonal." style={{ fontFamily: SVG_FONT }} className="absolute inset-0">
              {ticks.map((t) => (
                <g key={t}>
                  <line x1={M.l} x2={M.l + pw} y1={py(t)} y2={py(t)} stroke={RULE} strokeWidth="1" />
                  <line x1={px(t)} x2={px(t)} y1={M.t} y2={M.t + ph} stroke={RULE} strokeWidth="1" />
                  <text x={px(t)} y={M.t + ph + 20} textAnchor="middle" fontSize="13" fill={MUTED} className="num">
                    {t}
                  </text>
                  <text x={M.l - 10} y={py(t) + 4} textAnchor="end" fontSize="13" fill={MUTED} className="num">
                    {t}
                  </text>
                </g>
              ))}
              <path d={strip} fill={INK} fillOpacity="0.07" />
              <line x1={px(D_MIN)} y1={py(D_MIN)} x2={px(D_MAX)} y2={py(D_MAX)} stroke={INK} strokeWidth="1" />
              <line x1={M.l} x2={M.l + pw} y1={M.t + ph} y2={M.t + ph} stroke={INK} strokeWidth="1" />
              <line x1={M.l} x2={M.l} y1={M.t} y2={M.t + ph} stroke={INK} strokeWidth="1" />
              <text x={M.l + pw / 2} y={size - 8} textAnchor="middle" fontSize="13" fill={INK} letterSpacing="0.4">
                OBSERVED THRESHOLD (dB, MORE NEGATIVE = EASIER TO SEE)
              </text>
              <text transform={`translate(14 ${M.t + ph / 2}) rotate(-90)`} textAnchor="middle" fontSize="13" fill={INK} letterSpacing="0.4">
                PREDICTED (dB)
              </text>
              <text x={px(-14)} y={py(-14) - 14} textAnchor="middle" fontSize="13" fill={MUTED} transform={`rotate(-45 ${px(-14)} ${py(-14) - 14})`} stroke={PAPER} strokeWidth="4" paintOrder="stroke">
                prediction = observation
              </text>

              {active && (
                <>
                  <line x1={px(active.observedDb)} x2={px(active.observedDb)} y1={py(active.observedDb)} y2={py(active.predictedDb)} stroke={INK} strokeWidth="2" />
                  <circle cx={px(active.observedDb)} cy={py(active.predictedDb)} r="11" fill="none" stroke={INK} strokeWidth="1.5" />
                </>
              )}
              {MODELFEST_POINTS.map((p) => (
                <circle
                  key={p.id}
                  cx={px(p.observedDb)}
                  cy={py(p.predictedDb)}
                  r={p.skinRelevant ? 5 : 4.5}
                  fill={p.skinRelevant ? INK : PAPER}
                  stroke={PAPER}
                  strokeWidth={p.skinRelevant ? 2 : 0}
                  {...(p.skinRelevant ? {} : { stroke: INK, strokeWidth: 1.5 })}
                />
              ))}
              <g transform={`translate(${M.l + 12} ${M.t + 14})`} fontSize="13" fill={INK}>
                <circle cx="5" cy="-4" r="5" fill={INK} />
                <text x="16" y="0">skin-like shapes</text>
                <circle cx="130" cy="-4" r="4.5" fill={PAPER} stroke={INK} strokeWidth="1.5" />
                <text x="141" y="0">other stimuli</text>
              </g>
            </svg>
            {/* real buttons over the dots: 28 px targets, one tab stop, arrow keys to move */}
            <div role="group" aria-label="ModelFest stimuli. Arrow keys move between points." onKeyDown={onKey}>
              {MODELFEST_POINTS.map((p) => (
                <button
                  key={p.id}
                  type="button"
                  data-testid="mf-point"
                  data-point={p.id}
                  className="sci-hit"
                  style={{ left: px(p.observedDb), top: py(p.predictedDb) }}
                  tabIndex={p.id === pinned ? 0 : -1}
                  aria-label={`Stimulus ${p.id}, ${p.name}. Observed ${p.observedDb.toFixed(1)} dB, predicted ${p.predictedDb.toFixed(1)} dB, error ${fmtDb(p.errorDb)}.`}
                  aria-pressed={p.id === pinned}
                  onClick={() => onPin(p.id)}
                  onPointerEnter={() => onHover(p.id)}
                  onPointerLeave={() => onHover(null)}
                  onFocus={() => onHover(p.id)}
                  onBlur={() => onHover(null)}
                />
              ))}
            </div>
          </>
        )}
      </div>
    </div>
  );
}

function StimulusPanel({ point }: { point: ModelFestPoint }) {
  const [run, setRun] = useState<{ id: number; state: "running" } | { id: number; state: "done"; result: RerunResult } | { id: number; state: "error" } | null>(null);
  const mine = run && run.id === point.id ? run : null;

  const start = () => {
    setRun({ id: point.id, state: "running" });
    rerunStimulus(point.id).then(
      (result) => setRun({ id: point.id, state: "done", result }),
      () => setRun({ id: point.id, state: "error" }),
    );
  };

  return (
    <div aria-live="polite">
      <p className="eyebrow !text-ink">Stimulus {point.id}</p>
      <StimulusCanvas id={point.id} px={160} className="mt-3 block aspect-square w-40 border border-ink" />
      <p className="serif mt-3 text-[1.25rem] leading-snug" style={{ fontWeight: 400 }}>
        {point.name}
      </p>
      <dl className="mt-3 grid grid-cols-[1fr_auto] gap-x-5 gap-y-1 text-[0.9375rem]">
        <dt className="text-ink-soft">Observed</dt>
        <dd className="num text-right">{point.observedDb.toFixed(2)} dB</dd>
        <dt className="text-ink-soft">Predicted</dt>
        <dd className="num text-right">{point.predictedDb.toFixed(2)} dB</dd>
        <dt className="border-t border-rule pt-1 font-medium">Error</dt>
        <dd className="num border-t border-rule pt-1 text-right font-medium">{fmtDb(point.errorDb)}</dd>
      </dl>
      <p className="mt-2 text-[0.875rem] leading-snug text-ink-soft">
        {point.skinRelevant ? "A skin-like shape. " : ""}Observers differ from each other by {point.observerSdDb.toFixed(1)} dB (one standard deviation) on this one.
      </p>
      <button type="button" className="btn btn-ghost btn-sm mt-4" onClick={start} disabled={mine?.state === "running"}>
        {mine?.state === "running" ? "Running the detector" : "Run it here"}
      </button>
      {mine?.state === "done" && (
        <p className="num mt-2 text-[0.875rem] leading-snug">
          Recomputed in your browser: {mine.result.predictedDb.toFixed(2)} dB in {(mine.result.ms / 1000).toFixed(2)} s, {Math.abs(mine.result.predictedDb - point.predictedDb) < 0.01 ? "the same as the file" : `${fmtDb(mine.result.predictedDb - point.predictedDb)} from the file`}.
        </p>
      )}
      {mine?.state === "error" && <p className="mt-2 text-[0.875rem]">The worker could not run here; the file&rsquo;s number stands.</p>}
    </div>
  );
}
