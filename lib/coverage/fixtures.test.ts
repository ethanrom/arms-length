// Recorded renders (fixtures/youcam), no live calls: registration against the measured offsets, and the coverage search
// end to end on p2b with the replay adapter.
import fs from "node:fs";
import { describe, expect, test } from "vitest";
import { DEFAULT_VIEWING, type ScaleEstimate } from "../contracts";
import { decodeImage, loadPersona } from "../skin/fixtures-io";
import { measureAnalysis } from "../skin/measure";
import { remeasure } from "../skin/remeasure";
import { fixturePath } from "../youcam/fixtures";
import { concernStats, DEFAULT_TARGET_DISTANCE_M } from "./common";
import { planCoverage } from "./plan";
import { registerRender } from "./register";
import { replayMakeupRender, replaySimulationRender } from "./replayRender";
import { whatIf } from "./whatif";

const scaleOf = (persona: string): ScaleEstimate => {
  const s = JSON.parse(fs.readFileSync(fixturePath(persona, "scale.json"), "utf8"));
  return { mmPerPx: s.mmPerPx, relSd: s.relSd, source: "iris", irisPx: s.irisPx };
};

describe("registerRender on the recorded renders", () => {
  // p2b: +1 row and a black first row; p3a: 1078x1576 for a 1080x1575 input, dx -3; p1a: unshifted.
  // mu_foundation_cov80 has default smoothing and brightening, the hardest case for correlation.
  const renders = [
    ["p2b", "foundation_cov50.png"],
    ["p2b", "mu_foundation_cov80.png"],
    ["p2b", "sim_dark_circle05.png"],
    ["p3a", "foundation_cov50.png"],
    ["p3a", "sim_spots05_redness05.png"],
    ["p1a", "foundation_cov50.png"],
    ["p1a", "sim_acne05_redness05.png"],
  ] as const;

  test.each(renders)("%s/%s agrees with offsets.json", async (persona, name) => {
    const measured = JSON.parse(fs.readFileSync(fixturePath(persona, "renders/offsets.json"), "utf8")).renders[name];
    const input = await decodeImage(fixturePath(persona, "input.jpg"));
    const found = registerRender(input, await decodeImage(fixturePath(persona, `renders/${name}`)));
    expect({ dx: found.dx, dy: found.dy }).toEqual({ dx: measured.dx, dy: measured.dy });
    expect(found.ncc).toBeGreaterThan(0.85);
    // The valid region excludes the black padding the service adds.
    const edges = measured.blackEdges;
    expect(found.valid).toEqual({
      x: Math.max(0, edges.left - measured.dx),
      y: Math.max(0, edges.top - measured.dy),
      w: Math.min(input.width, measured.size[0] - edges.right - measured.dx) - Math.max(0, edges.left - measured.dx),
      h: Math.min(input.height, measured.size[1] - edges.bottom - measured.dy) - Math.max(0, edges.top - measured.dy),
    });
  });
});

describe("p2b with the recorded foundation grid", () => {
  test("age-spot and pore visibility fall monotonically with coverage; the plan follows the 10% and knee rules", { timeout: 120_000 }, async () => {
    const scale = scaleOf("p2b");
    const { analysis, masks, photo } = await loadPersona("p2b");
    const base = measureAnalysis(analysis, masks, photo, scale);
    const render = replayMakeupRender("p2b");

    // The share of marks still detectable at 1.5 m, and the farthest one (the strongest mole sits at the 10 m cap at every
    // level, so the max can only be checked not to rise).
    const baseline = remeasure(base, photo, { dx: 0, dy: 0 }, { frame: photo });
    const grid: Record<"age_spot" | "pore", { fraction: number; max: number }[]> = { age_spot: [], pore: [] };
    for (const concern of ["age_spot", "pore"] as const) {
      const s = concernStats(baseline, concern, DEFAULT_VIEWING, DEFAULT_TARGET_DISTANCE_M);
      grid[concern].push({ fraction: s.fractionAtTarget, max: s.maxDistanceM });
    }
    for (const coverage of [25, 50, 75, 100]) {
      const lever = { category: "foundation", field: "coverageIntensity", value: coverage };
      const rendered = await render(lever, [{ category: "foundation", palettes: [{ coverageIntensity: coverage }] }]);
      const found = registerRender(photo, rendered.photo);
      expect(found.ncc).toBeGreaterThan(0.85);
      const after = remeasure(base, rendered.photo, found, { frame: photo });
      for (const concern of ["age_spot", "pore"] as const) {
        const s = concernStats(after, concern, DEFAULT_VIEWING, DEFAULT_TARGET_DISTANCE_M);
        grid[concern].push({ fraction: s.fractionAtTarget, max: s.maxDistanceM });
      }
    }
    for (const concern of ["age_spot", "pore"] as const) {
      for (let i = 1; i < grid[concern].length; i++) {
        expect(grid[concern][i].fraction).toBeLessThan(grid[concern][i - 1].fraction + 1e-9);
        expect(grid[concern][i].max).toBeLessThanOrEqual(grid[concern][i - 1].max + 1e-9);
      }
      expect(grid[concern][4].fraction).toBeLessThan(grid[concern][0].fraction); // full coverage helps
    }

    // Pores at the default 1.5 m: the whole search through the replay adapter. Full coverage still leaves more than 10%.
    const request = { concern: "pore" as const, base, scale, viewing: DEFAULT_VIEWING, photo, render };
    const plan = await planCoverage(request);
    expect(plan.targetDistanceM).toBe(1.5);
    expect(plan.status).toBe("not_met");
    expect(plan.steps.map((s) => s.lever.value)).toEqual([50, 75, 100]);
    expect(plan.steps[0].render.offset).toEqual({ dx: 0, dy: 1 }); // measured, not assumed
    const fractions = plan.steps.map((s) => s.fractionAtTarget!);
    expect(plan.baselineFraction!).toBeGreaterThan(fractions[0]);
    expect(fractions[0]).toBeGreaterThan(fractions[1]);
    expect(fractions[1]).toBeGreaterThan(fractions[2]);
    expect(fractions[2]).toBeGreaterThan(0.1);
    // The knee: the lowest rendered coverage reaching 80% of the reduction at 100.
    const reduction = (f: number) => plan.baselineFraction! - f;
    const knee = plan.steps.filter((s) => reduction(s.fractionAtTarget!) >= 0.8 * reduction(fractions[2]) - 1e-9);
    expect(plan.chosen?.lever.value).toBe(Math.min(...knee.map((s) => s.lever.value)));

    // A reachable target (2.5 m): the lowest coverage at or under 10% is chosen.
    const reachable = await planCoverage({ ...request, targetDistanceM: 2.5 });
    expect(reachable.status).toBe("met");
    expect(reachable.chosen!.fractionAtTarget!).toBeLessThanOrEqual(0.1);
    for (const s of reachable.steps) {
      if (s.lever.value < reachable.chosen!.lever.value) expect(s.fractionAtTarget!).toBeGreaterThan(0.1);
    }
  });

  test("a what-if on p2b dark circles uses the recorded simulation, re-measured with the masks", { timeout: 120_000 }, async () => {
    const scale = scaleOf("p2b");
    const { analysis, masks, photo } = await loadPersona("p2b");
    const base = measureAnalysis(analysis, masks, photo, scale);
    const result = await whatIf({
      concern: "dark_circle",
      base,
      scale,
      viewing: DEFAULT_VIEWING,
      photo,
      geometry: { analysis, masks },
      render: replaySimulationRender("p2b"),
    });
    expect(result.strengths).toEqual({ dark_circle: 0.5 });
    expect(result.beforeDistanceM).toBeCloseTo(concernStats(base, "dark_circle", DEFAULT_VIEWING, 1.5).maxDistanceM, 6);
    expect(result.afterDistanceM).toBeLessThanOrEqual(result.beforeDistanceM);
    expect(result.afterFraction).toBeLessThanOrEqual(result.beforeFraction);
    expect(result.render.offset).toEqual({ dx: 0, dy: 0 });
  });
});
