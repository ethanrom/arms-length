"use client";

import { useId, useState } from "react";
import { formatDistance, toUnit } from "@/app/_lib/axis";
import type { SelfTestCopy, SelfTestPrediction, SelfTestTarget } from "@/lib/mock/selfTest";

const CARD_W_MM = 85.6; // ISO/IEC 7810 ID-1
const CARD_H_MM = 53.98;
const DEFAULT_PX_PER_MM = 96 / 25.4;

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

/**
 * UI shell for the walk-back self-test. Calibration and the target are drawn for real; the measured distance
 * is typed in, and the prediction comes from props until the model is wired in.
 */
export function SelfTest({ target, prediction, copy }: SelfTestProps) {
  const [step, setStep] = useState<Step>(1);
  const [pxPerMm, setPxPerMm] = useState(DEFAULT_PX_PER_MM);
  const [measured, setMeasured] = useState("");

  return (
    <div>
      <ol className="grid grid-cols-3 border-t border-ink" aria-label="Steps">
        {STEPS.map((s) => (
          <li
            key={s.n}
            aria-current={step === s.n ? "step" : undefined}
            className={`border-b py-3 pr-3 ${step === s.n ? "border-ink" : "border-rule"}`}
          >
            <span className="num font-mono text-[0.6875rem] text-muted">0{s.n}</span>
            <span className={`serif mt-1 block text-[1.125rem] leading-tight sm:text-[1.375rem] ${step >= s.n ? "text-ink" : "text-muted"}`}>{s.title}</span>
          </li>
        ))}
      </ol>

      <div className="mt-10 md:mt-14">
        {step === 1 && <Calibrate pxPerMm={pxPerMm} onChange={setPxPerMm} onNext={() => setStep(2)} />}
        {step === 2 && <WalkBack target={target} pxPerMm={pxPerMm} onBack={() => setStep(1)} onNext={() => setStep(3)} />}
        {step === 3 && (
          <Compare
            target={target}
            prediction={prediction}
            copy={copy}
            measured={measured}
            onMeasured={setMeasured}
            onBack={() => setStep(2)}
            onRestart={() => {
              setMeasured("");
              setStep(2);
            }}
          />
        )}
      </div>
    </div>
  );
}

function Calibrate({ pxPerMm, onChange, onNext }: { pxPerMm: number; onChange: (v: number) => void; onNext: () => void }) {
  const id = useId();
  const w = CARD_W_MM * pxPerMm;
  const h = CARD_H_MM * pxPerMm;
  // On narrow screens the card will not fit lengthways, so show it upright.
  return (
    <div className="grid gap-10 lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)] lg:gap-16">
      <div>
        <p className="eyebrow">Step 1</p>
        <h2 className="display mt-3 text-[clamp(2rem,1.4rem+2.4vw,3.25rem)]">Match a bank card</h2>
        <p className="lede mt-5 max-w-[30rem]">
          Hold a bank card flat against your screen. Drag the slider until the rectangle is the same size as the card. Any card works: they are all {CARD_W_MM} by {CARD_H_MM} mm.
        </p>

        <div className="mt-8">
          <label htmlFor={id} className="eyebrow block">
            Rectangle size
          </label>
          <input
            id={id}
            type="range"
            min={2}
            max={8.5}
            step={0.01}
            value={pxPerMm}
            onChange={(e) => onChange(Number(e.target.value))}
            aria-valuetext={`${pxPerMm.toFixed(2)} pixels per millimetre, about ${Math.round(pxPerMm * 25.4)} dots per inch`}
            className="mt-3 h-11 w-full cursor-ew-resize accent-[#161513]"
          />
          <p className="num mt-1 font-mono text-[0.75rem] text-muted">
            {pxPerMm.toFixed(2)} px per mm · about {Math.round(pxPerMm * 25.4)} dpi
          </p>
        </div>

        <button type="button" className="btn btn-primary mt-8" onClick={onNext}>
          It matches <span className="arrow" aria-hidden="true">&rarr;</span>
        </button>
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
      <span className="absolute left-3 top-2 font-mono text-[0.625rem] uppercase tracking-[0.1em]">ID-1 · {CARD_W_MM} × {CARD_H_MM} mm</span>
      <span className="absolute bottom-3 left-3 right-3 h-6 bg-ink/15" aria-hidden="true" />
    </div>
  );
}

function WalkBack({ target, pxPerMm, onBack, onNext }: { target: SelfTestTarget; pxPerMm: number; onBack: () => void; onNext: () => void }) {
  const d = target.diameterMm * pxPerMm;
  // A mid-grey field with a slightly darker disc: the contrast of the spot against its surround.
  const field = 138;
  const spot = Math.round(field * (1 - target.contrast));
  return (
    <div className="grid gap-10 lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)] lg:gap-16">
      <div>
        <p className="eyebrow">Step 2</p>
        <h2 className="display mt-3 text-[clamp(2rem,1.4rem+2.4vw,3.25rem)]">Walk back until it disappears</h2>
        <p className="lede mt-5 max-w-[30rem]">
          The disc is {target.label}, drawn at its true size on your screen. Stand up, step back slowly, keep your eyes on the centre, and tap the button the moment it is gone.
        </p>
        <p className="mt-4 max-w-[30rem] text-[0.875rem] leading-relaxed text-muted">
          Easier with a friend holding the phone, or with the laptop on a table and a tape measure on the floor. Dim the room if you can.
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
          style={{ width: d, height: d, background: `rgb(${spot},${spot},${spot})` }}
        />
        <span className="absolute bottom-3 left-3 border border-ink/15 bg-paper px-2.5 py-1.5 font-mono text-[0.6875rem] uppercase leading-none tracking-[0.1em]">
          {target.diameterMm} mm · {Math.round(target.contrast * 100)}% contrast
        </span>
      </div>
    </div>
  );
}

function Compare({
  target,
  prediction,
  copy,
  measured,
  onMeasured,
  onBack,
  onRestart,
}: {
  target: SelfTestTarget;
  prediction: SelfTestPrediction;
  copy: SelfTestCopy;
  measured: string;
  onMeasured: (v: string) => void;
  onBack: () => void;
  onRestart: () => void;
}) {
  const id = useId();
  const m = Number(measured.replace(",", "."));
  const has = Number.isFinite(m) && m > 0;
  const within = has && m <= prediction.intervalM[1];
  const pct = (d: number) => `${toUnit(d, { min: 0.25, max: 6 }) * 100}%`;

  return (
    <div className="grid gap-10 lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)] lg:gap-16">
      <div>
        <p className="eyebrow">Step 3</p>
        <h2 className="display mt-3 text-[clamp(2rem,1.4rem+2.4vw,3.25rem)]">Your eyes against the model</h2>
        <p className="lede mt-5 max-w-[30rem]">How far were you when {target.label} disappeared? Measure it with steps, a tape or a guess.</p>

        <div className="mt-8">
          <label htmlFor={id} className="eyebrow block">
            Distance when it disappeared (metres)
          </label>
          <input
            id={id}
            type="number"
            inputMode="decimal"
            min={0.2}
            max={10}
            step={0.1}
            value={measured}
            onChange={(e) => onMeasured(e.target.value)}
            placeholder="2.1"
            className="num mt-3 h-12 w-40 border border-ink bg-transparent px-4 text-[1.125rem] placeholder:text-muted"
          />
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
        <div className="border-t border-ink pt-5" aria-live="polite">
          <p className="eyebrow">The model says</p>
          <p className="serif num mt-2 text-[clamp(2.25rem,1.6rem+2.8vw,4rem)] leading-none tracking-[-0.02em]" style={{ fontWeight: 340 }}>
            gone beyond {formatDistance(prediction.distanceM)}
          </p>
          <p className="num mt-2 font-mono text-[0.75rem] text-muted">
            plausible range {formatDistance(prediction.intervalM[0])} to {formatDistance(prediction.intervalM[1])}
          </p>

          <div className="relative mt-8 h-14" role="img" aria-label={`Model limit ${formatDistance(prediction.distanceM)}${has ? `, you ${formatDistance(m)}` : ""}`}>
            <div className="absolute inset-x-0 top-6 h-px bg-rule-strong" />
            <div className="absolute top-[1.3rem] h-2.5 border border-ink" style={{ left: pct(prediction.intervalM[0]), width: `calc(${pct(prediction.intervalM[1])} - ${pct(prediction.intervalM[0])})` }} />
            <span className="absolute top-6 h-3 w-3 -translate-x-1/2 -translate-y-1/2 rounded-full border-[1.5px] border-ink bg-paper" style={{ left: pct(prediction.distanceM) }} />
            {has && (
              <>
                <span className="absolute top-6 h-3 w-3 -translate-x-1/2 -translate-y-1/2 rounded-full bg-ink shadow-[0_0_0_2px_var(--paper)]" style={{ left: pct(Math.min(6, Math.max(0.25, m))) }} />
                <span className="num absolute top-9 -translate-x-1/2 font-mono text-[0.6875rem]" style={{ left: pct(Math.min(6, Math.max(0.25, m))) }}>
                  you · {formatDistance(m)}
                </span>
              </>
            )}
          </div>

          <p className="mt-6 min-h-16 max-w-[34rem] text-[1rem] leading-relaxed text-ink-soft">
            {has ? (within ? copy.consistent : copy.beyond) : "Enter the distance to see how your eyes compare."}
          </p>
        </div>
        <p className="mt-8 max-w-[34rem] border-t border-rule pt-4 text-[0.8125rem] leading-relaxed text-muted">{copy.caveat}</p>
      </div>
    </div>
  );
}
