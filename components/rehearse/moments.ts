/**
 * The plain logic of the day view: where a moment sits on the ribbon, what its headline and chip say, which tip it carries,
 * and what needs no cover. Pure, so the numbers and words are testable without a browser.
 */
import type { ConcernId } from "@/lib/contracts/concerns";
import type { Claim, DayPlan, FreeFixResult, ObserveResult, PlannedMoment } from "@/lib/contracts/rehearse";
import { concernBe, concernName } from "@/lib/copy/concerns";
import { FREE_FIX_GOAL, noNeedToCover, noNeedToCoverDay, observeOf } from "@/lib/rehearse";
import { isFreeFix } from "./results";

// ---------------------------------------------------------------------------------------------------------------
// The ribbon: where each moment sits between dawn and night.
// ---------------------------------------------------------------------------------------------------------------

/** The ribbon runs from 6am to midnight. */
export const RIBBON_FROM_H = 6;
export const RIBBON_TO_H = 24;

const EVENING_WORDS = /\b(dinner|drinks|evening|night|date|party|supper|cocktails?|dancing|show|movie|concert)\b/i;
const WORD_HOURS: [RegExp, number][] = [
  [/\bbreakfast\b/i, 8],
  [/\b(morning|standup|stand-up)\b/i, 9],
  [/\b(noon|lunch|midday)\b/i, 12.5],
  [/\bafternoon\b/i, 15],
  [/\bafter work\b/i, 18],
  [/\b(dinner|supper|evening|drinks|cocktails?|party|dancing)\b/i, 19],
  [/\bnight\b/i, 21],
];

/**
 * The hour of day (0 to 24) a moment names, or null. "9am" is 9, "12:30" is 12.5, and a bare "7" is the evening when the words
 * around it say dinner, drinks or a date, and the morning otherwise (1 to 6 are read as afternoon: nobody starts at 3am).
 */
export function parseHour(time: string | null, title = ""): number | null {
  const words = `${time ?? ""} ${title}`;
  const m = time?.match(/(\d{1,2})(?:[:.](\d{2}))?\s*(a\.?m\.?|p\.?m\.?)?/i);
  if (m) {
    const h = Number(m[1]);
    const min = m[2] ? Number(m[2]) : 0;
    if (h <= 24 && min < 60) {
      const suffix = m[3]?.[0]?.toLowerCase();
      let hour = h;
      if (suffix === "p" && h < 12) hour = h + 12;
      else if (suffix === "a" && h === 12) hour = 0;
      else if (!suffix && h >= 1 && h <= 6) hour = h + 12;
      else if (!suffix && h >= 7 && h <= 11 && EVENING_WORDS.test(words)) hour = h + 12;
      return Math.min(RIBBON_TO_H, Math.max(RIBBON_FROM_H, hour + min / 60));
    }
  }
  for (const [re, hour] of WORD_HOURS) if (re.test(words)) return hour;
  return null;
}

const MIN_GAP = 0.09;
const EDGE = 0.045;

/** Where each moment's marker goes along the ribbon, 0 to 1, in plan order: by its time, spread evenly where it has none, never overlapping. */
export function ribbonPositions(moments: readonly { time: string | null; title: string }[]): number[] {
  const n = moments.length;
  if (n === 0) return [];
  const round = (x: number) => Math.round(x * 1000) / 1000;
  const known = moments.map((m) => parseHour(m.time, m.title));
  const raw: (number | null)[] = known.map((h) => (h === null ? null : (h - RIBBON_FROM_H) / (RIBBON_TO_H - RIBBON_FROM_H)));
  // No times at all: even spacing across the day.
  if (raw.every((x) => x === null)) return moments.map((_, i) => round(n === 1 ? 0.5 : EDGE + ((1 - 2 * EDGE) * i) / (n - 1)));

  // A moment without a time sits halfway between its neighbours that have one.
  const xs = raw.map((x, i) => {
    if (x !== null) return x;
    let a = i - 1;
    while (a >= 0 && raw[a] === null) a--;
    let b = i + 1;
    while (b < n && raw[b] === null) b++;
    const left = a >= 0 ? (raw[a] as number) : null;
    const right = b < n ? (raw[b] as number) : null;
    if (left !== null && right !== null) return left + ((right - left) * (i - a)) / (b - a);
    if (left !== null) return left + 0.12 * (i - a);
    return (right as number) - 0.12 * (b - i);
  });

  // Keep order and spacing: push right, then pull back from the far edge.
  const out = xs.map((x) => Math.min(1 - EDGE, Math.max(EDGE, x)));
  for (let i = 1; i < n; i++) out[i] = Math.max(out[i], out[i - 1] + MIN_GAP);
  if (out[n - 1] > 1 - EDGE) {
    out[n - 1] = 1 - EDGE;
    for (let i = n - 2; i >= 0; i--) out[i] = Math.min(out[i], out[i + 1] - MIN_GAP);
  }
  return out.map(round);
}

// ---------------------------------------------------------------------------------------------------------------
// Words.
// ---------------------------------------------------------------------------------------------------------------

/** "a", "a and b", "a, b and c". */
export function joinList(items: readonly string[]): string {
  if (items.length < 2) return items.join("");
  return `${items.slice(0, -1).join(", ")} and ${items[items.length - 1]}`;
}

const capital = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

/** Concerns a typical viewer can still pick out in this scene: most visible first. A soft area counts when it is seen at all. */
export function stillShows(observe: ObserveResult): ObserveResult["concerns"] {
  return observe.concerns
    .filter((c) => c.targetCount > 0 && (c.soft ? c.typicalShare > 0 : c.typicalShare > FREE_FIX_GOAL))
    .sort((a, b) => b.typicalShare - a.typicalShare);
}

/**
 * The one sentence under the picture. The checked headline when the plan has one; for plans recorded before headlines
 * existed, a kind line written from the numbers (no digits, so it needs no check).
 */
export function headlineFor(moment: PlannedMoment, observe: ObserveResult | null): string {
  const checked = moment.headline?.text.trim();
  if (checked) return checked;
  if (!observe) return "Here is how you look from there.";
  const shows = stillShows(observe);
  const call = observe.input.scene === "video_call";
  if (shows.length === 0) return call ? "On the call, the fine detail stays soft." : "From here, the fine detail stays soft.";
  const names = shows.map((c) => concernName(c.concern));
  if (shows.length === 1) {
    const be = concernBe(shows[0].concern);
    return `${capital(names[0])} ${be} what can still be picked out; the rest stays soft.`;
  }
  if (shows.length === 2) return `${capital(joinList(names))} can still be picked out; the rest stays soft.`;
  return "A few things can still be picked out; most of the detail stays soft.";
}

export type ChipKind = "none" | "tip" | "touch";

export interface MomentChip {
  kind: ChipKind;
  label: string;
  /** What the chip reveals when opened; null for "Nothing to do". */
  claim: Claim | null;
}

export function chipFor(moment: PlannedMoment): MomentChip {
  switch (moment.action.kind) {
    case "none":
      return { kind: "none", label: "Nothing to do", claim: null };
    case "free_fix":
      return { kind: "tip", label: "One small tip", claim: moment.action.claim };
    default:
      return { kind: "touch", label: "If you’d like", claim: moment.action.claim };
  }
}

/** The scene after the tip, when the moment has a free fix that works: the model's own re-run (`FreeFixResult.after`). */
export function tipFor(plan: DayPlan, moment: PlannedMoment): { fix: FreeFixResult; after: ObserveResult } | null {
  if (moment.action.kind !== "free_fix") return null;
  const fix = plan.results[moment.action.ref];
  if (!isFreeFix(fix) || !fix.reachable || !fix.to) return null;
  return { fix, after: fix.after };
}

/** "pores, redness and dark spots" for the concerns that need no cover at a moment. */
export function noNeedLine(observe: ObserveResult | null): string | null {
  if (!observe) return null;
  const ids = noNeedToCover(observe);
  return ids.length ? joinList(ids.map((id) => concernName(id))) : null;
}

export interface CoverLine {
  concern: ConcernId;
  name: string;
  /** "all day", or "at" the titles of the moments. */
  when: string;
  allDay: boolean;
}

/** The end-of-day lines: each coverable concern that needs no cover in at least one moment, all-day ones first. */
export function coverLines(plan: DayPlan): CoverLine[] {
  const title = new Map(plan.moments.map((m) => [m.id, m.title]));
  return noNeedToCoverDay(plan).map((c) => ({
    concern: c.concern,
    name: capital(concernName(c.concern)),
    allDay: c.allDay,
    when: c.allDay ? "all day" : `at ${joinList(c.momentIds.map((id) => title.get(id) ?? "").filter(Boolean))}`,
  }));
}

export { observeOf };
