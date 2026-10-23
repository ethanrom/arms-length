/**
 * lightest_touch, worth_it and receipt: the tools that read what the app already measured for this face (recorded makeup
 * try-ons and Skin Simulations) or re-use the receipt maths at a moment's distance and light. None of them runs a render.
 */
import { CONCERNS } from "../contracts/concerns";
import type { ConcernId } from "../contracts/concerns";
import type {
  LightestTouchResult,
  ReceiptInput,
  ReceiptResult,
  RehearseFace,
  WorthItResult,
} from "../contracts/rehearse";
import { formatDistance } from "../copy/distance";
import { BOUND_TO_NOMINAL_RATIO, profileAt } from "../copy/profile";
import { SIZE_SOURCE_LABEL, buildReceipt, receiptSentences } from "../integration/receipt";
import { SceneError, hasOwn } from "./errors";
import { faceIndex, preparedReport, sceneAssumptions, softConcerns } from "./observe";
import {
  arcminText,
  boundPhrase,
  boundSoft,
  mmText,
  pctText,
  typicalPhrase,
  typicalSoft,
} from "./quotes";
import { LIGHTS, resolveScene } from "./scenes";

const EPS = 1e-9;

function checkConcern(concern: ConcernId): void {
  if (!hasOwn(CONCERNS, concern)) throw new SceneError(`Unknown concern "${String(concern)}". Valid concerns: ${Object.keys(CONCERNS).join(", ")}.`);
}

/** The light every recorded try-on and simulation was measured in: the site's default (bundle viewing, 45 cd/m2). */
const MEASURED_LIGHT = LIGHTS.indoor.label;

// ---------------------------------------------------------------------------------------------------------------
// lightest_touch
// ---------------------------------------------------------------------------------------------------------------

const TRY_ON_ASSUMPTIONS = [
  "This is a virtual try-on of foundation, run once on your photo; real makeup, shade and light will differ.",
  "Coverage is the try-on's own scale from 0 to 100, not a property of any product on a shelf.",
  "The goal is that even perfect eyes could pick out at most 1 in 10 of them across a table; where makeup cannot reach that, the coverage shown is where most of the effect is reached.",
];

export function lightestTouch(face: RehearseFace, concern: ConcernId, ref: string): LightestTouchResult {
  checkConcern(concern);
  const plan = face.coverage.find((p) => p.concern === concern);
  const empty = { coveragePct: null, measuredAtM: null, baselineShare: null, afterShare: null } as const;
  if (!plan) {
    return {
      ref,
      concern,
      status: "not_measured",
      ...empty,
      quotes: {},
      assumptions: ["No lightest-touch try-on was run for this concern on this face, so there is no measured coverage to quote."],
    };
  }
  if (plan.status === "no_lever") {
    return {
      ref,
      concern,
      status: "no_lever",
      ...empty,
      quotes: {},
      assumptions: [
        plan.reason === "lever_not_tested"
          ? "Makeup has not been tested on this concern, so there is no lighter touch to quote."
          : "In the try-on, no makeup setting changed this concern, so there is no lighter touch to quote.",
      ],
    };
  }

  const chosen = plan.chosen;
  const coveragePct = chosen ? Math.round(chosen.lever.value) : 0;
  const baselineShare = plan.baselineFraction ?? null;
  const afterShare = chosen ? (chosen.fractionAtTarget ?? null) : baselineShare;
  const quotes: Record<string, string> = {
    coverage: coveragePct > 0 ? `${coveragePct}% coverage` : "no coverage needed",
    measuredAt: `measured in ${MEASURED_LIGHT} at ${formatDistance(plan.targetDistanceM)}`,
    goal: "at most 1 in 10 picked out by perfect eyes",
    result: plan.status === "met" ? "reaches the goal" : "most of the effect, not all of it",
  };
  if (baselineShare !== null) quotes.before = boundPhrase(baselineShare);
  if (afterShare !== null) quotes.after = boundPhrase(afterShare);
  return {
    ref,
    concern,
    status: plan.status,
    coveragePct,
    measuredAtM: plan.targetDistanceM,
    baselineShare,
    afterShare,
    quotes,
    assumptions: [`Measured in ${MEASURED_LIGHT}, at ${formatDistance(plan.targetDistanceM)}, with a typical viewer looking right at it.`, ...TRY_ON_ASSUMPTIONS],
  };
}

// ---------------------------------------------------------------------------------------------------------------
// worth_it
// ---------------------------------------------------------------------------------------------------------------

export function worthIt(face: RehearseFace, concern: ConcernId, distanceM: number, ref: string): WorthItResult {
  checkConcern(concern);
  if (typeof distanceM !== "number" || !Number.isFinite(distanceM) || distanceM <= 0) {
    throw new SceneError(`distanceM must be a positive number of metres; got ${String(distanceM)}.`);
  }
  const w = face.worthIt.find((x) => x.concern === concern);
  const boundProfile = w?.differenceProfile;
  const typicalProfile = w?.differenceNominalProfile;
  if (!w || (!boundProfile && !typicalProfile)) {
    return {
      ref,
      concern,
      simulated: false,
      distanceM,
      typicalShareOfChange: null,
      boundShareOfChange: null,
      quotes: {},
      assumptions: ["No Skin Simulation was run for this concern on this face, so there is no measured change to quote."],
    };
  }

  // The recorded profiles are at fixed distances; between them the share is read on a log axis, as everywhere on the site.
  const bound = boundProfile ? profileAt(boundProfile, distanceM).fraction : null;
  const typicalRaw = typicalProfile
    ? profileAt(typicalProfile, distanceM).fraction
    : profileAt(boundProfile!, distanceM * BOUND_TO_NOMINAL_RATIO).fraction;
  const typical = bound === null ? typicalRaw : Math.min(typicalRaw, bound);

  const soft = softConcerns(face).has(concern);
  const strength = Object.values(w.strengths)[0];
  const strengthWords = strength === 0.5 ? "half strength" : typeof strength === "number" ? `${Math.round(strength * 100)}% strength` : "half strength";
  const quotes: Record<string, string> = {
    distance: formatDistance(distanceM),
    "change.typical": soft ? typicalSoft(typical >= 0.5 - EPS) : typicalPhrase(typical),
    measuredAt: `measured on YouCam Skin Simulation at ${strengthWords}, in ${MEASURED_LIGHT}`,
  };
  if (bound !== null) quotes["change.bound"] = soft ? boundSoft(bound > EPS) : boundPhrase(bound);

  const assumptions = [
    `The change is a YouCam Skin Simulation of this concern at ${strengthWords}.`,
    `The share is the part of the changed marks a viewer would notice the difference on, measured in ${MEASURED_LIGHT} and read between the recorded distances on a log scale.`,
    "'About' is a typical sharp-eyed viewer looking right at it; 'at most' is for even perfect eyes (a 6 dB margin).",
    "A simulation shows what a change would look like, not what any product or routine would do.",
  ];
  const first = (boundProfile ?? typicalProfile)![0].distanceM;
  const last = (boundProfile ?? typicalProfile)!.slice(-1)[0].distanceM;
  if (distanceM < first - EPS || distanceM > last + EPS) {
    assumptions.push(`The simulation was measured from ${formatDistance(first)} to ${formatDistance(last)}; outside that range the nearest recorded value is used.`);
  }
  if (!typicalProfile) assumptions.push("The typical viewer's share is estimated from the perfect-eyes share, as elsewhere on the site.");
  return {
    ref,
    concern,
    simulated: true,
    distanceM,
    typicalShareOfChange: typical,
    boundShareOfChange: bound,
    quotes,
    assumptions,
  };
}

// ---------------------------------------------------------------------------------------------------------------
// receipt
// ---------------------------------------------------------------------------------------------------------------

/** What a mark is measured against, in the words the receipt uses (lib/integration/receipt.ts). */
function againstPhrase(basis: "surround" | "counterfactual", area: boolean): string {
  if (basis === "counterfactual") return "than the same face without it, as YouCam Skin Simulation draws it";
  return area ? "than the skin next to it" : "than the skin around it";
}

/** The concern's most visible target at the moment, with the numbers behind it. Null when nothing of the concern is measurable. */
export function receiptAt(face: RehearseFace, input: ReceiptInput, ref: string): ReceiptResult | null {
  checkConcern(input.concern);
  const resolved = resolveScene(input);
  const { report } = preparedReport(face.measurements, resolved.viewing);
  const topId = report.concerns.find((c) => c.concern === input.concern)?.topTargets[0];
  const index = faceIndex(face.measurements);
  const target = topId ? index.byId.get(topId) : undefined;
  if (!target) return null;
  const r = buildReceipt(target, face.measurements.scale, resolved.viewing, resolved.distanceM);
  if (!r) return null;

  const sentences = receiptSentences(r);
  const floor = resolved.call?.resolutionFloorMm;
  const lost = floor !== undefined && r.sizeMm < floor;
  const area = r.kind === "area";
  const quotes: Record<string, string> = {
    distance: formatDistance(resolved.distanceM),
    size: r.kind === "line" ? `${mmText(r.sizeMm)} mm wide` : `about ${mmText(r.sizeMm)} mm across`,
    sizeSource: SIZE_SOURCE_LABEL[r.sizeSource],
    contrast: `${pctText(r.contrastPct)}% ${r.direction}`,
    against: againstPhrase(r.basis, area),
    angle: `${arcminText(r.angleArcmin)} arcmin`,
    threshold: `about ${pctText(r.thresholdPct)}%`,
    typicalThreshold: `about ${pctText(r.typicalThresholdPct)}%`,
    verdict: lost
      ? `It is smaller than the video can carry (${mmText(floor!)} mm), so it is lost in the video whatever the other person's eyes.`
      : sentences.verdict,
  };
  if (lost) quotes.camera = `smaller than the video can carry (${mmText(floor!)} mm)`;

  const assumptions = [
    sentences.size,
    ...(sentences.foundNote ? [sentences.foundNote] : []),
    sentences.contrast,
    "The thresholds come from a published model of human contrast sensitivity, checked against lab measurements, not from a guess.",
    ...sceneAssumptions(face, resolved),
  ];
  return {
    ref,
    concern: input.concern,
    targetId: r.targetId,
    distanceM: resolved.distanceM,
    sizeMm: r.sizeMm,
    contrastPct: r.contrastPct,
    angleArcmin: r.angleArcmin,
    thresholdPct: r.thresholdPct,
    typicalThresholdPct: r.typicalThresholdPct,
    visibleBound: r.visible && !lost,
    visibleTypical: r.typicalVisible && !lost,
    quotes,
    assumptions,
  };
}

