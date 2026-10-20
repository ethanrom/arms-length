// Shared bits of the persona recorder: paths, the render plan, the shades. No network here.
import fs from "node:fs";
import path from "node:path";
import { HD_ACTIONS } from "../../lib/contracts";

export const ROOT = process.cwd();
export const DIR = path.join(ROOT, "scripts", "personas");
export const WORK = path.join(DIR, "work"); // raw API responses and downloads (gitignored)
export const STATE = path.join(DIR, "state.json"); // task ids (gitignored)
export const FIXTURES = path.join(ROOT, "fixtures", "youcam");
export const SHADES = path.join(DIR, "shades.json");

/** Units this job may spend, from the "Demo personas" bucket (internal/LEDGER.md). */
export const CEILING_UNITS = 40;

export type Kind = "analysis" | "foundation" | "simulation";

export interface PlanItem {
  persona: string;
  kind: Kind;
  slug: string; // path after /s2s/
  /** Body without `src_file_id`. */
  body: Record<string, unknown>;
  units: number;
  /** Name in credit/history. */
  action: string;
  /** Fixture file stem under renders/ (renders only). */
  stem?: string;
}

/** skin_smooth 0/0 makes a no-makeup render bit-identical to the input (spike.md section 9). */
export const SMOOTH0 = { category: "skin_smooth", skinSmoothStrength: 0, skinSmoothColorIntensity: 0 };

export const foundation = (color: string, coverageIntensity: number) => ({
  category: "foundation",
  palettes: [{ color, colorIntensity: 50, glowIntensity: 0, coverageIntensity }],
});

/** Foundation coverage grid. p2b already has 50 and 100 at smooth 0 (spike-data lv_found_c50, lv_found_c100). */
const GRID: Record<string, number[]> = {
  p2b: [25, 75],
  p3a: [25, 50, 75, 100],
  p1a: [25, 50, 75, 100],
};

export function readShades(): Record<string, { hex: string }> {
  return fs.existsSync(SHADES) ? JSON.parse(fs.readFileSync(SHADES, "utf8")).shades : {};
}

/** label -> request. Foundation entries exist only once the persona's shade is in shades.json. */
export function buildPlan(): Record<string, PlanItem> {
  const shades = readShades();
  const plan: Record<string, PlanItem> = {
    p1a_hd: {
      persona: "p1a",
      kind: "analysis",
      slug: "v2.1/task/skin-analysis",
      body: { dst_actions: [...HD_ACTIONS], format: "json" },
      units: 16,
      action: "api_skin_analysis_hd_v2",
    },
  };
  for (const [persona, levels] of Object.entries(GRID)) {
    const hex = shades[persona]?.hex;
    if (!hex) continue;
    for (const cov of levels) {
      plan[`${persona}_found_cov${cov}`] = {
        persona,
        kind: "foundation",
        slug: "v2.0/task/makeup-vto",
        body: { version: "1.0", effects: [SMOOTH0, foundation(hex, cov)] },
        units: 1,
        action: "api_makeup_vto",
        stem: `foundation_cov${cov}`,
      };
    }
  }
  plan.p2b_sim_dark_circle05 = {
    persona: "p2b",
    kind: "simulation",
    slug: "v2.0/task/skin-simulation",
    body: { dark_circle: 0.5 },
    units: 4,
    action: "api_skin_simulation",
    stem: "sim_dark_circle05",
  };
  plan.p1a_sim_acne05_redness05 = {
    persona: "p1a",
    kind: "simulation",
    slug: "v2.0/task/skin-simulation",
    body: { acne: 0.5, redness: 0.5 },
    units: 4,
    action: "api_skin_simulation",
    stem: "sim_acne05_redness05",
  };
  return plan;
}

/** Everything the job is allowed to buy, shades or not: used for the budget check. */
export const MAX_PLANNED_UNITS = 16 + (2 + 4 + 4) * 1 + 2 * 4;
