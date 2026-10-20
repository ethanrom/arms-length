/** Mock data for the walk-back self-test shell. Logic and real predictions come later. */

export interface SelfTestTarget {
  /** What the target stands for: "an age spot". */
  label: string;
  diameterMm: number;
  /** Weber contrast of the spot against the field, 0..1 (darker than the field). */
  contrast: number;
}

export interface SelfTestPrediction {
  distanceM: number;
  intervalM: [number, number];
}

export interface SelfTestCopy {
  /** The prediction we stake our claim on: "We predict this dot disappears at 2.4 m. Walk back and see." */
  predictionLine: string;
  /** Shown when the measured distance is at or inside the model's bound. */
  consistent: string;
  /** Shown when the person saw it farther than the bound. */
  beyond: string;
  /** Why a screen test is a demonstration and not a lab test. */
  caveat: string;
}

export const MOCK_SELF_TEST: { target: SelfTestTarget; prediction: SelfTestPrediction; copy: SelfTestCopy } = {
  target: { label: "an age spot, 2.4 mm across", diameterMm: 2.4, contrast: 0.12 },
  prediction: { distanceM: 2.4, intervalM: [2.2, 2.6] },
  copy: {
    predictionLine: "We predict this dot disappears at 2.4 m. Walk back and see.",
    consistent: "You lost it at or before the distance the model gives as the limit. That is what the model promises: beyond it, nothing to see.",
    beyond: "You kept seeing it past the model's limit. Screens differ in brightness and contrast, so try again with the lights low, or tell us how it went.",
    caveat: "This is a demonstration, not a lab test: we do not know your screen's brightness, and the target is flat while skin has texture.",
  },
};
