/**
 * Mock "How we know" receipts. For each concern the chain is: mask outline -> size in mm (iris ruler) ->
 * contrast against the surround -> visual angle -> contrast needed at that angle -> verdict.
 * The threshold here is built to agree with the mock VisibilityReport (it equals the measured contrast exactly at
 * the concern's farthest distance and rises as the angle shrinks); the real one comes from the vision model.
 */
import type { ConcernId, Measurements, Point, VisibilityReport } from "@/lib/contracts";
import type { MaskStrip, ReceiptCopy, ReceiptEntry } from "@/components/results/types";
import { formatDistance } from "@/app/_lib/axis";
import { mockTitle } from "./copy";

const ARCMIN_PER_RAD = (180 * 60) / Math.PI;

const fmtMm = (mm: number) => (mm < 1 ? mm.toFixed(2) : mm < 10 ? mm.toFixed(1) : String(Math.round(mm)));
const fmtPct = (p: number) => (p < 10 ? p.toFixed(1) : String(Math.round(p)));

function ring(cx: number, cy: number, rx: number, ry: number, n = 28): Point[] {
  return Array.from({ length: n }, (_, i) => {
    const a = (i / n) * Math.PI * 2;
    return { x: cx + Math.cos(a) * rx, y: cy + Math.sin(a) * ry };
  });
}

export function mockReceipts(measurements: Measurements, report: VisibilityReport, distanceM = 1): ReceiptEntry[] {
  const out: ReceiptEntry[] = [];
  for (const c of report.concerns) {
    const id = c.topTargets[0];
    const feature = measurements.features.find((f) => f.id === id);
    const region = measurements.regions.find((r) => r.id === id);
    const target = feature ?? region;
    if (!target) continue;

    const bbox = target.bbox;
    const cx = bbox.x + bbox.w / 2;
    const cy = bbox.y + bbox.h / 2;
    const maskOutline =
      feature?.shape === "line"
        ? [
            { x: bbox.x, y: bbox.y },
            { x: bbox.x + bbox.w, y: bbox.y },
            { x: bbox.x + bbox.w, y: bbox.y + bbox.h },
            { x: bbox.x, y: bbox.y + bbox.h },
          ]
        : region
          ? ring(cx, cy, bbox.w / 2, bbox.h / 2)
          : ring(cx, cy, Math.max(bbox.w, bbox.h) / 2 + 7, Math.max(bbox.w, bbox.h) / 2 + 7, 18);

    const sizeMm = feature
      ? feature.shape === "line"
        ? (feature.widthMm ?? 0.35)
        : (feature.diameterMm ?? 1)
      : (region?.widthMm ?? 10);
    const contrast = target.contrast;
    const chromatic = Math.abs(contrast.rg) > Math.abs(contrast.lum);
    const contrastPct = Math.max(1, Math.round(Math.abs(chromatic ? contrast.rg : contrast.lum) * 100));
    const angleArcmin = (sizeMm / (distanceM * 1000)) * ARCMIN_PER_RAD;
    const thresholdPct = Math.round(contrastPct * Math.pow(distanceM / c.maxDistanceM, 1.5) * 10) / 10;
    const visible = distanceM <= c.maxDistanceM;
    const direction = chromatic ? "redder" : contrast.lum < 0 ? "darker" : "lighter";
    const unit = feature?.shape === "line" ? "wide, as a line" : "wide";

    const copy: ReceiptCopy = {
      found: "YouCam found it here.",
      size: `It's ${fmtMm(sizeMm)} mm ${unit}.`,
      contrast: `It's ${contrastPct}% ${direction} than the skin around it.`,
      angle: `At ${formatDistance(distanceM)} it covers ${angleArcmin.toFixed(1)} arcmin. At that size people need about ${fmtPct(thresholdPct)}% contrast to see it.`,
      verdict: visible ? `It has ${contrastPct}%, so it's visible.` : `It has ${contrastPct}%, so it's not visible.`,
      model: "Step 4 comes from a published model of human vision (contrast sensitivity and band contrast), not from a guess.",
    };

    out.push({
      receipt: { concern: c.concern, targetId: id, maskOutline, sizeMm, contrastPct, angleArcmin, thresholdPct, distanceM },
      copy,
    });
  }
  return out;
}

const MASK_FILES: ConcernId[] = ["acne", "age_spot", "pore", "wrinkle", "dark_circle", "eye_bag", "redness", "texture"];

/** The YouCam masks composited on the photo (generated from fixtures/youcam by the persona prep). */
export function mockMaskStrip(personaId: "p2b" | "p3a", skipped: Measurements["skipped"]): MaskStrip {
  return {
    title: "What YouCam detected",
    note: "The raw masks from YouCam HD Skin Analysis, laid over the photo. Everything below is measured from these.",
    items: MASK_FILES.map((concern) => {
      const skip = skipped.find((s) => s.concern === concern);
      return {
        concern,
        label: mockTitle(concern),
        image: `/demo/${personaId}/masks/${concern}.jpg`,
        note: skip?.reason,
      };
    }),
  };
}
