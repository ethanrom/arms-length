import fs from "node:fs";
import { describe, expect, test } from "vitest";
import { fixturePath } from "./fixtures";
import { parseFileRef } from "./fileref";
import { renderOffset } from "./render";
import { replayAnalysis, replayMakeup, replaySimulation } from "./replay";

const foundation = (coverageIntensity: number) => ({
  category: "foundation",
  palettes: [{ color: "#8a5840", colorIntensity: 50, glowIntensity: 0, coverageIntensity }],
});
const concealer = (coverageLevel: number) => ({
  category: "concealer",
  palettes: [{ color: "#8a5840", colorIntensity: 50, colorUnderEyeIntensity: 50, coverageLevel }],
});

/** The recorded PNG for a persona-relative path, as the data URL the replay should return. */
const recordedDataUrl = (persona: string, rel: string) =>
  `data:image/png;base64,${fs.readFileSync(fixturePath(persona, rel)).toString("base64")}`;

describe("replay", () => {
  test("a persona analysis serves recorded scores with every mask inlined as a data URL, for free", async () => {
    const response = await replayAnalysis("p2b");
    expect(response).toMatchObject({ fileRef: "persona:p2b", unitsCharged: 0, source: "replay" });
    expect(response.analysis.frame).toEqual({ width: 1080, height: 1341 });
    expect(response.analysis.results).toHaveLength(17);
    expect(Object.keys(response.masks)).toHaveLength(17);
    for (const result of response.analysis.results) {
      expect(response.masks[result.maskRef!]).toMatch(/^data:image\/png;base64,/);
    }
    expect(response.masks.hd_pore_whole).toBe(recordedDataUrl("p2b", "masks/hd/hd_pore_whole.png"));

    expect((await replayAnalysis("p2b", "sd")).analysis.engine).toBe("sd");
    expect((await replayAnalysis("p3a", "sd")).analysis.engine).toBe("hd"); // no SD recording: HD answers

    await expect(replayAnalysis("nobody")).rejects.toMatchObject({ code: "unknown_persona", status: 404 });
    await expect(replayAnalysis("../p3a")).rejects.toMatchObject({ code: "unknown_persona" });
  });

  test("makeup returns the recorded render of the same category with the nearest parameter", async () => {
    const low = await replayMakeup("p2b", [foundation(40)]); // recorded: 30 and 80
    expect(low.imageRef).toBe(recordedDataUrl("p2b", "renders/mu_foundation_cov30.png"));
    const high = await replayMakeup("p2b", [foundation(70)]);
    expect(high.imageRef).toBe(recordedDataUrl("p2b", "renders/mu_foundation_cov80.png"));

    // A skin_smooth effect is not the lever, so it is ignored; concealer matches on coverageLevel (20, 50, 90).
    const conc = await replayMakeup("p2b", [{ category: "skin_smooth", skinSmoothStrength: 0 }, concealer(60)]);
    expect(conc.imageRef).toBe(recordedDataUrl("p2b", "renders/mu_concealer_cov50.png"));
    expect(conc).toMatchObject({ source: "replay", unitsCharged: 0, width: 1080, height: 1340, offset: { dx: 0, dy: 1 } });

    await expect(replayMakeup("p2b", [{ category: "blush" }])).rejects.toMatchObject({ code: "no_replay_render" });
    await expect(replayMakeup("p3a", [foundation(50)])).rejects.toMatchObject({ code: "no_replay_render" });
  });

  test("simulation returns the closest recording and is pixel-aligned (offset 0)", async () => {
    const render = await replaySimulation("p3a", { spots: 0.4, redness: 0.6 });
    expect(render.imageRef).toBe(recordedDataUrl("p3a", "renders/sim_spots05_redness05.png"));
    expect(render).toMatchObject({ width: 1080, height: 1575, offset: { dx: 0, dy: 0 }, source: "replay" });
    await expect(replaySimulation("p2b", { spots: 0.5 })).rejects.toMatchObject({ code: "no_replay_render" });
  });

  test("file refs and render offsets", () => {
    expect(parseFileRef("persona:p2b")).toEqual({ kind: "persona", id: "p2b" });
    expect(parseFileRef("persona:../x")).toBeNull();
    expect(parseFileRef(`live:1080x1341:${"A".repeat(64)}`)).toEqual({
      kind: "live",
      fileId: "A".repeat(64),
      frame: { width: 1080, height: 1341 },
    });
    expect(parseFileRef("A".repeat(64))).toMatchObject({ kind: "live", frame: null });
    expect(parseFileRef("short")).toBeNull();

    const frame = { width: 1080, height: 1341 };
    expect(renderOffset("makeup", frame, { width: 1080, height: 1340 })).toEqual({ dx: 0, dy: 1 });
    expect(renderOffset("makeup", null, { width: 1080, height: 1340 })).toEqual({ dx: 0, dy: 1 });
    expect(renderOffset("simulation", frame, frame)).toEqual({ dx: 0, dy: 0 });
    expect(renderOffset("makeup", { width: 2400, height: 3000 }, { width: 1536, height: 1920 })).toEqual({ dx: 0, dy: 0 });
  });
});
