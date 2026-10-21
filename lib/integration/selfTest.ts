/**
 * The walk-back self-test's target, prediction and sentences, from the real model (lib/selftest + the standard
 * detector). Computed on the server at build time: the prediction does not depend on which screen it is shown on
 * beyond the sampling pitch (about 0.1%), and a screen test is a demonstration, not a lab measurement.
 */
import { formatDistance } from "@/lib/copy";
import { MID_GREY_SRGB, predictVanishing } from "@/lib/selftest";
import { standardDetector } from "@/lib/vision";

export interface SelfTestTarget {
  /** What the target stands for: "an age spot". */
  label: string;
  diameterMm: number;
  /** Magnitude of the Weber contrast the screen actually produces (after 8-bit rounding), 0..1. The spot is darker. */
  contrast: number;
  /** sRGB value (all channels) of the field and of the disc. */
  fieldSrgb: number;
  discSrgb: number;
}

export interface SelfTestPrediction {
  /** Average observer, no margin. */
  nominalM: number;
  /** Beyond this the target should be invisible to a careful observer. */
  boundM: number;
}

export interface SelfTestCopy {
  /** The prediction we stake our claim on. */
  predictionLine: string;
  /** Shown by where the person's distance falls: closer than the average-viewer figure, between the two, or past the bound. */
  below: string;
  inside: string;
  above: string;
  /** Why a screen test is a demonstration and not a lab test. */
  caveat: string;
}

export const SELF_TEST_DIAMETER_MM = 2.4;
export const SELF_TEST_CONTRAST = 0.12;
const REFERENCE_PX_PER_MM = 96 / 25.4;

export function selfTestSetup(): { target: SelfTestTarget; prediction: SelfTestPrediction; copy: SelfTestCopy } {
  const p = predictVanishing(standardDetector, {
    diameterMm: SELF_TEST_DIAMETER_MM,
    contrast: -SELF_TEST_CONTRAST,
    pxPerMm: REFERENCE_PX_PER_MM,
  });
  const nominal = formatDistance(p.nominalM);
  const bound = formatDistance(p.boundM);
  return {
    target: {
      label: `a dark spot, ${SELF_TEST_DIAMETER_MM} mm across`,
      diameterMm: SELF_TEST_DIAMETER_MM,
      contrast: Math.abs(p.achievedContrast),
      fieldSrgb: MID_GREY_SRGB,
      discSrgb: p.srgb,
    },
    prediction: { nominalM: p.nominalM, boundM: p.boundM },
    copy: {
      predictionLine: `We predict this dot disappears beyond ${bound} (about ${nominal} for an average viewer). Walk back and see.`,
      below:
        "You lost it closer than the average-viewer figure. That is common, and fine: the model describes a sharp-eyed viewer looking right at the dot, and real screens, light and tired eyes all make it fade sooner. The claim only runs one way.",
      inside: "You lost it between the average-viewer figure and the model's limit. That is what the model predicts.",
      above:
        "You kept seeing it past the model's limit. Screens differ in brightness and contrast, so try again with the lights low. If it holds up, that counts against the model, and we would like to know.",
      caveat:
        "This is a demonstration, not a lab test: we do not know your screen's brightness, and the target is flat while skin has texture.",
    },
  };
}
