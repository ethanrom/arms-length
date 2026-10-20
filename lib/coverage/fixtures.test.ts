// Recorded renders (fixtures/youcam), no live calls: registration against the measured offsets, and the coverage search
// end to end on p2b with the replay adapter.
import fs from "node:fs";
import { describe, expect, test } from "vitest";
import { DEFAULT_VIEWING, type ScaleEstimate } from "../contracts";
import { decodeImage, loadPersona } from "../skin/fixtures-io";
import { measureAnalysis } from "../skin/measure";
import { remeasure } from "../skin/remeasure";
import { fixturePath } from "../youcam/fixtures";
import { buildVisibilityReport } from "../vision/report";
import { concernDistance } from "./common";
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
  test("age-spot visibility falls monotonically with coverage; the plan stops at the least coverage that meets a target", { timeout: 120_000 }, async () => {
    const scale = scaleOf("p2b");
    const { analysis, masks, photo } = await loadPersona("p2b");
    const base = measureAnalysis(analysis, masks, photo, scale);
    const render = replayMakeupRender("p2b");

    // Age spots: the strongest mark (a dark mole) is beyond the 10 m cap at every level, so check the max does not rise
    // and the median falls strictly.
    const levels: { max: number; median: number }[] = [];
    const baseline = remeasure(base, photo, { dx: 0, dy: 0 }, { frame: photo });
    const summary = (m: typeof base) => buildVisibilityReport(m, DEFAULT_VIEWING).concerns.find((c) => c.concern === "age_spot")!;
    levels.push({ max: summary(baseline).maxDistanceM, median: summary(baseline).medianDistanceM });
    for (const coverage of [25, 50, 75, 100]) {
      const lever = { category: "foundation", field: "coverageIntensity", value: coverage };
      const rendered = await render(lever, [{ category: "foundation", palettes: [{ coverageIntensity: coverage }] }]);
      const found = registerRender(photo, rendered.photo);
      expect(found.ncc).toBeGreaterThan(0.85);
      const after = summary(remeasure(base, rendered.photo, found, { frame: photo }));
      levels.push({ max: after.maxDistanceM, median: after.medianDistanceM });
    }
    for (let i = 1; i < levels.length; i++) {
      expect(levels[i].max).toBeLessThanOrEqual(levels[i - 1].max + 1e-9);
      expect(levels[i].median).toBeLessThan(levels[i - 1].median);
    }

    // Pores: the whole search through the replay adapter. Targets are placed between the measured steps.
    const request = { concern: "pore" as const, base, scale, viewing: DEFAULT_VIEWING, photo, render };
    const unreachable = await planCoverage({ ...request, targetDistanceM: 0.1 });
    expect(unreachable.status).toBe("not_met");
    expect(unreachable.steps.map((s) => s.lever.value)).toEqual([50, 75, 100]);
    expect(unreachable.steps[0].render.offset).toEqual({ dx: 0, dy: 1 }); // measured, not assumed
    const [d50, d75, d100] = unreachable.steps.map((s) => s.maxDistanceM);
    expect(unreachable.baselineDistanceM).toBeGreaterThan(d50);
    expect(d50).toBeGreaterThan(d75);
    expect(d75).toBeGreaterThan(d100);

    const reachable = await planCoverage({ ...request, targetDistanceM: (d50 + d75) / 2 });
    expect(reachable.status).toBe("met");
    expect(reachable.chosen?.lever.value).toBe(75);
    expect(reachable.steps.map((s) => s.lever.value)).toEqual([50, 75]);
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
    expect(result.beforeDistanceM).toBeCloseTo(concernDistance(base, "dark_circle", DEFAULT_VIEWING).maxDistanceM, 6);
    expect(result.afterDistanceM).toBeLessThanOrEqual(result.beforeDistanceM);
    expect(result.render.offset).toEqual({ dx: 0, dy: 0 });
  });
});
