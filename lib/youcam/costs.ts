// Unit prices from `GET /s2s/v2.0/credit/feature-cost` (spike.md section 1). Billing counts the requested
// dst_actions / strengths, not the returned masks (8 HD concerns return 17 masks and cost 16).
export type Engine = "hd" | "sd";

const HD_TIERS = [12, 16, 20, 22]; // 1-4, 5-8, 9-12, 13-16 concerns
const SD_TIERS = [9, 12, 14, 16];

export function analysisUnits(engine: Engine, concernCount: number): number {
  const tiers = engine === "hd" ? HD_TIERS : SD_TIERS;
  return tiers[Math.min(3, Math.max(0, Math.ceil(concernCount / 4) - 1))];
}

export const MAKEUP_UNITS = 1;

/** Skin Simulation: 4 units for 1-4 concerns, 6 for 5-10. */
export function simulationUnits(strengthCount: number): number {
  return strengthCount <= 4 ? 4 : 6;
}
