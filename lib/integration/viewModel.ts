/**
 * ReadingBundle -> ResultsData: the one place the results page's numbers and sentences are assembled.
 * Numbers come from the bundle (the real pipeline); sentences from lib/copy, plus lib/integration/copy.ts for the few
 * templates lib/copy does not have. The UI keeps no relief/visible rule of its own: `tone` is lib/copy's.
 */
import { CONCERNS, type ConcernId, type ConcernVisibility, type PersonaBundle } from "@/lib/contracts";
import type {
  ConcernCopy,
  CoverageOption,
  CoverageView,
  MaskStrip,
  OutOfScopeNote,
  ReceiptEntry,
  ResultsData,
  ShareData,
  WorthItView,
} from "@/components/results/types";
import {
  concernExplainer,
  describeConcern,
  describeWorthIt,
  formatDistance,
  orderReliefFirst,
  RELIEF_MAX_M,
  RELIEF_SHARE,
  summaryLine,
  TABLE_M,
  toneOf,
  WORTH_IT_CREDIT,
  anchorFor,
  youcamScoreOf,
} from "@/lib/copy";
import {
  COVERAGE_LEDE,
  describeCoverage,
  fadeLabelOf,
  HERO_LABEL,
  keyDistanceOf,
  keyLine,
  NOT_ABOUT_VISIBILITY,
  numberMeaning,
  confidenceLine,
  RENDERER_NOTE,
  shareSentence,
  TAGLINE,
  TAPE_ANCHORS,
  titleOf,
  WORTH_IT_LEDE,
} from "./copy";
import { PRIVACY_LINE } from "./privacy";
import { DEFAULT_RECEIPT_M, RECEIPT_DISTANCES_M } from "./receiptSnapshots";
import { COVERAGE_CONCERNS, COVERAGE_TARGET_M, type ReadingBundle } from "./types";

export interface ViewOptions {
  /** Live sessions: where the "Worth it?" simulations stand. A demo bundle has them all. */
  worthIt?: { state: "ready" | "pending" | "error"; message?: string };
  /** Live sessions: coverage runs only on request. */
  coverage?: Partial<Record<ConcernId, { state: "idle" | "running" | "error"; message?: string }>>;
}

const MASK_ORDER: ConcernId[] = ["acne", "age_spot", "pore", "wrinkle", "dark_circle", "eye_bag", "redness", "texture"];

function slimPersona(bundle: ReadingBundle): PersonaBundle {
  const { id, label, description, image, analysis, masks, coverage, whatIfs } = bundle;
  return { id, label, description, image, analysis, masks, coverage, whatIfs };
}

function provenanceOf(bundle: ReadingBundle): string {
  if (bundle.source === "live") {
    return bundle.analysis.engine === "hd"
      ? "Your photo, analysed by YouCam HD Skin Analysis moments ago. Every distance here is computed from it in your browser."
      : "Your photo, analysed by YouCam Skin Analysis (standard detail) moments ago. Every distance here is computed from it in your browser.";
  }
  if (bundle.source === "replay") {
    return "A replay of a recorded YouCam analysis of a synthetic face, standing in for your photo while live analysis is off.";
  }
  return "A recorded YouCam HD Skin Analysis of a synthetic face. Every distance here is computed from it by our vision model.";
}

function noticesOf(bundle: ReadingBundle): string[] {
  const out: string[] = [];
  if (bundle.source === "live") out.push(PRIVACY_LINE);
  if (bundle.source === "replay") out.push("Replay mode: this is a recorded analysis of a synthetic face, not your photo.");
  if (bundle.capture?.upscaled) {
    out.push("Your photo was enlarged to reach the high-detail analysis, so pores and fine lines are less certain. A phone photo gives the most detail.");
  }
  if (bundle.capture?.engine === "sd") {
    out.push("This photo is too small for the high-detail analysis, so pores and breakouts get no distance. A phone photo gives the most detail.");
  }
  return out;
}

function reliefNoteOf(): string {
  return `A single area counts as out of sight once it is gone by ${formatDistance(RELIEF_MAX_M)}; a concern with many marks, once at most ${Math.round(RELIEF_SHARE * 100)}% of them could be seen ${anchorFor(TABLE_M)}.`;
}

const unmeasuredStub = (concern: ConcernId): ConcernVisibility => ({
  concern,
  targetCount: 0,
  maxDistanceM: 0,
  medianDistanceM: 0,
  intervalM: [0, 0],
  topTargets: [],
  confidence: "low",
});

export function buildResultsData(bundle: ReadingBundle, options: ViewOptions = {}): ResultsData {
  const { report, measurements, analysis } = bundle;
  const ordered = orderReliefFirst(report.concerns).filter((c) => c.targetCount > 0 && CONCERNS[c.concern].visibility);

  const concerns: ConcernCopy[] = ordered.map((cv) => {
    const described =
      bundle.sentences.concerns[cv.concern] ?? describeConcern(cv, { youcamScore: youcamScoreOf(analysis.results, cv.concern) });
    const tone = toneOf(cv);
    return {
      concern: cv.concern,
      title: titleOf(cv.concern),
      fadeLabel: fadeLabelOf(cv.concern),
      tone,
      headline: described.headline,
      detail: described.detail,
      keyLine: keyLine(cv, tone),
      explainer: `${concernExplainer(cv.concern)} ${numberMeaning(cv)}`,
      confidence: confidenceLine(cv, measurements),
    };
  });

  // Concerns the analysis covers but nothing was measured for, each with the reason, then the ones that are never a distance.
  const measured = new Set(ordered.map((c) => c.concern));
  const sdOnly = bundle.capture?.engine === "sd";
  const unmeasured: OutOfScopeNote[] = [];
  for (const id of MASK_ORDER) {
    if (measured.has(id) || !CONCERNS[id].visibility) continue;
    const present = analysis.results.some((r) => r.concern === id);
    if (!present && !(sdOnly && (id === "pore" || id === "acne"))) continue;
    unmeasured.push({
      label: titleOf(id),
      reason:
        sdOnly && (id === "pore" || id === "acne")
          ? "Needs the high-detail analysis, and this photo was too small for it."
          : describeConcern(unmeasuredStub(id)).headline,
    });
  }
  const outOfScope = [...unmeasured, ...NOT_ABOUT_VISIBILITY];

  const maskStrip: MaskStrip = {
    title: "What YouCam detected",
    note: "The raw masks from YouCam Skin Analysis, laid over the photo. Everything below is measured from these.",
    photo: bundle.image,
    frame: bundle.frame,
    items: MASK_ORDER.flatMap((concern) => {
      const image = bundle.overlays[concern];
      if (!image) return [];
      const empty = !measured.has(concern);
      return [
        {
          concern,
          label: titleOf(concern),
          image,
          ...(empty ? { note: concern === "texture" ? "Not a visible mark" : "Nothing found" } : {}),
        },
      ];
    }),
  };

  const receipts: ReceiptEntry[] = ordered.flatMap((cv) => {
    const targetId = cv.topTargets[0];
    const outline = bundle.outlines[targetId];
    return targetId && outline
      ? [{ concern: cv.concern, targetId, outline, distancesM: RECEIPT_DISTANCES_M, defaultDistanceM: DEFAULT_RECEIPT_M }]
      : [];
  });

  // Coverage: one option per concern with a makeup lever and something to cover.
  const total = (concern: ConcernId) => report.concerns.find((c) => c.concern === concern)?.targetCount ?? 0;
  // A demo face shows what was recorded; a live session offers every concern with a lever, run on request.
  const onDemand = bundle.source !== "demo";
  const coverageConcerns = COVERAGE_CONCERNS.filter(
    (c) => total(c) > 0 && (onDemand || bundle.coverageEntries.some((e) => e.plan.concern === c)),
  );
  const coverageOptions: CoverageOption[] = coverageConcerns.map((concern) => {
    const entry = bundle.coverageEntries.find((e) => e.plan.concern === concern);
    const title = titleOf(concern);
    if (entry) {
      const s = describeCoverage(entry.plan, total(concern));
      return { concern, title, plan: entry.plan, ...s, afterImage: entry.afterImage, state: "ready" as const };
    }
    const live = options.coverage?.[concern];
    const noun = title.toLowerCase();
    const state = live?.state ?? "idle";
    return {
      concern,
      title,
      plan: null,
      headline:
        state === "running"
          ? `Trying foundation on your ${noun}.`
          : state === "error"
            ? "That try-on didn't come through."
            : `Find the lightest foundation that hides your ${noun}.`,
      leverLabel: null,
      leverName: null,
      detail:
        state === "error"
          ? (live?.message ?? "Please try again in a moment.")
          : "We render a few try-ons with YouCam Makeup and measure each one with the same model. It takes about half a minute and uses up to four of your session's renders.",
      afterImage: null,
      state,
    };
  });
  const coverage: CoverageView | null =
    coverageOptions.length > 0
      ? { title: "Make it disappear", lede: COVERAGE_LEDE(COVERAGE_TARGET_M), targetM: COVERAGE_TARGET_M, options: coverageOptions }
      : null;

  // Worth it?
  const wiState = options.worthIt?.state ?? (bundle.worthIt.length > 0 ? "ready" : bundle.source === "demo" ? null : "pending");
  const worthIt: WorthItView | null = wiState
    ? {
        title: "Worth it?",
        lede: WORTH_IT_LEDE,
        credit: WORTH_IT_CREDIT,
        beforeLabel: "Today",
        afterLabel: "Half-strength improvement",
        state: wiState,
        message: options.worthIt?.message,
        items: [...bundle.worthIt]
          .map((w) => {
            const sentences =
              bundle.sentences.worthIt[w.concern] ??
              describeWorthIt({
                concern: w.concern,
                targetCount: w.targetCount,
                differenceMaxDistanceM: w.whatIf.differenceMaxDistanceM ?? 0,
                differenceProfile: w.whatIf.differenceProfile,
              });
            return {
              concern: w.concern,
              title: titleOf(w.concern),
              whatIf: w.whatIf,
              headline: sentences.headline,
              detail: sentences.detail,
              afterImage: w.whatIf.render.imageRef,
            };
          })
          .sort((a, b) => (b.whatIf.differenceMaxDistanceM ?? 0) - (a.whatIf.differenceMaxDistanceM ?? 0)),
      }
    : null;

  // Share card: the most relief, a middle one, the most visible.
  const picks = ordered.length <= 3 ? ordered : [ordered[0], ordered[Math.floor((ordered.length - 1) / 2)], ordered[ordered.length - 1]];
  const share: ShareData = {
    title: "What others see",
    subtitle: bundle.source === "live" ? "Your photo, seen from a distance" : `${bundle.label}, seen from a distance`,
    lines: picks.map((cv) => {
      const tone = toneOf(cv);
      return { concern: cv.concern, label: titleOf(cv.concern), sentence: shareSentence(cv, tone), distanceM: keyDistanceOf(cv), tone };
    }),
    footnote: "An ideal observer, indoor light. Real viewers see less.",
  };

  return {
    persona: slimPersona(bundle),
    source: bundle.source,
    frame: bundle.frame,
    alt: bundle.alt,
    stageGrey: bundle.stageGrey,
    measurements,
    report,
    concerns,
    outOfScope,
    anchors: TAPE_ANCHORS,
    reliefNote: reliefNoteOf(),
    summary: bundle.sentences.summary || summaryLine(report),
    coverage,
    worthIt,
    share,
    receipts,
    maskStrip,
    tagline: TAGLINE,
    heroLabel: HERO_LABEL,
    provenance: provenanceOf(bundle),
    notices: noticesOf(bundle),
    statusLines: [
      "Reading the YouCam analysis.",
      "Measuring every mark against the width of the iris.",
      "Drawing what an observer sees at eight distances.",
    ],
    rendererNote: RENDERER_NOTE,
  };
}
