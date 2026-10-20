import fs from "node:fs";
import { describe, expect, test } from "vitest";
import { fixturePath, listFixturePersonas, loadFixtureAnalysis } from "./fixtures";

describe("YouCam fixtures", () => {
  test("both personas load (HD, and SD for p2b)", () => {
    expect(listFixturePersonas()).toEqual(expect.arrayContaining(["p2b", "p3a"]));
    expect(loadFixtureAnalysis("p2b", "hd").task_status).toBe("success");
    expect(loadFixtureAnalysis("p2b", "sd").task_status).toBe("success");
    expect(loadFixtureAnalysis("p3a", "hd").task_status).toBe("success");
  });

  test("the HD analysis has an age-spot item whose mask file exists", () => {
    for (const persona of listFixturePersonas()) {
      const spot = loadFixtureAnalysis(persona, "hd").results.output.find((o) => o.type === "hd_age_spot");
      expect(spot?.mask_urls).toHaveLength(1);
      expect(fs.existsSync(fixturePath(persona, spot!.mask_urls![0]))).toBe(true);
    }
  });

  test("scores are numbers even where the recording stored strings", () => {
    const output = loadFixtureAnalysis("p2b", "hd").results.output;
    for (const item of output) {
      for (const value of [item.raw_score, item.ui_score, item.score]) {
        if (value !== undefined) expect(typeof value).toBe("number");
      }
    }
    expect(output.find((o) => o.type === "hd_eye_bag")?.raw_score).toBeCloseTo(52.43487358093262, 10);
  });

  test("fixturePath refuses to leave the persona folder", () => {
    expect(() => fixturePath("p2b", "../p3a/input.jpg")).toThrow();
    expect(() => fixturePath("../x", "input.jpg")).toThrow();
  });
});
