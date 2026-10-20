/** Our numbers for Test A: the same code path as scripts/dev/pipeline.ts (every target measured against its surround). */
import fs from "node:fs";
import path from "node:path";
import { DEFAULT_VIEWING } from "@/lib/contracts";
import { loadPersona } from "@/lib/skin/fixtures-io";
import { measureAnalysis } from "@/lib/skin/measure";
import { rawDistances, type TargetSpec } from "@/lib/vision";
import { buildVisibilityReport } from "@/lib/vision/report";

export interface OurConcern {
  targetCount: number;
  /** Bound (marginDb 6) of the farthest target, capped at 10 m by the contract. */
  maxDistanceM: number;
  medianDistanceM: number;
  /** Targets still detectable at 1.5 m (bound), and their share. */
  countAt1_5m: number;
  fractionAt1_5m: number;
}

export type OurPersona = Record<string, OurConcern>;

export async function ourPersona(persona: string): Promise<OurPersona> {
  const p = await loadPersona(persona, "hd");
  const scale = JSON.parse(fs.readFileSync(path.join("fixtures/youcam", persona, "scale.json"), "utf8"));
  const m = measureAnalysis(p.analysis, p.masks, p.photo, scale);
  const r = buildVisibilityReport(m, DEFAULT_VIEWING);
  const out: OurPersona = {};
  for (const c of r.concerns) {
    const at = c.profile?.find((x) => x.distanceM === 1.5);
    out[c.concern] = {
      targetCount: c.targetCount,
      maxDistanceM: round(c.maxDistanceM),
      medianDistanceM: round(c.medianDistanceM),
      countAt1_5m: at?.count ?? 0,
      fractionAt1_5m: round(at?.fraction ?? 0),
    };
  }
  return out;
}

const round = (x: number) => Math.round(x * 1e4) / 1e4;

export interface PatchTruth {
  /** Average observer (marginDb 0). */
  nominalM: number;
  /** One-sided bound (marginDb 6, luminance factor max(1, g)). */
  boundM: number;
}

/**
 * Ground truth for a uniform dark disk: published Standard A model (Watson & Ahumada 2005), DEFAULT_VIEWING (45 cd/m^2,
 * 20/20). Uncapped by the 10 m contract clamp, so the size law stays visible at the far end.
 */
export function diskTruth(diameterMm: number, weberContrast: number): PatchTruth {
  const spec: TargetSpec = { id: "disk", concern: "age_spot", shape: "disk", sizeMm: diameterMm, lum: -weberContrast, rg: 0, yv: 0, chromatic: false };
  const { nominal, bound } = rawDistances(spec, DEFAULT_VIEWING);
  return { nominalM: nominal, boundM: bound };
}
