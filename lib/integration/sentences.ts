/** The deterministic sentences stored in a bundle: concern lines (with YouCam's score), "Worth it?" lines, and the summary. */
import type { SkinAnalysis, VisibilityReport } from "@/lib/contracts";
import { describeConcern, describeWorthIt, summaryLine, youcamScoreOf } from "@/lib/copy";
import type { BundleSentences, WorthItEntry } from "./types";

export function buildSentences(report: VisibilityReport, analysis: SkinAnalysis, worthIt: readonly WorthItEntry[]): BundleSentences {
  const concerns: BundleSentences["concerns"] = {};
  for (const cv of report.concerns) {
    concerns[cv.concern] = describeConcern(cv, { youcamScore: youcamScoreOf(analysis.results, cv.concern) });
  }
  const worth: BundleSentences["worthIt"] = {};
  for (const w of worthIt) {
    worth[w.concern] = describeWorthIt({
      concern: w.concern,
      targetCount: w.targetCount,
      differenceMaxDistanceM: w.whatIf.differenceMaxDistanceM ?? 0,
      differenceProfile: w.whatIf.differenceProfile,
    });
  }
  return { concerns, worthIt: worth, summary: summaryLine(report) };
}
