/**
 * Quotes: the pre-formatted strings every tool result carries (`result.quotes`). The agent must use them verbatim for any
 * number it writes, and the verifier accepts a number in the plan only if it appears in the quotes of a result the claim
 * cites. So everything a person could read as a number is made here, once, from the result's own fields.
 *
 * Key scheme (a `${concern}` is a ConcernId such as "age_spot"; only concerns present on the face get keys):
 *
 *   ObserveResult (observe_scene)
 *     distance                "1.5 m": the distance the scene is judged at (video calls: the equivalent in-person distance)
 *     light                   "evening light at home": the light's plain label
 *     viewer                  "typical eyes (20/20)" or "blurrier eyes (20/40), such as without glasses"
 *     ${concern}.typical      what a typical viewer picks out: "none", "about 1 in 12", "about a third", "about half", "most",
 *                             "nearly all", "all"; large soft areas: "noticeable" or "out of sight"
 *     ${concern}.typicalCount "54 of 650" (exact targets; soft areas count their zones)
 *     ${concern}.bound        what even perfect eyes could pick out. Always contains "at most": "at most 1 in 8"
 *     ${concern}.boundCount   "at most 81 of 650"
 *     video calls only:
 *     floor                   "1.2 mm": the smallest detail the video carries (two pixels of the received tile)
 *     ${concern}.belowCamera  "310 of 650": targets smaller than that, lost in the video whatever the eyes
 *
 *   CallFrameResult (video_call_frame)
 *     device                  "laptop"
 *     layout                  "you alone (speaker view)" or "a small gallery tile"
 *     cameraDistance          "50 cm"
 *     equivalentDistance      "1.5 m": the in-person distance at which your face looks the same size to the other person
 *     resolutionFloor         "1.2 mm"
 *     viewerDistance          "60 cm": how far the other person sits from their screen (assumed)
 *     tileHeight              "17 cm": how tall your picture is on their screen (assumed)
 *
 *   FreeFixResult (find_free_fix); the `after` observe result has its own quotes
 *     change                  "move the laptop about 30 cm further back" (always present; says so when nothing is needed or
 *                             nothing free is enough)
 *     to                      "as if you were about 2.1 m away"; only when a change is proposed
 *     limit                   only when no free change is enough: what the strongest free setting still leaves, e.g. "even with the
 *                             camera 90 cm away and gallery view, dark spots (about a third) would still be picked out"
 *
 *   LightestTouchResult (lightest_touch)
 *     coverage                "75% coverage" (or "no coverage needed")
 *     measuredAt              "measured in indoor light at 1.5 m": always, with every number from this result
 *     before                  "at most 1 in 3": what even perfect eyes could pick out with no makeup (bound)
 *     after                   "at most 1 in 8": the same with that coverage (bound)
 *     goal                    "at most 1 in 10 picked out by perfect eyes": what "met" means
 *     result                  "reaches the goal" (met) or "most of the effect, not all of it" (not met)
 *
 *   WorthItResult (worth_it)
 *     distance                "1.5 m"
 *     change.typical          the share of the simulated change a typical viewer would notice (same words as typical)
 *     change.bound            the same for perfect eyes, with "at most"
 *     measuredAt              "measured on YouCam Skin Simulation at half strength, in indoor light"
 *
 *   ReceiptResult (receipt)
 *     distance, size ("about 1.2 mm across" or "0.3 mm wide"), sizeSource, contrast ("12% darker"), against
 *     ("than the skin around it"), angle ("3.2 arcmin"), threshold ("about 9%"), typicalThreshold ("about 14%"),
 *     verdict (the site's receipt sentence); video calls add camera when the mark is smaller than the video carries.
 *
 * Wording rules: no medical or shaming words (UI_LISTS in lib/copy/banned.ts), no "never", "nobody", "no one", "promise".
 * The bound's quotes always say "at most"; the typical quotes say "about" or use plain words.
 */
import { formatDistance } from "../copy/distance";

const EPS = 1e-9;

/** Site rounding (lib/integration/receipt.ts): under 1 mm two decimals, under 10 mm one, else whole millimetres. */
export const mmText = (v: number) => (v < 1 ? v.toFixed(2) : v < 10 ? v.toFixed(1) : String(Math.round(v)));
export const pctText = (v: number) => (v < 10 ? v.toFixed(1) : String(Math.round(v)));
export const arcminText = (v: number) => (v < 10 ? v.toFixed(1) : String(Math.round(v)));

/** Centimetres as typed ("37 cm"), unlike formatDistance, which rounds under a metre to 5 cm. */
export const cmText = (cm: number) => (cm >= 100 ? formatDistance(cm / 100) : `${Math.round(cm)} cm`);

/**
 * A typical viewer's share in words. Bands are the site's (`shareWord`), except that a share under 30% is a count, "about 1
 * in 12", so that a small number stays a number. A share that rounds to under 1 in 100 reads "fewer than 1 in 100".
 */
export function typicalPhrase(share: number): string {
  if (!(share > EPS)) return "none";
  if (share >= 1 - EPS) return "all";
  if (share > 0.92) return "nearly all";
  if (share > 0.58) return "most";
  if (share > 0.42) return "about half";
  if (share > 0.3) return "about a third";
  const n = Math.round(1 / share);
  return n > 100 ? "fewer than 1 in 100" : `about 1 in ${n}`;
}

/**
 * The bound's share. Rounded up, so "at most" holds: 1 in N never undercounts (N is rounded down), tenths are rounded up.
 * Zero reads "none at all (at most 0)" so the quote still carries "at most".
 */
export function boundPhrase(share: number): string {
  if (!(share > EPS)) return "none at all (at most 0)";
  if (share >= 1 - EPS) return "at most all of them";
  if (share >= 0.9) return "at most nearly all";
  if (share >= 0.3) {
    const tenths = Math.ceil(share * 10 - EPS);
    return tenths === 5 ? "at most half" : `at most ${tenths} in 10`;
  }
  return `at most 1 in ${Math.min(100, Math.floor(1 / share + EPS))}`;
}

export const typicalSoft = (visible: boolean) => (visible ? "noticeable" : "out of sight");
export const boundSoft = (visible: boolean) => (visible ? "at most noticeable" : "out of sight, even for perfect eyes (at most 0)");

export const countText = (count: number, total: number) => `${count} of ${total}`;
export const boundCountText = (count: number, total: number) => `at most ${count} of ${total}`;

export const join = (parts: readonly string[]) => parts.filter(Boolean).join(" ");
