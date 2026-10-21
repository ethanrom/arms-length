import type { ReactNode } from "react";
import summary from "@/eval/llm-baseline/results/summary.json";
import { loadBundle } from "@/lib/integration/demo";
import { CropView, framePct, type CropBox } from "./CropView";

// The crops are tuned by eye to the recorded frames: a cheek of p1a for the masks, an eye and a cheek of p2b for the ruler.
const MASK_CROP: CropBox = { x: 90, y: 820, w: 480, h: 360 };
const IRIS_CROP: CropBox = { x: 226, y: 490, w: 240, h: 180 };
const SPOT_CROP: CropBox = { x: 690, y: 600, w: 240, h: 180 };

function Card({ n, title, visual, body, href, link }: { n: string; title: string; visual: ReactNode; body: string; href: string; link: string }) {
  return (
    <li className="flex border border-rule bg-paper sm:flex-col">
      {/* On a phone the picture sits beside the words, so all five cards fit in about two screens. */}
      <div className="w-[8.5rem] shrink-0 border-r border-rule bg-paper-deep sm:w-auto sm:border-b sm:border-r-0">{visual}</div>
      <div className="flex min-w-0 flex-1 flex-col p-4 sm:p-5">
        <span className="num font-mono text-[0.875rem] text-muted">{n}</span>
        <h3 className="title mt-1 text-[1.25rem] sm:mt-2 sm:text-[1.375rem]">{title}</h3>
        <p className="mt-2 text-[0.9375rem] leading-relaxed text-ink-soft">{body}</p>
        <a href={href} className="link mt-auto inline-flex min-h-11 items-end self-start pt-2 text-[0.9375rem] font-medium sm:pt-4">
          {link}
        </a>
      </div>
    </li>
  );
}

/** The whole method in five cards, before any long text. Each visual is drawn from the recorded demo data. */
export function SummaryCards() {
  const mask = loadBundle("p1a");
  const eye = loadBundle("p2b");
  if (!mask || !eye) return null;

  // Three clear dark spots of a few millimetres that sit well apart, so the rings and labels do not pile up.
  const inCrop = eye.measurements.features
    .filter((f) => f.concern === "age_spot" && (f.diameterMm ?? 0) >= 2.5 && (f.diameterMm ?? 0) <= 4 && f.contrast.lum < -0.15 && f.centroid.x > SPOT_CROP.x + 20 && f.centroid.x < SPOT_CROP.x + SPOT_CROP.w - 20 && f.centroid.y > SPOT_CROP.y + 20 && f.centroid.y < SPOT_CROP.y + SPOT_CROP.h - 40)
    .sort((a, b) => b.areaPx - a.areaPx);
  const spots: typeof inCrop = [];
  for (const f of inCrop) {
    if (spots.length < 3 && spots.every((o) => Math.hypot(o.centroid.x - f.centroid.x, o.centroid.y - f.centroid.y) > 70)) spots.push(f);
  }
  const irisPx = eye.measurements.scale.irisPx ?? 72;
  const iris = { cx: 356, cy: 592, r: irisPx / 2 };

  // Five asks of the same question about one patch (a 4 mm spot, 30% darker), against our model's range for it.
  const patch = summary.testB.patches.find((p) => p.id === "d4mm_c30");
  const asks = patch?.llm.values ?? [];
  const ours = patch ? { from: patch.truth.nominalM, to: patch.truth.boundM } : null;
  const lo = Math.log(5);
  const hi = Math.log(16);
  const at = (m: number) => `${((Math.log(m) - lo) / (hi - lo)) * 100}%`;

  return (
    <ol className="grid gap-5 sm:grid-cols-2 lg:grid-cols-5">
      <Card
        n="01"
        title="YouCam finds it"
        body="HD Skin Analysis marks where every spot, line, pore and shadow is on the photo."
        href="#youcam"
        link="The YouCam APIs we use"
        visual={<CropView src={mask.image} overlay={mask.overlays.acne} frame={mask.frame} crop={MASK_CROP} stageGrey={mask.stageGrey} />}
      />
      <Card
        n="02"
        title="The iris is the ruler"
        body="An iris is about 11.7 mm across, so every pixel gets a size in millimetres."
        href="#iris"
        link="How the scale works"
        visual={
          <CropView src={eye.image} frame={eye.frame} crop={IRIS_CROP} stageGrey={eye.stageGrey}>
            <svg aria-hidden="true" viewBox={`${IRIS_CROP.x} ${IRIS_CROP.y} ${IRIS_CROP.w} ${IRIS_CROP.h}`} className="absolute inset-0 h-full w-full" preserveAspectRatio="none">
              <circle cx={iris.cx} cy={iris.cy} r={iris.r} fill="none" stroke="#161513" strokeOpacity="0.55" strokeWidth="5" vectorEffect="non-scaling-stroke" />
              <circle cx={iris.cx} cy={iris.cy} r={iris.r} fill="none" stroke="#f5f3ef" strokeWidth="2" vectorEffect="non-scaling-stroke" />
              <line x1={iris.cx - iris.r} x2={iris.cx + iris.r} y1={iris.cy + iris.r + 18} y2={iris.cy + iris.r + 18} stroke="#f5f3ef" strokeWidth="2.5" vectorEffect="non-scaling-stroke" />
            </svg>
            <span className="num absolute bottom-1 left-1 border border-ink/15 bg-paper px-1.5 py-1 font-mono text-[0.875rem] leading-none sm:bottom-2 sm:left-2 sm:px-2">11.7 mm</span>
          </CropView>
        }
      />
      <Card
        n="03"
        title="Size and contrast, measured"
        body="Each mark is compared with the skin beside it, in linear light, and given a size and a percentage."
        href="#millimetres"
        link="From masks to millimetres"
        visual={
          <CropView src={eye.image} frame={eye.frame} crop={SPOT_CROP} stageGrey={eye.stageGrey}>
            <svg aria-hidden="true" viewBox={`${SPOT_CROP.x} ${SPOT_CROP.y} ${SPOT_CROP.w} ${SPOT_CROP.h}`} className="absolute inset-0 h-full w-full" preserveAspectRatio="none">
              {spots.map((f) => {
                const r = Math.max(f.bbox.w, f.bbox.h) * 0.6 + 8;
                return (
                  <g key={f.id}>
                    <circle cx={f.centroid.x} cy={f.centroid.y} r={r} fill="none" stroke="#161513" strokeOpacity="0.55" strokeWidth="4.5" vectorEffect="non-scaling-stroke" />
                    <circle cx={f.centroid.x} cy={f.centroid.y} r={r} fill="none" stroke="#f5f3ef" strokeWidth="1.8" vectorEffect="non-scaling-stroke" />
                  </g>
                );
              })}
            </svg>
            {spots.map((f) => (
              <span
                key={f.id}
                className="num absolute -translate-x-1/2 whitespace-nowrap border border-ink/15 bg-paper px-1.5 py-1 font-mono text-[0.875rem] leading-none max-sm:hidden"
                style={framePct(SPOT_CROP, f.centroid.x, f.centroid.y + Math.max(f.bbox.w, f.bbox.h) * 0.6 + 18)}
              >
                {f.diameterMm?.toFixed(1)} mm
              </span>
            ))}
          </CropView>
        }
      />
      <Card
        n="04"
        title="Checked against people"
        body="The vision model lands within 0.69 dB of 16 human observers on 41 test patterns."
        href="#validation"
        link="The ModelFest check"
        visual={
          <div className="grid aspect-[4/3] place-items-center bg-paper-deep px-4 text-center">
            <p>
              <span className="serif num block text-[1.75rem] leading-none tracking-[-0.02em] sm:text-[clamp(3rem,2.4rem+1.6vw,3.75rem)]" style={{ fontWeight: 340 }}>
                0.69 dB
              </span>
              <span className="mt-2 block text-[0.875rem] leading-snug text-muted max-sm:hidden">average error against 16 observers</span>
            </p>
          </div>
        }
      />
      <Card
        n="05"
        title="Not just asking an AI"
        body="Asked the same question five times, a frontier AI gave five answers, and missed breakouts that YouCam found."
        href="#ai"
        link="The comparison"
        visual={
          <figure className="grid aspect-[4/3] content-center gap-3 bg-paper-deep px-3 sm:px-5">
            <div role="img" aria-label={`Five answers from an AI to one question, ${asks.join(", ")} metres, against our one range of ${ours ? `${ours.from.toFixed(0)} to ${ours.to.toFixed(0)}` : ""} metres.`} className="relative h-14">
              <div className="absolute inset-x-0 top-1/2 h-px bg-rule-strong" />
              {ours && <div className="absolute top-1/2 h-2.5 -translate-y-1/2 bg-ink" style={{ left: at(ours.from), width: `calc(${at(ours.to)} - ${at(ours.from)})` }} />}
              {asks.map((v, i) => (
                <span
                  key={i}
                  className="absolute top-1/2 h-4 w-4 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-paper-deep bg-muted"
                  style={{ left: at(v), marginTop: `${(i % 3) * 9 - 9}px` }}
                />
              ))}
            </div>
            <div aria-hidden="true" className="relative -mt-1 h-5 text-[0.875rem] leading-none text-muted">
              {[5, 8, 16].map((m) => (
                <span key={m} className={`num absolute whitespace-nowrap ${m === 16 ? "-translate-x-full" : "-translate-x-1/2"}`} style={{ left: at(m) }}>
                  {m} m
                </span>
              ))}
            </div>
            <figcaption className="text-[0.875rem] leading-snug text-muted max-sm:hidden">Dots: five asks. Bar: our model, the same every time.</figcaption>
          </figure>
        }
      />
    </ol>
  );
}
