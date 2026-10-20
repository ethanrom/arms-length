/**
 * Typed mock data for the three demo personas: a plausible VisibilityReport, Measurements, coverage plans and
 * what-if for each, with ILLUSTRATIVE numbers. Feature positions follow the recorded masks in
 * fixtures/youcam so overlays land on real marks; the distances are not from the vision model.
 * Integration replaces `getMockResults` with the recorded persona bundles and lib/copy sentences.
 */
import type {
  ConcernId,
  ConcernResult,
  CoveragePlan,
  CoverageStep,
  Feature,
  Measurements,
  RegionMeasure,
  RenderResult,
  ScaleEstimate,
  SimulationStrengths,
  WhatIf,
} from "@/lib/contracts";
import type { CoverageOption, ResultsData, ShareData } from "@/components/results/types";
import { formatDistance } from "@/app/_lib/axis";
import { MOCK_ANCHORS } from "./anchors";
import { buildReport, line, patch, spot, type ConcernSummary } from "./build";
import { mockMaskStrip, mockReceipts } from "./receipts";
import { MOCK_OUT_OF_SCOPE, mockConcernCopy, mockNoun, mockShareLine, mockTitle } from "./copy";

const RELIEF_WITHIN_M = 1;

interface PersonaSpec {
  id: string;
  label: string;
  description: string;
  image: string;
  alt: string;
  stageGrey: string;
  frame: { width: number; height: number };
  scale: ScaleEstimate;
  features: Feature[];
  regions: RegionMeasure[];
  skipped: Measurements["skipped"];
  summaries: Partial<Record<ConcernId, ConcernSummary>>;
  confidenceReasons: Partial<Record<ConcernId, string>>;
  scores: Partial<Record<ConcernId, [number, number]>>;
  extraOutOfScope?: { label: string; reason: string }[];
  coverage: {
    concern: ConcernId;
    category: "foundation" | "concealer";
    field: string;
    afterImage: string;
    /** [targetM, status, lever value (null = none needed / none works), distance after at that lever]. */
    targets: [number, CoveragePlan["status"], number | null, number][];
  };
  whatIf: { concern: ConcernId; strengths: SimulationStrengths; afterImage: string; afterM: number; strengthWord: string };
}

const render = (imageRef: string, w: number, h: number): RenderResult => ({
  imageRef,
  width: w,
  height: h,
  offset: { dx: 0, dy: 0 },
  unitsCharged: 0,
  source: "preview",
});

/* ------------------------------------------------------------------ p2b */

const P2B_SCALE: ScaleEstimate = { mmPerPx: 0.138, relSd: 0.04, source: "iris", irisPx: 85 };

const p2b: PersonaSpec = {
  id: "p2b",
  label: "Synthetic face A",
  description: "Deep brown skin, about 42. Scattered dark spots on the cheeks, soft shadows under the eyes.",
  image: "/demo/p2b/input.jpg",
  alt: "Synthetic portrait of a man in his forties with deep brown skin, looking straight at the camera.",
  stageGrey: "#787878",
  frame: { width: 1080, height: 1341 },
  scale: P2B_SCALE,
  features: [
    spot(P2B_SCALE, "age_spot", 0, 800, 727, 1.7, -0.36),
    spot(P2B_SCALE, "age_spot", 1, 784, 739, 1.5, -0.34),
    spot(P2B_SCALE, "age_spot", 2, 845, 684, 1.3, -0.3),
    spot(P2B_SCALE, "age_spot", 3, 825, 762, 1.2, -0.28),
    spot(P2B_SCALE, "age_spot", 4, 211, 765, 1.1, -0.26),
    spot(P2B_SCALE, "age_spot", 5, 808, 654, 1.0, -0.22),
    spot(P2B_SCALE, "age_spot", 6, 807, 756, 0.8, -0.2),
    spot(P2B_SCALE, "acne", 0, 547, 435, 3.4, -0.1, 0.05, "whole", "mask"),
    spot(P2B_SCALE, "acne", 1, 483, 394, 2.6, -0.09, 0.05, "whole", "mask"),
    spot(P2B_SCALE, "acne", 2, 467, 375, 2.4, -0.08, 0.04, "whole", "prior"),
    spot(P2B_SCALE, "acne", 3, 536, 384, 2.4, -0.08, 0.04, "whole", "prior"),
    spot(P2B_SCALE, "acne", 4, 562, 407, 2.4, -0.07, 0.04, "whole", "prior"),
    spot(P2B_SCALE, "acne", 5, 579, 427, 2.4, -0.07, 0.03, "whole", "prior"),
    ...[
      [500, 760], [545, 790], [590, 775], [470, 720], [610, 700], [300, 880], [250, 830], [330, 780],
      [780, 880], [840, 840], [720, 800], [420, 300], [520, 262], [640, 330], [700, 290],
    ].map(([x, y], i) => spot(P2B_SCALE, "pore", i, x, y, i === 0 ? 0.6 : 0.16 - (i % 4) * 0.02, i === 0 ? -0.18 : -0.07, 0, i < 5 ? "nose" : i < 11 ? "cheek" : "forehead", "prior")),
    line(P2B_SCALE, "wrinkle", 0, { x: 340, y: 330, w: 420, h: 26 }, -0.12, "forehead"),
    line(P2B_SCALE, "wrinkle", 1, { x: 380, y: 392, w: 330, h: 24 }, -0.1, "forehead"),
    line(P2B_SCALE, "wrinkle", 2, { x: 200, y: 580, w: 80, h: 60 }, -0.09, "crowfeet"),
    line(P2B_SCALE, "wrinkle", 3, { x: 800, y: 580, w: 80, h: 60 }, -0.09, "crowfeet"),
  ],
  regions: [
    patch(P2B_SCALE, "dark_circle", 0, { x: 240, y: 622, w: 230, h: 86 }, -0.2, 0, "cheek_band"),
    patch(P2B_SCALE, "dark_circle", 1, { x: 610, y: 622, w: 240, h: 86 }, -0.19, 0, "cheek_band"),
    patch(P2B_SCALE, "eye_bag", 0, { x: 248, y: 668, w: 190, h: 70 }, -0.09, 0, "cheek_band"),
    patch(P2B_SCALE, "eye_bag", 1, { x: 652, y: 670, w: 174, h: 70 }, -0.08, 0, "cheek_band"),
  ],
  skipped: [
    { concern: "redness", reason: "No redness found in this photo" },
    { concern: "texture", reason: "Not a visible mark" },
  ],
  summaries: {
    pore: { maxM: 5.6, medianM: 0, relHalfWidth: 0.25, confidence: "low", population: 656, survival: [0.9, 0.85, 0.62, 0.45, 0.2, 0.08, 0.015, 0.004] },
    wrinkle: { maxM: 2.0, medianM: 0, relHalfWidth: 0.12, confidence: "medium", population: 84, survival: [0.8, 0.7, 0.35, 0.15, 0.05, 0, 0, 0] },
    acne: { maxM: 3.0, medianM: 0, relHalfWidth: 0.14, confidence: "medium", population: 15, survival: [0.9, 0.8, 0.5, 0.3, 0.15, 0.04, 0, 0] },
    eye_bag: { maxM: 1.2, medianM: 1.1, relHalfWidth: 0.1, confidence: "medium" },
    age_spot: { maxM: 3.2, medianM: 0, relHalfWidth: 0.08, confidence: "high", population: 38, survival: [1, 1, 1, 0.9, 0.6, 0.15, 0, 0] },
    dark_circle: { maxM: 3.1, medianM: 2.8, relHalfWidth: 0.1, confidence: "high" },
  },
  confidenceReasons: {
    pore: "YouCam marks where pores are, not how big they are, so we assume a typical size.",
    wrinkle: "Lines are thin, so a small error in width moves the distance.",
    acne: "Some marks have a measured size, others use a typical one.",
    eye_bag: "A soft change in shading, measured against the cheek next to it.",
    age_spot: "Sizes come from the outlines YouCam drew.",
    dark_circle: "Large areas measure well.",
  },
  scores: {
    eye_bag: [52, 69], dark_circle: [61, 69], age_spot: [73, 71], acne: [75, 85], pore: [47, 66], wrinkle: [60, 72],
  },
  extraOutOfScope: [{ label: "Redness", reason: "YouCam found nothing to measure in this photo." }],
  coverage: {
    concern: "age_spot",
    category: "foundation",
    field: "coverageIntensity",
    afterImage: "/demo/p2b/foundation-preview.jpg",
    targets: [
      [0.5, "not_met", null, 0.8],
      [1, "met", 60, 0.95],
      [1.5, "met", 30, 1.45],
    ],
  },
  whatIf: {
    concern: "age_spot",
    strengths: { spots: 0.5 },
    afterImage: "/demo/p2b/foundation-preview.jpg",
    afterM: 1.2,
    strengthWord: "spots",
  },
};

/* ------------------------------------------------------------------ p3a */

const P3A_SCALE: ScaleEstimate = { mmPerPx: 0.156, relSd: 0.04, source: "iris", irisPx: 75 };

const p3a: PersonaSpec = {
  id: "p3a",
  label: "Synthetic face B",
  description: "Fair skin, about 55. Freckled spots, rosy cheeks, fine lines around the eyes.",
  image: "/demo/p3a/input.jpg",
  alt: "Synthetic portrait of a woman in her fifties with fair, freckled skin, looking straight at the camera.",
  stageGrey: "#828282",
  frame: { width: 1080, height: 1575 },
  scale: P3A_SCALE,
  features: [
    spot(P3A_SCALE, "age_spot", 0, 755, 770, 5.0, -0.2),
    spot(P3A_SCALE, "age_spot", 1, 838, 730, 4.0, -0.18),
    spot(P3A_SCALE, "age_spot", 2, 327, 399, 3.0, -0.16),
    spot(P3A_SCALE, "age_spot", 3, 727, 385, 3.0, -0.15),
    spot(P3A_SCALE, "age_spot", 4, 243, 718, 2.2, -0.14),
    spot(P3A_SCALE, "age_spot", 5, 279, 799, 1.5, -0.12),
    spot(P3A_SCALE, "age_spot", 6, 574, 709, 1.3, -0.1),
    ...[
      [530, 820], [575, 850], [490, 790], [610, 790], [330, 900], [290, 860], [760, 900], [810, 860], [440, 330], [560, 300], [670, 350],
    ].map(([x, y], i) => spot(P3A_SCALE, "pore", i, x, y, i === 0 ? 0.6 : 0.16 - (i % 4) * 0.02, i === 0 ? -0.16 : -0.05, 0, i < 4 ? "nose" : i < 8 ? "cheek" : "forehead", "prior")),
    line(P3A_SCALE, "wrinkle", 0, { x: 330, y: 468, w: 420, h: 30 }, -0.1, "forehead"),
    line(P3A_SCALE, "wrinkle", 1, { x: 370, y: 520, w: 340, h: 24 }, -0.09, "forehead"),
    line(P3A_SCALE, "wrinkle", 2, { x: 500, y: 430, w: 80, h: 130 }, -0.08, "glabellar"),
    line(P3A_SCALE, "wrinkle", 3, { x: 190, y: 620, w: 100, h: 74 }, -0.08, "crowfeet"),
    line(P3A_SCALE, "wrinkle", 4, { x: 790, y: 610, w: 100, h: 74 }, -0.08, "crowfeet"),
    line(P3A_SCALE, "wrinkle", 5, { x: 350, y: 860, w: 90, h: 170 }, -0.07, "nasolabial"),
    line(P3A_SCALE, "wrinkle", 6, { x: 640, y: 860, w: 90, h: 170 }, -0.07, "nasolabial"),
  ],
  regions: [
    patch(P3A_SCALE, "redness", 0, { x: 205, y: 770, w: 240, h: 170 }, -0.03, 0.09, "forehead"),
    patch(P3A_SCALE, "redness", 1, { x: 640, y: 780, w: 240, h: 170 }, -0.03, 0.1, "forehead"),
    patch(P3A_SCALE, "dark_circle", 0, { x: 255, y: 650, w: 199, h: 78 }, -0.07, 0, "cheek_band"),
    patch(P3A_SCALE, "dark_circle", 1, { x: 623, y: 655, w: 186, h: 66 }, -0.06, 0, "cheek_band"),
    patch(P3A_SCALE, "eye_bag", 0, { x: 264, y: 690, w: 173, h: 80 }, -0.05, 0, "cheek_band"),
    patch(P3A_SCALE, "eye_bag", 1, { x: 630, y: 690, w: 181, h: 80 }, -0.05, 0, "cheek_band"),
  ],
  skipped: [
    { concern: "acne", reason: "Marks too faint to measure" },
    { concern: "texture", reason: "Not a visible mark" },
  ],
  summaries: {
    pore: { maxM: 5, medianM: 0, relHalfWidth: 0.25, confidence: "low", population: 700, survival: [0.85, 0.78, 0.5, 0.3, 0.12, 0.04, 0.008, 0] },
    dark_circle: { maxM: 0.9, medianM: 0.85, relHalfWidth: 0.1, confidence: "medium" },
    eye_bag: { maxM: 0.75, medianM: 0.7, relHalfWidth: 0.1, confidence: "medium" },
    wrinkle: { maxM: 3, medianM: 0, relHalfWidth: 0.12, confidence: "medium", population: 110, survival: [0.95, 0.9, 0.75, 0.55, 0.3, 0.06, 0, 0] },
    age_spot: { maxM: 4.5, medianM: 0, relHalfWidth: 0.08, confidence: "high", population: 52, survival: [1, 1, 0.98, 0.9, 0.78, 0.45, 0.1, 0] },
    redness: { maxM: 3.6, medianM: 3.5, relHalfWidth: 0.1, confidence: "medium" },
  },
  confidenceReasons: {
    pore: "YouCam marks where pores are, not how big they are, so we assume a typical size.",
    dark_circle: "Light skin shows these shadows softly, so the contrast is low and well measured.",
    eye_bag: "A soft change in shading, measured against the cheek next to it.",
    wrinkle: "Lines are thin, so a small error in width moves the distance.",
    age_spot: "Sizes come from the outlines YouCam drew.",
    redness: "Broad colour differences are measured against a nearby patch of skin.",
  },
  scores: { eye_bag: [46, 66], age_spot: [64, 67], redness: [59, 72], dark_circle: [90, 81], pore: [44, 65], wrinkle: [80, 76] },
  coverage: {
    concern: "redness",
    category: "foundation",
    field: "coverageIntensity",
    afterImage: "/demo/p3a/spots-half-preview.jpg",
    targets: [
      [0.5, "not_met", null, 0.7],
      [1, "met", 70, 0.9],
      [1.5, "met", 55, 1.4],
    ],
  },
  whatIf: {
    concern: "age_spot",
    strengths: { spots: 0.5, redness: 0.5 },
    afterImage: "/demo/p3a/spots-half-preview.jpg",
    afterM: 1.4,
    strengthWord: "spots",
  },
};

/* ------------------------------------------------------------------ p2c (placeholder) */

const p2c: PersonaSpec = {
  ...p2b,
  id: "p2c",
  label: "Synthetic face C (placeholder)",
  description: "Placeholder: the first face again, with different illustrative numbers, until the third recording lands.",
  summaries: {
    pore: { maxM: 6, medianM: 0, relHalfWidth: 0.25, confidence: "low", population: 656, survival: [0.92, 0.87, 0.66, 0.5, 0.24, 0.1, 0.02, 0.005] },
    wrinkle: { maxM: 1.8, medianM: 0, relHalfWidth: 0.12, confidence: "medium", population: 60, survival: [0.8, 0.7, 0.3, 0.1, 0.02, 0, 0, 0] },
    eye_bag: { maxM: 0.95, medianM: 0.9, relHalfWidth: 0.1, confidence: "medium" },
    age_spot: { maxM: 3.5, medianM: 0, relHalfWidth: 0.08, confidence: "high", population: 20, survival: [0.95, 0.9, 0.6, 0.4, 0.2, 0.08, 0, 0] },
    acne: { maxM: 5, medianM: 0, relHalfWidth: 0.14, confidence: "medium", population: 21, survival: [1, 1, 0.9, 0.7, 0.5, 0.28, 0.1, 0] },
    dark_circle: { maxM: 2.4, medianM: 2.2, relHalfWidth: 0.1, confidence: "high" },
  },
  coverage: {
    concern: "acne",
    category: "foundation",
    field: "coverageIntensity",
    afterImage: "/demo/p2b/foundation-preview.jpg",
    targets: [
      [0.5, "not_met", null, 0.6],
      [1, "met", 45, 0.95],
      [1.5, "met", 20, 1.45],
    ],
  },
  whatIf: {
    concern: "acne",
    strengths: { acne: 0.5 },
    afterImage: "/demo/p2b/foundation-preview.jpg",
    afterM: 1.1,
    strengthWord: "marks",
  },
};

/* ------------------------------------------------------------------ assembly */

const SPECS: Record<string, PersonaSpec> = { p2b, p3a, p2c };

export const MOCK_PERSONA_IDS = Object.keys(SPECS);

function buildCoverageOptions(spec: PersonaSpec, baselineM: number): CoverageOption[] {
  const { concern, category, field, afterImage, targets } = spec.coverage;
  const noun = mockNoun(concern);
  const cap = category[0].toUpperCase() + category.slice(1);

  return targets.map(([targetM, status, lever, afterM]) => {
    const target = formatDistance(targetM);
    const alreadyOut = baselineM <= targetM;
    const levers = lever === null ? [30, 60, 95] : [Math.max(10, Math.round((lever - 30) / 5) * 5), lever];
    const steps: CoverageStep[] = levers.map((value, i) => ({
      lever: { category, field, value },
      render: render(afterImage, 1080, 1341),
      maxDistanceM: lever === null ? [1.5, 1.1, afterM][i] : i === levers.length - 1 ? afterM : Math.min(baselineM, afterM * 1.4),
    }));
    const chosen = status === "met" && lever !== null ? steps[steps.length - 1] : null;
    const plan: CoveragePlan = {
      concern,
      targetDistanceM: targetM,
      baselineDistanceM: baselineM,
      steps: alreadyOut ? [] : steps,
      chosen: alreadyOut ? null : chosen,
      status: alreadyOut ? "met" : status,
    };

    if (alreadyOut) {
      return {
        plan,
        headline: `Your ${noun} are already out of sight beyond ${target}.`,
        leverLabel: null,
        leverName: null,
        detail: "Nothing needed at this distance.",
        afterImage,
        afterIsPreview: true,
      };
    }
    if (status === "met" && lever !== null) {
      return {
        plan,
        headline: `${cap} at ${lever}% coverage keeps ${noun} out of sight beyond ${target}.`,
        leverLabel: `${category} coverage ${lever}%`,
        leverName: `${category} coverage`,
        detail: `Checked on a rendered try-on: the most visible one now fades at ${formatDistance(afterM)} (it was ${formatDistance(baselineM)}). Your own shade and light will shift it a little.`,
        afterImage,
        afterIsPreview: true,
      };
    }
    return {
      plan,
      headline: `Not at ${target}: even a lot of ${category} leaves ${noun} showing.`,
      leverLabel: null,
        leverName: null,
      detail: `We tried ${levers.length} levels. At ${levers[levers.length - 1]}% coverage the most visible one still shows to ${formatDistance(afterM)}. Up close, almost any mark can be seen by someone who looks.`,
      afterImage,
      afterIsPreview: true,
    };
  });
}

/** Mock results for a demo persona id, or null if unknown. */
export function getMockResults(id: string): ResultsData | null {
  const spec = SPECS[id];
  if (!spec) return null;

  const measurements: Measurements = {
    scale: spec.scale,
    features: spec.features,
    regions: spec.regions,
    skipped: spec.skipped,
  };
  const report = buildReport(measurements, spec.summaries);

  const concerns = report.concerns.map((v) =>
    mockConcernCopy(v, measurements, RELIEF_WITHIN_M, spec.confidenceReasons[v.concern] ?? ""),
  );

  const results: ConcernResult[] = report.concerns.map((v) => ({
    concern: v.concern,
    region: "whole",
    rawScore: spec.scores[v.concern]?.[0] ?? 50,
    uiScore: spec.scores[v.concern]?.[1] ?? 70,
    maskRef: null,
  }));

  const covConcern = report.concerns.find((c) => c.concern === spec.coverage.concern);
  const wiConcern = report.concerns.find((c) => c.concern === spec.whatIf.concern);

  const coverageOptions = covConcern ? buildCoverageOptions(spec, covConcern.maxDistanceM) : [];
  const whatIfPlan: WhatIf | null = wiConcern
    ? {
        concern: wiConcern.concern,
        strengths: spec.whatIf.strengths,
        render: render(spec.whatIf.afterImage, spec.frame.width, spec.frame.height),
        beforeDistanceM: wiConcern.maxDistanceM,
        afterDistanceM: spec.whatIf.afterM,
      }
    : null;

  const keyOf = (c: (typeof report.concerns)[number]) => (c.profile ? c.medianDistanceM : c.maxDistanceM);
  const sorted = [...report.concerns].sort((a, b) => keyOf(a) - keyOf(b));
  const picks = sorted.length >= 3 ? [sorted[0], sorted[Math.floor((sorted.length - 1) / 2)], sorted[sorted.length - 1]] : sorted;
  const share: ShareData = {
    title: "What others see",
    subtitle: `${spec.label}, seen from a distance`,
    lines: picks.map((v) => mockShareLine(v, RELIEF_WITHIN_M)),
    footnote: "An ideal observer, indoor light. Real viewers see less.",
  };

  return {
    persona: {
      id: spec.id,
      label: spec.label,
      description: spec.description,
      image: spec.image,
      analysis: { engine: "hd", frame: spec.frame, results, skinAge: null, overall: null },
      masks: {},
      coverage: coverageOptions.map((o) => o.plan),
      whatIfs: whatIfPlan ? [whatIfPlan] : [],
    },
    frame: spec.frame,
    alt: spec.alt,
    stageGrey: spec.stageGrey,
    measurements,
    report,
    concerns,
    outOfScope: [...(spec.extraOutOfScope ?? []), ...MOCK_OUT_OF_SCOPE],
    anchors: MOCK_ANCHORS,
    reliefWithinM: RELIEF_WITHIN_M,
    coverage: covConcern
      ? {
          concern: covConcern.concern,
          title: mockTitle(covConcern.concern),
          lede: `Pick how far away you want a viewer to stop noticing your ${mockNoun(covConcern.concern)}. We show the least makeup that gets there, checked on a try-on render.`,
          options: coverageOptions,
        }
      : null,
    whatIf:
      wiConcern && whatIfPlan
        ? {
            whatIf: whatIfPlan,
            title: mockTitle(wiConcern.concern),
            headline: `If these ${spec.whatIf.strengthWord} faded by half, they'd disappear beyond ${formatDistance(spec.whatIf.afterM)}.`,
            detail: `Today they are visible from up to ${formatDistance(wiConcern.maxDistanceM)}. This shows what would change what others see. It is not a promise about any product or routine.`,
            beforeLabel: "Today",
            afterLabel: "Faded by half",
            afterImage: spec.whatIf.afterImage,
            afterIsPreview: spec.id !== "p3a",
          }
        : null,
    share,
    receipts: mockReceipts(measurements, report),
    maskStrip: mockMaskStrip(spec.id === "p3a" ? "p3a" : "p2b", spec.skipped),
    tagline: "YouCam's AI finds it. Vision science measures it.",
    heroLabel: "Your photo, nothing redrawn. Filtered by a model of human vision at this distance.",
    provenance: "A replay of a recorded YouCam skin analysis of a synthetic face. Distances here are illustrative.",
    statusLines: [
      "Loading the recorded analysis for this synthetic face.",
      "Measuring every mark against the width of the iris.",
      "Rendering what an observer sees at eight distances.",
    ],
    rendererNote: "Placeholder blur, drawn by the mock renderer. The vision model replaces it at integration.",
  };
}
