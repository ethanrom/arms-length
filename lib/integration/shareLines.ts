/**
 * The lines on a share card, as a closed vocabulary. A line is a concern, a kind of relief and an anchor distance, never
 * free text: that is what lets the card be drawn on the server from a few URL tokens (`pore.mostly.room`) with no stored
 * data, for demo faces and for a visitor's own photo alike, and lets nobody put their own words on an image from this site.
 *
 * Only relief is on offer: a concern appears when even perfect eyes could pick out at most a tenth of it at the anchor
 * (or, for a single area, when it is out of sight past a short distance). The sentence is the same one the cards use.
 */
import { CONCERNS, type ConcernId, type VisibilityReport } from "@/lib/contracts";
import {
  anchorFor,
  boundFractionAt,
  CONVERSATION_M,
  formatDistance,
  MARK_SAFETY_LINE,
  RELIEF_SHARE,
  ROOM_M,
  safetyLineFor,
  TABLE_M,
} from "@/lib/copy";
import { hasProfile, isSoftArea, titleOf } from "./copy";

export type ReliefAnchor = "conversation" | "table" | "room";

/** Nearest first: the closer the anchor where a concern is out of sight, the better the news. */
export const RELIEF_ANCHORS: readonly { id: ReliefAnchor; m: number }[] = [
  { id: "conversation", m: CONVERSATION_M },
  { id: "table", m: TABLE_M },
  { id: "room", m: ROOM_M },
];

export type ShareLineSpec =
  | { concern: ConcernId; kind: "all" | "mostly"; anchor: ReliefAnchor }
  | { concern: ConcernId; kind: "beyond"; distanceM: number };

/** Most lines a card carries. */
export const MAX_SHARE_LINES = 3;

/** Out of sight for a single area beyond this is not relief (it is the soft areas' territory), so it is not offered. */
const MAX_BEYOND_M = ROOM_M;

const anchorM = (anchor: ReliefAnchor) => RELIEF_ANCHORS.find((a) => a.id === anchor)!.m;

export function encodeShareLine(spec: ShareLineSpec): string {
  return spec.kind === "beyond"
    ? `${spec.concern}.beyond.${(Math.round(spec.distanceM * 10) / 10).toString()}`
    : `${spec.concern}.${spec.kind}.${spec.anchor}`;
}

/** Null for anything outside the vocabulary. */
export function decodeShareLine(token: string): ShareLineSpec | null {
  const [concern, kind, ...rest] = token.split(".");
  if (!concern || !(concern in CONCERNS) || !CONCERNS[concern as ConcernId].visibility) return null;
  const id = concern as ConcernId;
  const tail = rest.join(".");
  if (kind === "all" || kind === "mostly") {
    return RELIEF_ANCHORS.some((a) => a.id === tail) ? { concern: id, kind, anchor: tail as ReliefAnchor } : null;
  }
  if (kind === "beyond" && /^\d{1,2}(\.\d)?$/.test(tail)) {
    const distanceM = Number(tail);
    return distanceM >= 0.25 && distanceM <= 10 ? { concern: id, kind, distanceM } : null;
  }
  return null;
}

/** The two halves of a line: "Pores" and "out of sight across a table". */
export function shareLineParts(spec: ShareLineSpec): { title: string; rest: string } {
  const title = titleOf(spec.concern);
  if (spec.kind === "beyond") return { title, rest: `out of sight beyond ${formatDistance(spec.distanceM)}` };
  return { title, rest: `${spec.kind === "all" ? "out of sight" : "mostly out of sight"} ${anchorFor(anchorM(spec.anchor))}` };
}

/** "Pores: out of sight across a table". */
export function shareLineText(spec: ShareLineSpec): string {
  const { title, rest } = shareLineParts(spec);
  return `${title}: ${rest}`;
}

/** Where on the distance axis the card draws the tick for a line. */
export function shareLineDistanceM(spec: ShareLineSpec): number {
  return spec.kind === "beyond" ? spec.distanceM : anchorM(spec.anchor);
}

/** Parses `?lines=a,b,c`: valid tokens only, no repeats of a concern, at most MAX_SHARE_LINES. */
export function parseShareLines(param: string | null | undefined): ShareLineSpec[] {
  const out: ShareLineSpec[] = [];
  for (const token of (param ?? "").split(",")) {
    const spec = decodeShareLine(token.trim());
    if (spec && !out.some((o) => o.concern === spec.concern)) out.push(spec);
    if (out.length === MAX_SHARE_LINES) break;
  }
  return out;
}

/**
 * The relief lines a report supports, best news first. Many-feature concerns: the nearest anchor where even perfect eyes
 * could pick out at most RELIEF_SHARE of them ("out of sight" when none, "mostly out of sight" otherwise). A single area or
 * a few marks: out of sight past the distance of the farthest one, if that is short. Soft areas carry far on every face, so
 * they are never offered.
 */
export function reliefShareLines(report: VisibilityReport): ShareLineSpec[] {
  const found: { spec: ShareLineSpec; rank: number }[] = [];
  for (const cv of report.concerns) {
    if (!CONCERNS[cv.concern].visibility || cv.targetCount === 0 || isSoftArea(cv)) continue;
    if (hasProfile(cv)) {
      const anchor = RELIEF_ANCHORS.find((a) => boundFractionAt(cv, a.m) <= RELIEF_SHARE + 1e-9);
      if (!anchor) continue;
      const none = boundFractionAt(cv, anchor.m) <= 1e-9;
      found.push({ spec: { concern: cv.concern, kind: none ? "all" : "mostly", anchor: anchor.id }, rank: anchor.m + (none ? 0 : 0.01) });
    } else if (cv.maxDistanceM <= MAX_BEYOND_M && cv.maxDistanceM >= 0.25) {
      found.push({ spec: { concern: cv.concern, kind: "beyond", distanceM: cv.maxDistanceM }, rank: cv.maxDistanceM });
    }
  }
  return found.sort((a, b) => a.rank - b.rank).map((f) => f.spec);
}

/** The mark-safety line, when any chosen line is about dark spots or breakouts. */
export function shareSafetyFor(specs: readonly ShareLineSpec[]): string | null {
  return specs.some((s) => safetyLineFor(s.concern)) ? MARK_SAFETY_LINE : null;
}
