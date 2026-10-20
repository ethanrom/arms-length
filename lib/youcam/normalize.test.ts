import { describe, expect, test } from "vitest";
import { CONCERNS, type ConcernId } from "@/lib/contracts";
import { fixturePath, loadFixtureAnalysis } from "./fixtures";
import { sniffImage } from "./imageinfo";
import { normalizeAnalysis, resizeImageSource } from "./normalize";
import fs from "node:fs";

const frameOf = (persona: string) => {
  const info = sniffImage(new Uint8Array(fs.readFileSync(fixturePath(persona, "input.jpg"))))!;
  return { width: info.width, height: info.height };
};

describe("normalizeAnalysis", () => {
  test("p2b HD: 17 results, regions default to whole, skin age and overall split out, scores numeric", () => {
    const recorded = loadFixtureAnalysis("p2b", "hd");
    const { analysis, maskSources } = normalizeAnalysis(recorded.results.output, "hd", frameOf("p2b"));

    expect(analysis.engine).toBe("hd");
    expect(analysis.frame).toEqual({ width: 1080, height: 1341 });
    expect(analysis.results).toHaveLength(17); // 8 concerns, with pore and wrinkle expanded into regions
    expect(analysis.skinAge).toBe(46);
    expect(analysis.overall).toBe(71.125);

    const spot = analysis.results.find((r) => r.concern === "age_spot")!;
    expect(spot).toMatchObject({ region: "whole", maskRef: "hd_age_spot", rawScore: 72.62026977539062, uiScore: 71 });
    const poreRegions = analysis.results.filter((r) => r.concern === "pore").map((r) => r.region).sort();
    expect(poreRegions).toEqual(["cheek", "forehead", "nose", "whole"]);
    expect(analysis.results.find((r) => r.concern === "pore" && r.region === "forehead")!.rawScore).toBe(0);
    expect(analysis.results.every((r) => typeof r.rawScore === "number" && typeof r.uiScore === "number")).toBe(true);

    expect(maskSources.hd_pore_whole).toBe("masks/hd/hd_pore_whole.png");
    expect(Object.keys(maskSources)).toHaveLength(17);
    expect(resizeImageSource(recorded.results.output)).toBe("input.jpg");
  });

  test("p3a HD and p2b SD map to the same concern ids", () => {
    const p3a = normalizeAnalysis(loadFixtureAnalysis("p3a", "hd").results.output, "hd", frameOf("p3a"));
    expect(p3a.analysis.frame).toEqual({ width: 1080, height: 1575 });
    expect(p3a.analysis.skinAge).toBe(60);
    expect(p3a.analysis.overall).toBe(74);
    expect(p3a.analysis.results.find((r) => r.concern === "dark_circle")!.rawScore).toBeCloseTo(90.27584195137024, 10);

    const sd = normalizeAnalysis(loadFixtureAnalysis("p2b", "sd").results.output, "sd", frameOf("p2b"));
    const concerns = new Set<ConcernId>(sd.analysis.results.map((r) => r.concern));
    expect(concerns).toEqual(new Set(Object.keys(CONCERNS) as ConcernId[]));
    expect(sd.analysis.results.find((r) => r.concern === "dark_circle")!.maskRef).toBe("dark_circle_v2");
  });

  test("tolerates unknown types, missing scores, string scores and items without masks", () => {
    const { analysis, maskSources } = normalizeAnalysis(
      [
        { type: "hd_redness", raw_score: "99.123456789012345", ui_score: "98", mask_urls: [] },
        { type: "hd_future_concern", raw_score: 1, ui_score: 1, mask_urls: ["x.png"] },
        { type: "hd_acne", region: "whole", mask_urls: ["a.png"] },
        { type: "skin_age", score: "not a number" },
        null,
      ],
      "hd",
      { width: 10, height: 10 },
    );
    expect(analysis.results).toEqual([
      { concern: "redness", region: "whole", rawScore: 99.123456789012345, uiScore: 98, maskRef: null },
    ]);
    expect(analysis.skinAge).toBeNull();
    expect(maskSources).toEqual({});
  });
});
