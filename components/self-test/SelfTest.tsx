"use client";

import { useEffect, useId, useRef, useState } from "react";
import { formatDistance, toUnit } from "@/app/_lib/axis";
import { compareObserved } from "@/lib/selftest/predict";
import type { SelfTestCopy, SelfTestPrediction, SelfTestTarget } from "@/lib/integration/selfTest";

const CARD_W_MM = 85.6; // ISO/IEC 7810 ID-1
const CARD_H_MM = 53.98;
const MM_PER_INCH = 25.4;
const DEFAULT_PX_PER_MM = 96 / MM_PER_INCH;
const MIN_PX_PER_MM = 2;
const MAX_PX_PER_MM = 8.5;
const MIN_DISTANCE_M = 0.2;
const MAX_DISTANCE_M = 10;

interface SelfTestProps {
  target: SelfTestTarget;
  prediction: SelfTestPrediction;
  copy: SelfTestCopy;
}

type Step = 1 | 2 | 3;

const STEPS = [
  { n: 1, title: "Calibrate" },
  { n: 2, title: "Walk back" },
  { n: 3, title: "Compare" },
] as const;

const clampScale = (v: number) => Math.min(MAX_PX_PER_MM, Math.max(MIN_PX_PER_MM, v));

/**
 * The walk-back self-test. Calibration and the target are drawn for real at the calibrated size; the measured distance
 * is typed in and compared with the model's prediction (lib/selftest) for the average viewer and for the bound.
 * Walking is optional: a friend can carry the screen away, or the prediction can be read without testing.
 */
export function SelfTest({ target, prediction, copy }: SelfTestProps) {
  const [step, setStep] = useState<Step>(1);
  const [pxPerMm, setPxPerMm] = useState(DEFAULT_PX_PER_MM);
  const [measured, setMeasured] = useState("");
  const root = useRef<HTMLDivElement>(null);
  const moved = useRef(false);

  // A step replaces the button that was pressed, so keyboard and screen-reader users land on the new step's heading.
  useEffect(() => {
    if (!moved.current) return;
    root.current?.querySelector<HTMLElement>("h2")?.focus();
  }, [step]);
  const go = (next: Step) => {
    moved.current = true;
    setStep(next);
  };

  // The label comes from the model's own target ("an age spot" in lib/integration); on screen it reads like the rest of the copy.
  const spot = `a dark spot, ${target.diameterMm} mm across`;

  return (
    <div ref={root}>
      <ol className="grid grid-cols-3 border-t border-ink" aria-label="Steps">
        {STEPS.map((s) => (
          <li
            key={s.n}
            aria-current={step === s.n ? "step" : undefined}
            className={`border-b py-3 pr-3 ${step === s.n ? "border-ink" : "border-rule"}`}
          >
            <span className="num font-mono text-[0.875rem] text-muted">0{s.n}</span>
            <span className={`serif mt-1 block text-[1.125rem] leading-tight sm:text-[1.375rem] ${step >= s.n ? "text-ink" : "text-muted"}`}>{s.title}</span>
          </li>
        ))}
      </ol>

      <div className="mt-10 md:mt-14">
        {step === 1 && <Calibrate pxPerMm={pxPerMm} onChange={setPxPerMm} onNext={() => go(2)} onSkip={() => go(3)} />}
        {step === 2 && <WalkBack target={target} spot={spot} pxPerMm={pxPerMm} onBack={() => go(1)} onNext={() => go(3)} />}
        {step === 3 && (
          <Compare
            spot={spot}
            prediction={prediction}
            copy={copy}
            measured={measured}
            onMeasured={setMeasured}
            onBack={() => go(2)}
            onRestart={() => {
              setMeasured("");
              go(2);
            }}
          />
        )}
      </div>
    </div>
  );
}

function Calibrate({ pxPerMm, onChange, onNext, onSkip }: { pxPerMm: number; onChange: (v: number) => void; onNext: () => void; onSkip: () => void }) {
  const id = useId();
  const dpiId = useId();
  const w = CARD_W_MM * pxPerMm;
  const h = CARD_H_MM * pxPerMm;
  const dpi = Math.round(pxPerMm * MM_PER_INCH);
  const nudge = (factor: number) => onChange(clampScale(pxPerMm * factor));
  // On narrow screens the card will not fit lengthways, so show it upright.
  return (
    <div className="grid gap-10 lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)] lg:gap-16">
      <div>
        <p className="eyebrow">Step 1</p>
        <h2 tabIndex={-1} className="display mt-3 text-[clamp(2rem,1.4rem+2.4vw,3.25rem)] outline-none">
          Match a bank card
        </h2>
        <p className="lede mt-5 max-w-[30rem]">
          Hold a bank card flat against your screen. Make the rectangle the same size as the card, with the slider, the nudge buttons or your screen&rsquo;s dots per inch if you know it. Any card works: they are all {CARD_W_MM} by {CARD_H_MM} mm.
        </p>

        <div className="mt-8">
          <label htmlFor={id} className="eyebrow block">
            Rectangle size
          </label>
          <input
            id={id}
            type="range"
            min={MIN_PX_PER_MM}
            max={MAX_PX_PER_MM}
            step={0.01}
            value={pxPerMm}
            onChange={(e) => onChange(Number(e.target.value))}
            aria-valuetext={`${pxPerMm.toFixed(2)} pixels per millimetre, about ${dpi} dots per inch`}
            className="mt-3 h-11 w-full cursor-ew-resize accent-[#161513]"
          />
          <div className="mt-2 flex flex-wrap items-center gap-3">
            <button type="button" className="btn btn-ghost btn-sm" onClick={() => nudge(1 / 1.01)} aria-label="Make the rectangle a little smaller">
              &minus; Smaller
            </button>
            <button type="button" className="btn btn-ghost btn-sm" onClick={() => nudge(1.01)} aria-label="Make the rectangle a little larger">
              + Larger
            </button>
          </div>
          <div className="mt-5">
            <label htmlFor={dpiId} className="eyebrow block">
              Or type your screen&rsquo;s dots per inch
            </label>
            <input
              id={dpiId}
              type="number"
              inputMode="numeric"
              min={Math.round(MIN_PX_PER_MM * MM_PER_INCH)}
              max={Math.round(MAX_PX_PER_MM * MM_PER_INCH)}
              step={1}
              value={dpi}
              onChange={(e) => {
                const v = Number(e.target.value);
                if (Number.isFinite(v) && v > 0) onChange(clampScale(v / MM_PER_INCH));
              }}
              className="num mt-2 h-12 w-32 border border-ink bg-transparent px-4 text-[1.125rem]"
            />
          </div>
          <p className="num mt-2 font-mono text-[0.875rem] text-muted">
            {pxPerMm.toFixed(2)} px per mm &middot; about {dpi} dpi
          </p>
        </div>

        <div className="mt-8 flex flex-wrap items-center gap-x-6 gap-y-3">
          <button type="button" className="btn btn-primary" onClick={onNext}>
            It matches <span className="arrow" aria-hidden="true">&rarr;</span>
          </button>
          <button type="button" className="link min-h-11 text-[0.9375rem]" onClick={onSkip}>
            I can&rsquo;t walk back: show me the prediction
          </button>
        </div>
      </div>

      <div className="stage on-stage grid min-h-[22rem] place-items-center overflow-auto p-4 md:p-8">
        {/* Lengthways on wide screens; upright on phones, where a card is wider than the screen. */}
        <CardOutline width={w} height={h} className="hidden sm:block" />
        <CardOutline width={h} height={w} className="sm:hidden" upright />
      </div>
    </div>
  );
}

function CardOutline({ width, height, className, upright }: { width: number; height: number; className?: string; upright?: boolean }) {
  return (
    <div
      role="img"
      aria-label={`Rectangle the size of a bank card, ${CARD_W_MM} by ${CARD_H_MM} millimetres${upright ? ", shown upright" : ""}`}
      className={`relative shrink-0 border-2 border-ink bg-paper/90 ${className ?? ""}`}
      style={{ width, height }}
    >
      <span className="absolute left-3 top-2 font-mono text-[0.875rem] uppercase tracking-[0.06em]">ID-1 &middot; {CARD_W_MM} &times; {CARD_H_MM} mm</span>
      <span className="absolute bottom-3 left-3 right-3 h-6 bg-ink/15" aria-hidden="true" />
    </div>
  );
}

function WalkBack({ target, spot, pxPerMm, onBack, onNext }: { target: SelfTestTarget; spot: string; pxPerMm: number; onBack: () => void; onNext: () => void }) {
  const d = target.diameterMm * pxPerMm;
  // A mid-grey field with a slightly darker disc: the sRGB values the prediction was computed for.
  const field = target.fieldSrgb;
  const dot = target.discSrgb;
  return (
    <div className="grid gap-10 lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)] lg:gap-16">
      <div>
        <p className="eyebrow">Step 2</p>
        <h2 tabIndex={-1} className="display mt-3 text-[clamp(2rem,1.4rem+2.4vw,3.25rem)] outline-none">
          Walk back until it disappears
        </h2>
        <p className="lede mt-5 max-w-[30rem]">
          The disc is {spot}, drawn at its true size on your screen. Stand up, step back slowly, keep your eyes on the centre, and tap the button the moment it is gone.
        </p>
        <p className="mt-4 max-w-[30rem] text-[1rem] leading-relaxed text-ink-soft">
          This isn&rsquo;t an eye test. Mind the furniture, and only walk backwards where the floor is clear.
        </p>
        <p className="mt-3 max-w-[30rem] text-[0.9375rem] leading-relaxed text-muted">
          Rather not walk? Stay seated and ask a friend to carry the screen away from you, or put the laptop on a table and slide your chair back with a tape measure on the floor. Dim the room if you can.
        </p>
        <div className="mt-8 flex flex-wrap gap-3">
          <button type="button" className="btn btn-primary" onClick={onNext}>
            It&rsquo;s gone <span className="arrow" aria-hidden="true">&rarr;</span>
          </button>
          <button type="button" className="btn btn-ghost" onClick={onBack}>
            Recalibrate
          </button>
        </div>
      </div>

      <div
        className="relative grid min-h-[22rem] place-items-center overflow-hidden"
        style={{ background: `rgb(${field},${field},${field})`, height: "min(70svh, 560px)" }}
      >
        <span
          role="img"
          aria-label={`Target: a ${target.diameterMm} millimetre disc`}
          className="block rounded-full"
          style={{ width: d, height: d, background: `rgb(${dot},${dot},${dot})` }}
        />
        <span className="absolute bottom-3 left-3 border border-ink/15 bg-paper px-2.5 py-1.5 font-mono text-[0.875rem] leading-none">
          {target.diameterMm} mm &middot; {Math.round(target.contrast * 100)}% contrast
        </span>
      </div>
    </div>
  );
}

function Compare({
  spot,
  prediction,
  copy,
  measured,
  onMeasured,
  onBack,
  onRestart,
}: {
  spot: string;
  prediction: SelfTestPrediction;
  copy: SelfTestCopy;
  measured: string;
  onMeasured: (v: string) => void;
  onBack: () => void;
  onRestart: () => void;
}) {
  const id = useId();
  const errorId = useId();
  const raw = measured.trim();
  const m = Number(raw.replace(",", "."));
  const entered = raw !== "";
  const valid = entered && Number.isFinite(m) && m >= MIN_DISTANCE_M && m <= MAX_DISTANCE_M;
  const side = valid ? compareObserved(m, prediction).side : null;
  const pct = (d: number) => `${toUnit(d, { min: 0.25, max: 6 }) * 100}%`;

  return (
    <div className="grid gap-10 lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)] lg:gap-16">
      <div>
        <p className="eyebrow">Step 3</p>
        <h2 tabIndex={-1} className="display mt-3 text-[clamp(2rem,1.4rem+2.4vw,3.25rem)] outline-none">
          Your eyes against the model
        </h2>
        <p className="lede mt-5 max-w-[30rem]">How far were you when {spot} disappeared? Measure it with steps, a tape or a guess.</p>

        <div className="mt-8">
          <label htmlFor={id} className="eyebrow block">
            Distance when it disappeared (metres)
          </label>
          <input
            id={id}
            type="text"
            inputMode="decimal"
            autoComplete="off"
            value={measured}
            onChange={(e) => onMeasured(e.target.value)}
            placeholder="2.1"
            aria-invalid={entered && !valid ? true : undefined}
            aria-describedby={entered && !valid ? errorId : undefined}
            className="num mt-3 h-12 w-40 border border-ink bg-transparent px-4 text-[1.125rem] placeholder:text-muted"
          />
          {entered && !valid && (
            <p id={errorId} role="alert" className="mt-2 max-w-[30rem] text-[0.9375rem] leading-relaxed text-ink">
              Enter a distance between {MIN_DISTANCE_M} and {MAX_DISTANCE_M} metres, for example 2.1.
            </p>
          )}
        </div>

        <div className="mt-8 flex flex-wrap gap-3">
          <button type="button" className="btn btn-ghost" onClick={onRestart}>
            Try again
          </button>
          <button type="button" className="btn btn-ghost" onClick={onBack}>
            Back
          </button>
        </div>
      </div>

      <div>
        <div className="border-t border-ink pt-5">
          <p className="eyebrow">The model says</p>
          <p className="serif num mt-2 text-[clamp(2.25rem,1.6rem+2.8vw,4rem)] leading-none tracking-[-0.02em]" style={{ fontWeight: 340 }}>
            gone beyond {formatDistance(prediction.boundM)}
          </p>
          <p className="num mt-2 font-mono text-[0.875rem] text-muted">average viewer: about {formatDistance(prediction.nominalM)}</p>

          <div className="relative mt-8 h-16" role="img" aria-label={`Average viewer ${formatDistance(prediction.nominalM)}, model limit ${formatDistance(prediction.boundM)}${valid ? `, you ${formatDistance(m)}` : ""}`}>
            <div className="absolute inset-x-0 top-6 h-px bg-rule-strong" />
            <div className="absolute top-[1.3rem] h-2.5 border border-ink" style={{ left: pct(prediction.nominalM), width: `calc(${pct(prediction.boundM)} - ${pct(prediction.nominalM)})` }} />
            <span className="absolute top-6 h-3 w-3 -translate-x-1/2 -translate-y-1/2 rounded-full border-[1.5px] border-ink bg-paper" style={{ left: pct(prediction.boundM) }} />
            {valid && (
              <>
                <span className="absolute top-6 h-3 w-3 -translate-x-1/2 -translate-y-1/2 rounded-full bg-ink shadow-[0_0_0_2px_var(--paper)]" style={{ left: pct(Math.min(6, Math.max(0.25, m))) }} />
                <span className="num absolute top-9 -translate-x-1/2 whitespace-nowrap font-mono text-[0.875rem]" style={{ left: pct(Math.min(6, Math.max(0.25, m))) }}>
                  you &middot; {formatDistance(m)}
                </span>
              </>
            )}
          </div>

          <div aria-live="polite" className="mt-6 min-h-16 max-w-[34rem] text-[1rem] leading-relaxed text-ink-soft">
            <p>{side ? copy[side === "below" ? "below" : side === "inside" ? "inside" : "above"] : "Enter the distance to see how your eyes compare."}</p>
            {side === "above" && (
              <p className="mt-3">
                Seeing it farther than predicted is common, and nothing is wrong with you or your eyes. A bright screen shows more contrast than our dim-indoor-screen figure, glasses or contact lenses can sharpen
                you past 20/20, and knowing where to look helps. Dim the room, lower the brightness and try again.
              </p>
            )}
          </div>
        </div>
        <p className="mt-8 max-w-[34rem] border-t border-rule pt-4 text-[0.9375rem] leading-relaxed text-muted">{copy.caveat}</p>
      </div>
    </div>
  );
}
