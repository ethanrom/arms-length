/** The deterministic sentences stored in a bundle: concern lines, "Worth it?" lines, and the summary. All from lib/copy. */
import type { VisibilityReport } from "@/lib/contracts";
import { describeConcern, describeWorthIt, summaryLine, type WorthItInput } from "@/lib/copy";
import type { BundleSentences, WorthItEntry } from "./types";

/** What lib/copy needs to word one "Worth it?" entry: the bound and the typical-observer numbers. */
export function worthItInput(w: WorthItEntry): WorthItInput {
  return {
    concern: w.concern,
    targetCount: w.targetCount,
    differenceMaxDistanceM: w.whatIf.differenceMaxDistanceM ?? 0,
    differenceProfile: w.whatIf.differenceProfile,
    differenceNominalMaxDistanceM: w.whatIf.differenceNominalMaxDistanceM,
    differenceNominalProfile: w.whatIf.differenceNominalProfile,
  };
}

export function buildSentences(report: VisibilityReport, worthIt: readonly WorthItEntry[]): BundleSentences {
  const concerns: BundleSentences["concerns"] = {};
  for (const cv of report.concerns) concerns[cv.concern] = describeConcern(cv);
  const worth: BundleSentences["worthIt"] = {};
  for (const w of worthIt) worth[w.concern] = describeWorthIt(worthItInput(w));
  return { concerns, worthIt: worth, summary: summaryLine(report) };
}
