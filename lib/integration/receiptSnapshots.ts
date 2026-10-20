/** Default-distance receipts for a bundle: a snapshot of lib/integration/receipt.ts for inspection and tests. */
import type { Measurements, ScaleEstimate, ViewingConditions, VisibilityReport } from "@/lib/contracts";
import { TABLE_M } from "@/lib/copy";
import { buildReceipt } from "./receipt";
import type { ReceiptSnapshot } from "./types";

export const RECEIPT_DISTANCES_M = [0.6, 1, 1.5, 2.5, 4, 6];
export const DEFAULT_RECEIPT_M = TABLE_M;

export function receiptSnapshots(
  measurements: Measurements,
  report: VisibilityReport,
  scale: ScaleEstimate = measurements.scale,
  viewing: ViewingConditions = report.viewing,
  distanceM = DEFAULT_RECEIPT_M,
): ReceiptSnapshot[] {
  const out: ReceiptSnapshot[] = [];
  for (const c of report.concerns) {
    const id = c.topTargets[0];
    const target = measurements.features.find((f) => f.id === id) ?? measurements.regions.find((r) => r.id === id);
    const r = target ? buildReceipt(target, scale, viewing, distanceM) : null;
    if (!r) continue;
    out.push({
      concern: r.concern,
      targetId: r.targetId,
      distanceM,
      sizeMm: Math.round(r.sizeMm * 1000) / 1000,
      contrastPct: Math.round(r.contrastPct * 10) / 10,
      angleArcmin: Math.round(r.angleArcmin * 100) / 100,
      thresholdPct: Math.round(r.thresholdPct * 10) / 10,
      visible: r.visible,
    });
  }
  return out;
}
