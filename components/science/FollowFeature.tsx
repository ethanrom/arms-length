"use client";

import Image from "next/image";
import { useCallback, useEffect, useMemo, useRef, useState, type KeyboardEvent, type PointerEvent as ReactPointerEvent, type ReactNode } from "react";
import { cropAround } from "@/components/concerns/AnnotatedFace";
import { loadPhoto } from "@/components/step-back/photo";
import type { ConcernId, Feature, Point, RgbaImage } from "@/lib/contracts";
import { CONCERNS } from "@/lib/contracts";
import { concernName, concernTitle } from "@/lib/copy/concerns";
import { formatDistance } from "@/lib/copy/distance";
import { outlineOf } from "@/lib/integration/outline";
import { buildReceipt, locationInPhoto, receiptSentences, type ReceiptNumbers } from "@/lib/integration/receipt";
import type { ReadingBundle } from "@/lib/integration/types";
import { IRIS_DIAMETER_MM } from "@/lib/scale/iris";
import { DEFAULT_DISTANCE_M, DEFAULT_MARK } from "@/lib/science/defaults";
import { fmtArcmin, fmtMm, fmtPct } from "@/lib/science/format";
import { nearestFeature, neighbourInDirection, stepFeature, type Direction } from "@/lib/science/pick";
import { niceDistance } from "@/lib/science/format";
import { logScale, RangeField, Segmented, useElementWidth } from "./controls";
import acneMask from "./assets/p2b-acne.png";
import ageSpotMask from "./assets/p2b-age_spot.png";
import poreMask from "./assets/p2b-pore.png";
import wrinkleMask from "./assets/p2b-wrinkle.png";
import { Cite, INK, MUTED, OnWidget, PAPER, Plate, Reading, RULE, SVG_FONT } from "./kit";
import { useP2b } from "./useP2b";

const SHOWN: ConcernId[] = ["age_spot", "pore", "wrinkle", "acne"];
const DIST = logScale(0.25, 10, 150, niceDistance);
const D_MIN = 0.25;
const D_MAX = 10;
const HIT_PX = 16;

/**
 * YouCam's own "whole" masks for p2b, byte-identical to the recorded fixtures and at the analysis frame's size (1080 x 1341).
 * The copies in public/demo are shrunk to 220 px for the results page; the outline needs the full resolution.
 */
const MASK_URL: Partial<Record<ConcernId, string>> = {
  age_spot: ageSpotMask.src,
  pore: poreMask.src,
  wrinkle: wrinkleMask.src,
  acne: acneMask.src,
};

const maskCache = new Map<string, Promise<RgbaImage>>();
/** The concern's "whole" mask at full size, decoded once. */
function loadMask(concern: ConcernId): Promise<RgbaImage> {
  let p = maskCache.get(concern);
  if (!p) {
    // 4096 keeps the frame at its own size: the outline code works in frame pixels.
    p = loadPhoto(MASK_URL[concern] ?? "", 4096).then((l) => l.image);
    maskCache.set(concern, p);
    p.catch(() => maskCache.delete(concern));
  }
  return p;
}

/** The chain behind one distance, for any measured mark on the recorded face: mask, millimetres, contrast, angle, verdict. */
export function FollowFeature() {
  const state = useP2b();
  if (state.status === "error") return <p role="alert">The recorded face could not be loaded.</p>;
  if (state.status === "loading") return <div className="sci-plate sci-hatch grid min-h-[40rem] place-items-center text-[0.875rem] text-muted"><p>Loading the recorded face.</p></div>;
  return <Chain bundle={state.bundle} />;
}

function Chain({ bundle }: { bundle: ReadingBundle }) {
  const [concern, setConcern] = useState<ConcernId>("age_spot");
  const [selectedId, setSelectedId] = useState<string>(() => defaultFor(bundle, "age_spot"));
  const [step, setStep] = useState(DIST.toStep(DEFAULT_DISTANCE_M));
  const distance = DIST.toValue(step);
  const [mask, setMask] = useState<{ concern: ConcernId; image: RgbaImage } | null>(null);

  const features = useMemo(() => bundle.measurements.features.filter((f) => f.concern === concern), [bundle, concern]);
  const target = features.find((f) => f.id === selectedId) ?? features[0];

  useEffect(() => {
    let live = true;
    loadMask(concern).then((image) => live && setMask({ concern, image }));
    return () => {
      live = false;
    };
  }, [concern]);

  const outline = useMemo(() => (target && mask && mask.concern === concern ? outlineOf(target, mask.image) : null), [target, mask, concern]);
  const receipt = useMemo(() => (target ? buildReceipt(target, bundle.scale, bundle.viewing, distance) : null), [target, bundle, distance]);
  const sentences = useMemo(() => (receipt ? receiptSentences(receipt) : null), [receipt]);
  // The threshold curves: the same function, asked at each distance on a log grid.
  const curve = useMemo(() => {
    if (!target) return null;
    const grid = Array.from({ length: 41 }, (_, i) => D_MIN * Math.pow(D_MAX / D_MIN, i / 40));
    const rows = grid.map((d) => buildReceipt(target, bundle.scale, bundle.viewing, d));
    return rows.every(Boolean) ? grid.map((d, i) => ({ d, typical: rows[i]!.typicalThresholdPct, perfect: rows[i]!.thresholdPct })) : null;
  }, [target, bundle]);

  const choose = useCallback(
    (f: Feature | null) => {
      if (f) setSelectedId(f.id);
    },
    [],
  );

  const pickConcern = (c: ConcernId) => {
    setConcern(c);
    setSelectedId(defaultFor(bundle, c));
  };

  const index = target ? features.findIndex((f) => f.id === target.id) + 1 : 0;
  const where = target ? locationInPhoto(target.bbox, bundle.frame) : "";

  return (
    <Plate
      label="Follow one measured mark on a recorded face from the mask outline to the verdict"
      caption={
        <>
          Pick any mark on the photo. The five steps are the receipt behind a distance, computed for that mark at the distance you choose; nothing is typed in.
          The face is a synthetic, AI-generated portrait whose analysis was recorded from YouCam in advance, so no live call is made.
        </>
      }
      on={
        <OnWidget
          files={[
            { path: "lib/integration/receipt.ts", label: "buildReceipt" },
            { path: "lib/integration/outline.ts", label: "outlineOf" },
            { path: "lib/scale/iris.ts", label: "iris ruler" },
            { path: "lib/skin/measure.ts", label: "measureAnalysis" },
          ]}
        >
          The size and contrast were measured by <code className="font-mono text-[0.875rem]">measureAnalysis</code> and are read from the recorded bundle; the outline is{" "}
          <code className="font-mono text-[0.875rem]">outlineOf</code> run now on YouCam&rsquo;s mask; every number in steps 4 and 5 is{" "}
          <code className="font-mono text-[0.875rem]">buildReceipt</code>, the function behind &ldquo;How we know&rdquo; on the results page. See
        </OnWidget>
      }
    >
      <div className="grid gap-8 lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)] lg:gap-14">
        <div className="lg:sticky lg:top-6 lg:self-start">
          <Segmented
            legend="Kind of mark"
            value={concern}
            onChange={pickConcern}
            options={SHOWN.map((c) => ({ value: c, label: concernTitle(c), sub: String(bundle.measurements.features.filter((f) => f.concern === c).length) }))}
          />
          <div className="mt-4">
            <PhotoPicker bundle={bundle} features={features} concern={concern} selected={target ?? null} onChoose={choose} />
          </div>
          <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
            <p data-testid="follow-caption" className="text-[0.875rem] leading-snug text-ink-soft" aria-live="polite">
              {target ? (
                <>
                  {concernName(concern, "singular")} {index} of {features.length}, found {where}.
                </>
              ) : (
                "Nothing found."
              )}
            </p>
            <div className="flex gap-2">
              <button type="button" className="btn btn-ghost btn-sm" onClick={() => choose(stepFeature(features, target ?? null, -1))}>
                Previous
              </button>
              <button type="button" className="btn btn-ghost btn-sm" onClick={() => choose(stepFeature(features, target ?? null, 1))}>
                Next
              </button>
            </div>
          </div>
        </div>

        <div>
          <RangeField
            label="Seen from"
            value={step}
            min={0}
            max={DIST.steps}
            step={1}
            onChange={setStep}
            display={formatDistance(distance)}
            valueText={`${distance.toFixed(2)} metres`}
            ticks={[0.25, 1, 4, 10].map((d) => ({ at: Math.log(d / D_MIN) / Math.log(D_MAX / D_MIN), text: d < 1 ? `${d * 100} cm` : `${d} m` }))}
          />
          {target && receipt && sentences ? (
            <ol className="mt-6">
              <Step n="01" sentence={sentences.found}>
                <MaskCrop outline={outline} target={target} src={bundle.image} frame={bundle.frame} title={concernTitle(concern)} />
                {sentences.foundNote && <p className="mt-3 text-[0.875rem] leading-relaxed text-ink-soft">{sentences.foundNote}</p>}
                <p className="mt-3 text-[0.875rem] leading-relaxed text-ink-soft">
                  The outline is <code className="font-mono text-[0.875rem]">outlineOf</code> traced round the mark in YouCam&rsquo;s own mask (the recorded <code className="font-mono text-[0.875rem]">hd_{concern === "pore" || concern === "wrinkle" || concern === "acne" ? `${concern}_whole` : concern}.png</code>).
                </p>
              </Step>
              <Step n="02" sentence={sentences.size}>
                <SizeRuler receipt={receipt} target={target} bundle={bundle} sourceLabel={sentences.sizeSource} />
              </Step>
              <Step n="03" sentence={sentences.contrast}>
                <Reading value={fmtPct(receipt.contrastPct)} unit="%" caption={receipt.basis === "counterfactual" ? "against the same face without it" : "against the surrounding skin"} />
                <p className="mt-3 text-[0.875rem] leading-relaxed text-ink-soft">
                  Weber contrast in linear light, <span className="num">(Y<sub>mark</sub> − Y<sub>skin</sub>) / Y<sub>skin</sub></span>, after the sRGB decoding <Cite k="srgb" />
                  {receipt.driver === "colour" ? "; this mark is judged on its red-green contrast, which moves the verdict more than its brightness does" : ""}.
                </p>
              </Step>
              <Step n="04" sentence={sentences.angle}>
                <Reading value={fmtArcmin(receipt.angleArcmin)} unit="arcmin" caption={`at ${formatDistance(distance)}`} />
                {curve && <ThresholdChart curve={curve} has={receipt.contrastPct} distance={distance} typicalM={receipt.typicalM} boundM={receipt.boundM} />}
              </Step>
              <Step n="05" sentence={sentences.verdict}>
                <dl className="grid grid-cols-[1fr_auto] gap-x-6 gap-y-1.5 text-[0.9375rem]">
                  <dt className="text-ink-soft">A typical sharp-eyed person looking right at it</dt>
                  <dd className="num text-right">{receipt.typicalVisible ? "can" : "cannot"} pick it out here</dd>
                  <dt className="text-ink-soft">Even perfect eyes</dt>
                  <dd className="num text-right">{receipt.visible ? "can" : "cannot"} pick it out here</dd>
                  <dt className="border-t border-rule pt-1.5 text-ink-soft">Its reach: typical, then perfect eyes</dt>
                  <dd className="num border-t border-rule pt-1.5 text-right">
                    {formatDistance(receipt.typicalM)}, {formatDistance(receipt.boundM)}
                  </dd>
                </dl>
                <p className="mt-3 text-[0.875rem] leading-relaxed text-ink-soft">{sentences.model}</p>
              </Step>
            </ol>
          ) : (
            <p className="mt-6">This mark has no usable size or contrast.</p>
          )}
        </div>
      </div>
    </Plate>
  );
}

/** A mark worth starting from, so the verdict changes within the slider's range (lib/science/defaults.ts). */
function defaultFor(bundle: ReadingBundle, concern: ConcernId): string {
  const chosen = DEFAULT_MARK[concern];
  if (chosen && bundle.measurements.features.some((f) => f.id === chosen)) return chosen;
  const top = bundle.report.concerns.find((c) => c.concern === concern)?.topTargets ?? [];
  return top[Math.min(4, top.length - 1)] ?? bundle.measurements.features.find((f) => f.concern === concern)?.id ?? "";
}

function Step({ n, sentence, children }: { n: string; sentence: string; children: ReactNode }) {
  return (
    <li className="grid grid-cols-[2.25rem_minmax(0,1fr)] gap-x-3 border-t border-ink py-6 first:border-t-0 first:pt-0">
      <span className="num pt-1 font-mono text-[0.875rem] text-ink-soft">{n}</span>
      <div>
        <p className="serif text-[1.25rem] leading-snug" style={{ fontWeight: 400 }}>
          {sentence}
        </p>
        <div className="mt-4">{children}</div>
      </div>
    </li>
  );
}

/** The photo with every mark of the chosen kind; click one, or use the arrow keys to walk to the next. */
function PhotoPicker({
  bundle,
  features,
  concern,
  selected,
  onChoose,
}: {
  bundle: ReadingBundle;
  features: Feature[];
  concern: ConcernId;
  selected: Feature | null;
  onChoose: (f: Feature | null) => void;
}) {
  const box = useRef<HTMLDivElement>(null);
  const width = useElementWidth(box);
  const { width: fw, height: fh } = bundle.frame;
  const k = width / fw;
  const height = width * (fh / fw);
  const isLine = CONCERNS[concern].shape === "line";

  const click = (e: ReactPointerEvent<SVGSVGElement>) => {
    const r = e.currentTarget.getBoundingClientRect();
    const p: Point = { x: ((e.clientX - r.left) / r.width) * fw, y: ((e.clientY - r.top) / r.height) * fh };
    onChoose(nearestFeature(features, p, HIT_PX / k));
  };

  const key = (e: KeyboardEvent<HTMLDivElement>) => {
    const dirs: Record<string, Direction> = { ArrowLeft: "left", ArrowRight: "right", ArrowUp: "up", ArrowDown: "down" };
    if (dirs[e.key] && selected) {
      e.preventDefault();
      onChoose(neighbourInDirection(features, selected, dirs[e.key]) ?? selected);
    } else if (e.key === "PageDown" || e.key === "PageUp") {
      e.preventDefault();
      onChoose(stepFeature(features, selected, e.key === "PageDown" ? 1 : -1));
    }
  };

  return (
    <div
      ref={box}
      className="stage on-stage relative w-full overflow-hidden"
      style={{ aspectRatio: `${fw} / ${fh}` }}
      tabIndex={0}
      role="group"
      aria-label={`The photo with ${features.length} ${concernName(concern, "plural")} marked. Arrow keys move to the next mark, Page Up and Page Down step through all of them.`}
      onKeyDown={key}
    >
      <Image src={bundle.image} alt={bundle.alt} width={fw} height={fh} unoptimized loading="eager" sizes="(min-width: 1024px) 40vw, 90vw" className="absolute inset-0 h-full w-full select-none" draggable={false} />
      {width > 0 && (
        <svg width={width} height={height} className="absolute inset-0 cursor-crosshair" aria-hidden="true" onPointerDown={click}>
          {features.map((f) => {
            const sel = selected?.id === f.id;
            if (sel) return null;
            const cx = f.centroid.x * k;
            const cy = f.centroid.y * k;
            if (isLine) {
              const w = Math.max(5, f.bbox.w * k);
              const h = Math.max(5, f.bbox.h * k);
              return (
                <rect key={f.id} x={f.bbox.x * k + (f.bbox.w * k - w) / 2} y={f.bbox.y * k + (f.bbox.h * k - h) / 2} width={w} height={h} fill="none" stroke="#161513" strokeOpacity="0.5" strokeWidth="2.5" />
              );
            }
            return (
              <g key={f.id}>
                <circle cx={cx} cy={cy} r="4.5" fill="none" stroke="#161513" strokeOpacity="0.55" strokeWidth="3" />
                <circle cx={cx} cy={cy} r="4.5" fill="none" stroke={PAPER} strokeWidth="1.5" />
              </g>
            );
          })}
          {selected && (
            <g>
              <circle cx={selected.centroid.x * k} cy={selected.centroid.y * k} r="15" fill="none" stroke="#161513" strokeOpacity="0.6" strokeWidth="5" />
              <circle cx={selected.centroid.x * k} cy={selected.centroid.y * k} r="15" fill="none" stroke={PAPER} strokeWidth="2.5" />
              <circle cx={selected.centroid.x * k} cy={selected.centroid.y * k} r="3" fill={PAPER} stroke="#161513" strokeWidth="1.5" />
            </g>
          )}
        </svg>
      )}
    </div>
  );
}

/** Step 1: the close-up of what YouCam found, with the outline `outlineOf` traced on its mask. */
function MaskCrop({ outline, target, src, frame, title }: { outline: Point[] | null; target: Feature; src: string; frame: { width: number; height: number }; title: string }) {
  const pts = outline ?? [];
  const box = pts.length
    ? { x: Math.min(...pts.map((p) => p.x)), y: Math.min(...pts.map((p) => p.y)), w: Math.max(...pts.map((p) => p.x)) - Math.min(...pts.map((p) => p.x)), h: Math.max(...pts.map((p) => p.y)) - Math.min(...pts.map((p) => p.y)) }
    : target.bbox;
  const crop = cropAround(box, frame, 1.1, 4 / 3, 190);
  const d = pts.length ? pts.map((p, i) => `${i === 0 ? "M" : "L"}${p.x.toFixed(1)} ${p.y.toFixed(1)}`).join(" ") + " Z" : "";
  const where = locationInPhoto(box, frame);
  return (
    <figure>
      <div className="stage on-stage relative max-w-[30rem] overflow-hidden" style={{ aspectRatio: `${crop.w} / ${crop.h}` }}>
        <Image
          src={src}
          alt={`A close-up of the photo around the mark YouCam found, ${where}. A light outline traces it.`}
          width={frame.width}
          height={frame.height}
          sizes="480px"
          unoptimized
          className="absolute max-w-none"
          style={{ width: `${(frame.width / crop.w) * 100}%`, left: `${(-crop.x / crop.w) * 100}%`, top: `${(-crop.y / crop.h) * 100}%`, height: "auto" }}
        />
        <svg aria-hidden="true" viewBox={`${crop.x} ${crop.y} ${crop.w} ${crop.h}`} preserveAspectRatio="none" className="absolute inset-0 h-full w-full">
          {d && (
            <>
              <path d={d} fill="none" stroke="#161513" strokeOpacity="0.55" strokeWidth="5" strokeLinejoin="round" vectorEffect="non-scaling-stroke" />
              <path d={d} fill="none" stroke={PAPER} strokeWidth="2" strokeLinejoin="round" vectorEffect="non-scaling-stroke" />
            </>
          )}
        </svg>
      </div>
      <figcaption className="mt-2 text-[0.875rem] leading-snug text-ink-soft">
        {title}: found {where}.
      </figcaption>
    </figure>
  );
}

/** Step 2: pixels to millimetres. The iris is the ruler: its width in pixels gives the millimetres per pixel. */
function SizeRuler({ receipt, target, bundle, sourceLabel }: { receipt: ReceiptNumbers; target: Feature; bundle: ReadingBundle; sourceLabel: string }) {
  const { mmPerPx, irisPx } = bundle.scale;
  const sizeMm = receipt.sizeMm;
  const domain = Math.max(IRIS_DIAMETER_MM, sizeMm) * 1.04;
  const w = (v: number) => `${(v / domain) * 100}%`;
  const sizePx = sizeMm / mmPerPx;
  const measured = receipt.sizeSource !== "prior";
  return (
    <div>
      <Reading value={fmtMm(sizeMm)} unit="mm" caption={sourceLabel} />
      <div className="mt-5 space-y-3" role="img" aria-label={`The mark is ${fmtMm(sizeMm)} millimetres; the iris used as the ruler is ${IRIS_DIAMETER_MM} millimetres.`}>
        <div>
          <div className="flex justify-between gap-4 text-[0.875rem] text-ink-soft">
            <span>Iris, the ruler</span>
            <span className="num">{IRIS_DIAMETER_MM} mm</span>
          </div>
          <div className="mt-1.5 h-2.5 border border-ink" style={{ width: w(IRIS_DIAMETER_MM) }} />
        </div>
        <div>
          <div className="flex justify-between gap-4 text-[0.875rem] text-ink-soft">
            <span>{receipt.kind === "line" ? "This line, across" : "This mark"}</span>
            <span className="num">{fmtMm(sizeMm)} mm</span>
          </div>
          <div className="mt-1.5 h-2.5 border border-ink bg-ink forced-colors:bg-[CanvasText]" style={{ width: `max(4px, ${w(sizeMm)})` }} />
        </div>
      </div>
      <p className="num mt-4 text-[0.875rem] leading-relaxed text-ink-soft">
        iris {irisPx?.toFixed(1)} px = {IRIS_DIAMETER_MM} mm <Cite k="ruefer2005" />, so {mmPerPx.toFixed(4)} mm per pixel (±{(bundle.scale.relSd * 100).toFixed(1)}%).{" "}
        {measured ? `The mark spans ${sizePx.toFixed(1)} px: ${sizePx.toFixed(1)} × ${mmPerPx.toFixed(4)} = ${fmtMm(sizeMm)} mm.` : `Its size is an assumption (${fmtMm(sizeMm)} mm, about ${sizePx.toFixed(1)} px), not a measurement.`}
      </p>
      {target.concern === "pore" && !measured && (
        <p className="mt-2 text-[0.875rem] leading-relaxed text-ink-soft">
          Pores are counted from 0.25 mm upward <Cite k="flament2015" />; YouCam marks where one is, so the size falls back to a stated prior.
        </p>
      )}
    </div>
  );
}

const M = { l: 62, r: 14, t: 12, b: 44 };

/** Step 4: the contrast each observer needs at every distance, against the contrast the mark has. */
function ThresholdChart({ curve, has, distance, typicalM, boundM }: { curve: { d: number; typical: number; perfect: number }[]; has: number; distance: number; typicalM: number; boundM: number }) {
  const box = useRef<HTMLDivElement>(null);
  const width = useElementWidth(box);
  const height = 250;
  const pw = Math.max(0, width - M.l - M.r);
  const ph = height - M.t - M.b;
  const Y_MIN = 0.2;
  const Y_MAX = 100;
  const x = (d: number) => M.l + (Math.log(d / D_MIN) / Math.log(D_MAX / D_MIN)) * pw;
  const y = (c: number) => M.t + ph - (Math.log(Math.min(Y_MAX, Math.max(Y_MIN, c)) / Y_MIN) / Math.log(Y_MAX / Y_MIN)) * ph;
  const path = (key: "typical" | "perfect") => curve.map((p, i) => `${i ? "L" : "M"}${x(p.d).toFixed(1)} ${y(p[key]).toFixed(1)}`).join(" ");
  const hereTypical = interp(curve, distance, "typical");
  const herePerfect = interp(curve, distance, "perfect");

  return (
    <figure className="mt-5">
      <div ref={box} className="w-full" style={{ height }}>
        {width > 0 && (
          <svg
            width={width}
            height={height}
            role="img"
            aria-label={`Contrast needed against distance. The mark has ${fmtPct(has)} percent. A typical sharp-eyed person needs less than that out to ${formatDistance(typicalM)}, and even perfect eyes out to ${formatDistance(boundM)}.`}
            style={{ fontFamily: SVG_FONT }}
          >
            {[0.3, 1, 3, 10, 30, 100].map((c) => (
              <g key={c}>
                <line x1={M.l} x2={M.l + pw} y1={y(c)} y2={y(c)} stroke={RULE} strokeWidth="1" />
                <text x={M.l - 8} y={y(c) + 4} textAnchor="end" fontSize="13" fill={MUTED} className="num">
                  {c}%
                </text>
              </g>
            ))}
            {[0.25, 0.5, 1, 2, 4, 10].map((d) => (
              <g key={d}>
                <line x1={x(d)} x2={x(d)} y1={M.t + ph} y2={M.t + ph + 6} stroke={INK} strokeWidth="1" />
                <text x={x(d)} y={M.t + ph + 22} textAnchor="middle" fontSize="13" fill={MUTED} className="num">
                  {d < 1 ? `${d * 100} cm` : `${d} m`}
                </text>
              </g>
            ))}
            <line x1={M.l} x2={M.l + pw} y1={M.t + ph} y2={M.t + ph} stroke={INK} strokeWidth="1" />
            <text x={M.l + pw / 2} y={height - 6} textAnchor="middle" fontSize="13" fill={INK} letterSpacing="0.4">
              DISTANCE
            </text>
            <text transform={`translate(12 ${M.t + ph / 2}) rotate(-90)`} textAnchor="middle" fontSize="13" fill={INK} letterSpacing="0.4">
              CONTRAST NEEDED
            </text>
            <path d={path("perfect")} fill="none" stroke={INK} strokeWidth="1.75" strokeDasharray="7 4" />
            <path d={path("typical")} fill="none" stroke={INK} strokeWidth="2.25" />
            {/* what the mark has */}
            <line x1={M.l} x2={M.l + pw} y1={y(has)} y2={y(has)} stroke={INK} strokeWidth="1" strokeDasharray="1 3" strokeLinecap="round" />
            <text x={M.l + 8} y={y(has) - 7} fontSize="13" fill={INK} stroke={PAPER} strokeWidth="4" paintOrder="stroke" className="num">
              the mark has {fmtPct(has)}%
            </text>
            <text x={x(10) - 6} y={y(curve[curve.length - 1].typical) - 8} textAnchor="end" fontSize="13" fill={INK} stroke={PAPER} strokeWidth="4" paintOrder="stroke" style={{ fontWeight: 500 }}>
              typical
            </text>
            <text x={x(10) - 6} y={y(curve[curve.length - 1].perfect) + 18} textAnchor="end" fontSize="13" fill={INK} stroke={PAPER} strokeWidth="4" paintOrder="stroke" style={{ fontWeight: 500 }}>
              perfect eyes
            </text>
            <line x1={x(distance)} x2={x(distance)} y1={M.t} y2={M.t + ph} stroke={INK} strokeWidth="1.5" />
            <circle cx={x(distance)} cy={y(herePerfect)} r="5.5" fill={PAPER} stroke={INK} strokeWidth="2.5" />
            <circle cx={x(distance)} cy={y(hereTypical)} r="5" fill={INK} stroke={PAPER} strokeWidth="2" />
          </svg>
        )}
      </div>
      <figcaption className="mt-1 text-[0.875rem] leading-snug text-ink-soft">The mark is picked out wherever a curve is below its dotted line.</figcaption>
    </figure>
  );
}

function interp(curve: { d: number; typical: number; perfect: number }[], d: number, key: "typical" | "perfect"): number {
  const idx = curve.findIndex((p) => p.d > d);
  const i = idx < 0 ? curve.length - 2 : Math.max(0, idx - 1);
  const a = curve[i];
  const b = curve[i + 1];
  const t = (Math.log(d) - Math.log(a.d)) / (Math.log(b.d) - Math.log(a.d));
  return Math.exp(Math.log(a[key]) * (1 - t) + Math.log(b[key]) * t);
}
