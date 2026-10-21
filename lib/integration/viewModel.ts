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
  anchorFor,
  concernExplainer,
  coverageHook,
  COVERAGE_TITLE,
  describeConcern,
  describeWorthIt,
  DISCLAIMERS,
  formatDistance,
  hasCoverageLever,
  isSoftArea,
  orderReliefFirst,
  RELIEF_MAX_M,
  RELIEF_SHARE,
  ROOM_M,
  summaryLine,
  TABLE_M,
  toneOf,
  WORTH_IT_CREDIT,
} from "@/lib/copy";
import {
  confidenceLine,
  coverageSentences,
  COVERAGE_LEDE,
  ENGINE_PARTS,
  ENGINE_TITLE,
  ENGINE_UNITS,
  fadeLabelOf,
  heroLabel,
  keyDistanceOf,
  keyLine,
  NOT_ABOUT_VISIBILITY,
  numberMeaning,
  RENDERER_NOTE,
  SHARE_QUALIFIER,
  shareSentence,
  SYNTHETIC_TAG,
  TAGLINE,
  TAPE_ANCHORS,
  titleOf,
  VALIDATION_BADGE,
  VALIDATION_HREF,
  WORTH_IT_LEDE,
} from "./copy";
import { concernCrop, loupePatch } from "./crops";
import { PRIVACY_LINE } from "./privacy";
import { DEFAULT_RECEIPT_M, RECEIPT_DISTANCES_M } from "./receiptSnapshots";
import { worthItInput } from "./sentences";
import { encodeShareLine, MAX_SHARE_LINES, reliefShareLines, shareLineDistanceM, shareLineText } from "./shareLines";
import { COVERAGE_CONCERNS, COVERAGE_TARGET_M, type ReadingBundle } from "./types";

export interface ViewOptions {
  /** Live sessions: where the "Worth it?" simulations stand. A demo bundle has them all. */
  worthIt?: { state: "ready" | "pending" | "error"; message?: string };
  /** Live sessions: coverage runs only on request. */
  coverage?: Partial<Record<ConcernId, { state: "idle" | "running" | "error"; message?: string }>>;
}

// Skin texture is a sampling window, not a visible mark, so it has no thumbnail.
const MASK_ORDER: ConcernId[] = ["acne", "age_spot", "pore", "wrinkle", "dark_circle", "eye_bag", "redness"];

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
  return `A concern with many marks counts as out of sight once even perfect eyes could pick out at most ${Math.round(RELIEF_SHARE * 100)}% of them ${anchorFor(TABLE_M)}; a single area, once it is gone by ${formatDistance(RELIEF_MAX_M)}.`;
}

/** The simulation is shown as a picture, not as a quantity: the credit says "YouCam Skin Simulation", never "half strength". */
const noStrength = (text: string) => text.replace(/,? half strength/g, "");

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
  const { report, measurements } = bundle;
  const ownPhoto = bundle.source === "live";
  const ordered = orderReliefFirst(report.concerns).filter((c) => c.targetCount > 0 && CONCERNS[c.concern].visibility);

  // The lightest touch: one option per concern with a makeup lever and something to cover. A demo face shows what was
  // recorded; a live session offers every concern with a lever, run on request.
  const total = (concern: ConcernId) => report.concerns.find((c) => c.concern === concern)?.targetCount ?? 0;
  const onDemand = bundle.source !== "demo";
  const coverageConcerns = COVERAGE_CONCERNS.filter(
    (c) => total(c) > 0 && (onDemand || bundle.coverageEntries.some((e) => e.plan.concern === c)),
  );
  const targetsOf = (concern: ConcernId) => [
    ...measurements.features.filter((f) => f.concern === concern),
    ...measurements.regions.filter((r) => r.concern === concern),
  ];

  const concerns: ConcernCopy[] = ordered.map((cv) => {
    const described = bundle.sentences.concerns[cv.concern] ?? describeConcern(cv);
    const tone = toneOf(cv);
    // lib/copy ends a card's detail with the coverage hook and the mark-safety line; each gets its own place on the card.
    // The hook is only kept when "The lightest touch" has an option for this concern: p5a has no recorded try-ons.
    const hookText = coverageHook(cv.concern);
    const hook = hookText && hasCoverageLever(cv.concern) && coverageConcerns.includes(cv.concern) ? hookText : undefined;
    let detail = described.detail;
    if (hookText) detail = detail.replace(hookText, "");
    if (described.safety) detail = detail.replace(described.safety, "");
    detail = detail.replace(/\s{2,}/g, " ").trim();
    return {
      concern: cv.concern,
      title: titleOf(cv.concern),
      fadeLabel: fadeLabelOf(cv.concern),
      tone,
      headline: described.headline,
      detail,
      keyLine: keyLine(cv, tone),
      soft: isSoftArea(cv),
      ...(described.safety ? { safety: described.safety } : {}),
      ...(hook ? { hook } : {}),
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
    const present = bundle.analysis.results.some((r) => r.concern === id);
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
          ...(empty ? { note: "Nothing found" } : {}),
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

  const coverageOptions: CoverageOption[] = coverageConcerns.map((concern) => {
    const entry = bundle.coverageEntries.find((e) => e.plan.concern === concern);
    const title = titleOf(concern);
    if (entry) {
      return {
        concern,
        title,
        plan: entry.plan,
        ...coverageSentences(entry.plan),
        afterImage: entry.afterImage,
        crop: concernCrop(concern, targetsOf(concern), bundle.frame),
        state: "ready" as const,
      };
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
            : `Find the lightest touch that hides your ${noun}.`,
      leverLabel: null,
      leverName: null,
      detail:
        state === "error"
          ? (live?.message ?? "Please try again in a moment.")
          : "We render a few try-ons with YouCam Makeup and measure each one with the same model. It takes about half a minute and uses up to four of your session's renders.",
      afterImage: null,
      crop: concernCrop(concern, targetsOf(concern), bundle.frame),
      state,
    };
  });
  const coverage: CoverageView | null =
    coverageOptions.length > 0
      ? { title: COVERAGE_TITLE, lede: COVERAGE_LEDE(COVERAGE_TARGET_M), targetM: COVERAGE_TARGET_M, options: coverageOptions }
      : null;

  // Worth it?
  const wiState = options.worthIt?.state ?? (bundle.worthIt.length > 0 ? "ready" : bundle.source === "demo" ? null : "pending");
  const worthIt: WorthItView | null = wiState
    ? {
        title: "Worth it?",
        lede: WORTH_IT_LEDE,
        credit: WORTH_IT_CREDIT,
        beforeLabel: "Today",
        afterLabel: "Simulation",
        state: wiState,
        message: options.worthIt?.message,
        items: [...bundle.worthIt]
          .map((w) => {
            const sentences = bundle.sentences.worthIt[w.concern] ?? describeWorthIt(worthItInput(w));
            const typicalM = w.whatIf.differenceNominalMaxDistanceM ?? (w.whatIf.differenceMaxDistanceM ?? 0) / 1.5;
            return {
              concern: w.concern,
              title: titleOf(w.concern),
              whatIf: w.whatIf,
              headline: noStrength(sentences.headline),
              detail: noStrength(sentences.detail),
              soft: w.concern === "dark_circle" || w.concern === "eye_bag" || (w.concern === "redness" && typicalM >= ROOM_M),
              typicalM,
              afterImage: w.whatIf.render.imageRef,
              crop: concernCrop(w.concern, targetsOf(w.concern), bundle.frame),
            };
          })
          .sort((a, b) => b.typicalM - a.typicalM),
      }
    : null;

  // Share card. `lines` is the older three-line summary (relief, a middle one, the most visible) that the brands kiosk mock
  // shows; the card itself is drawn from `choices`: relief sentences only, picked by the visitor, never a face of their own.
  const picks = ordered.length <= 3 ? ordered : [ordered[0], ordered[Math.floor((ordered.length - 1) / 2)], ordered[ordered.length - 1]];
  const choices = reliefShareLines(report).map((spec) => ({
    token: encodeShareLine(spec),
    concern: spec.concern,
    text: shareLineText(spec),
    distanceM: shareLineDistanceM(spec),
  }));
  const demo = bundle.source === "demo";
  const share: ShareData = {
    title: "What others see",
    subtitle: demo ? `${bundle.label}, seen from a distance` : "Your photo, seen from a distance",
    lines: picks.map((cv) => {
      const tone = toneOf(cv);
      return { concern: cv.concern, label: titleOf(cv.concern), sentence: shareSentence(cv, tone), distanceM: keyDistanceOf(cv), tone };
    }),
    footnote: SHARE_QUALIFIER,
    choices,
    defaults: choices.slice(0, MAX_SHARE_LINES).map((c) => c.token),
    cardKey: demo ? bundle.id : "live",
    faceAllowed: demo,
    qualifier: SHARE_QUALIFIER,
    tag: bundle.source === "live" ? null : SYNTHETIC_TAG,
  };

  return {
    persona: slimPersona(bundle),
    source: bundle.source,
    frame: bundle.frame,
    alt: ownPhoto ? "Your photo" : bundle.alt,
    ownPhoto,
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
    engine: {
      title: ENGINE_TITLE,
      parts: [...ENGINE_PARTS],
      units: ENGINE_UNITS,
      tagline: TAGLINE,
      validation: { text: VALIDATION_BADGE, href: VALIDATION_HREF },
    },
    loupe: loupePatch(measurements.features, report.targets, bundle.frame, measurements.regions),
    tagline: TAGLINE,
    heroLabel: heroLabel(ownPhoto),
    provenance: provenanceOf(bundle),
    notices: noticesOf(bundle),
    disclaimers: {
      estimate: DISCLAIMERS.estimate,
      synthetic: bundle.source === "live" ? null : DISCLAIMERS.synthetic,
      simulation: DISCLAIMERS.simulation,
      tryOn: DISCLAIMERS.tryOn,
      notHealth: DISCLAIMERS.notHealth,
      mark: DISCLAIMERS.mark,
    },
    statusLines: [
      "Reading the YouCam analysis.",
      "Measuring every mark against the width of the iris.",
      "Drawing what an observer sees at eight distances.",
    ],
    rendererNote: RENDERER_NOTE,
  };
}
