/** Number formatting shared by the /science widgets: the same rounding as the receipt (lib/integration/receipt.ts). */

export const fmtMm = (v: number): string => (v < 1 ? v.toFixed(2) : v < 10 ? v.toFixed(1) : String(Math.round(v)));
export const fmtPct = (v: number): string => (v < 10 ? v.toFixed(1) : String(Math.round(v)));
export const fmtArcmin = (v: number): string => (v < 10 ? v.toFixed(1) : String(Math.round(v)));
export const fmtDb = (v: number): string => `${v >= 0 ? "+" : "−"}${Math.abs(v).toFixed(1)} dB`;
export const fmtRatio = (v: number): string => `×${v.toFixed(2)}`;

/** A distance for readouts that must not hide the model's own value behind the 10 m contract cap: "3.23 m", "48 cm". */
export function fmtMetres(m: number): string {
  if (!Number.isFinite(m) || m <= 0) return "0 cm";
  if (m < 1) return `${Math.round(m * 100)} cm`;
  if (m < 10) return `${m.toFixed(2)} m`;
  return `${m < 100 ? m.toFixed(1) : Math.round(m)} m`;
}

/** Rounds a slider distance to a value people say: 1.5 m, 2.5 m, 40 cm. Keeps "At 1.5 m" true to the number behind it. */
export function niceDistance(m: number): number {
  if (m < 0.5) return Math.round(m * 100) / 100;
  if (m < 1) return Math.round(m * 50) / 50;
  if (m < 3) return Math.round(m * 20) / 20;
  return Math.round(m * 10) / 10;
}
