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
    const p1a = await replayAnalysis("p1a");
    expect(p1a.analysis.frame).toEqual({ width: 1080, height: 1610 });
    expect(Object.keys(p1a.masks)).toHaveLength(17);

    await expect(replayAnalysis("nobody")).rejects.toMatchObject({ code: "unknown_persona", status: 404 });
    await expect(replayAnalysis("../p3a")).rejects.toMatchObject({ code: "unknown_persona" });
  });

  test("makeup returns the recorded render of the same category with the nearest parameter", async () => {
    // p2b foundation recordings with smoothing off: 25, 50, 75, 100. The Phase 0 renders (30 and 80, default smoothing,
    // +23% brightening) are never served, even when they are the nearest parameter.
    const mid = await replayMakeup("p2b", [foundation(60)]);
    expect(mid.imageRef).toBe(recordedDataUrl("p2b", "renders/foundation_cov50.png"));
    const high = await replayMakeup("p2b", [foundation(95)]);
    expect(high.imageRef).toBe(recordedDataUrl("p2b", "renders/foundation_cov100.png"));
    const near30 = await replayMakeup("p2b", [foundation(30)]);
    expect(near30.imageRef).toBe(recordedDataUrl("p2b", "renders/foundation_cov25.png"));
    const p3a = await replayMakeup("p3a", [foundation(70)]); // recorded: 25, 50, 75, 100
    expect(p3a.imageRef).toBe(recordedDataUrl("p3a", "renders/foundation_cov75.png"));

    // Every concealer recording used default smoothing, so none is served.
    await expect(replayMakeup("p2b", [concealer(60)])).rejects.toMatchObject({ code: "no_replay_render" });
    await expect(replayMakeup("p2b", [{ category: "blush" }])).rejects.toMatchObject({ code: "no_replay_render" });
    await expect(replayMakeup("p3a", [concealer(50)])).rejects.toMatchObject({ code: "no_replay_render" });
  });

  test("each render carries the offset measured against its persona's input", async () => {
    expect(await replayMakeup("p2b", [foundation(50)])).toMatchObject({ width: 1080, height: 1340, offset: { dx: 0, dy: 1 } });
    // p3a: a 1078x1576 output for a 1080x1575 input, shifted 3 px left, with black padding on the right and bottom.
    expect(await replayMakeup("p3a", [foundation(50)])).toMatchObject({ width: 1078, height: 1576, offset: { dx: -3, dy: 0 } });
    expect(await replayMakeup("p1a", [foundation(50)])).toMatchObject({ width: 1080, height: 1610, offset: { dx: 0, dy: 0 } });
  });

  test("simulation returns the closest recording that changed every concern asked for, pixel-aligned", async () => {
    const render = await replaySimulation("p3a", { spots: 0.4, redness: 0.6 });
    expect(render.imageRef).toBe(recordedDataUrl("p3a", "renders/sim_spots05_redness05.png"));
    expect(render).toMatchObject({ width: 1080, height: 1575, offset: { dx: 0, dy: 0 }, source: "replay" });
    const dark = await replaySimulation("p2b", { dark_circle: 0.6 });
    expect(dark.imageRef).toBe(recordedDataUrl("p2b", "renders/sim_dark_circle05.png"));
    // p1a recorded acne + redness: a spots request must not be answered with that render.
    const acne = await replaySimulation("p1a", { acne: 0.5 });
    expect(acne.imageRef).toBe(recordedDataUrl("p1a", "renders/sim_acne05_redness05.png"));
    // The half-strength group B recordings (spots, pores, acne at 0.5) now answer spots and acne requests on every persona.
    const spots = await replaySimulation("p1a", { spots: 0.5 });
    expect(spots.imageRef).toBe(recordedDataUrl("p1a", "renders/sim_improve_b05.png"));
    const acneOnly = await replaySimulation("p3a", { acne: 0.5 });
    expect(acneOnly.imageRef).toBe(recordedDataUrl("p3a", "renders/sim_improve_b05.png"));
    // Nothing recorded changes radiance, so no render may answer it.
    await expect(replaySimulation("p1a", { radiance: 0.5 })).rejects.toMatchObject({ code: "no_replay_render" });
    await expect(replaySimulation("p3a", { radiance: 0.5 })).rejects.toMatchObject({ code: "no_replay_render" });
    await expect(replaySimulation("p2b", { radiance: 0.5 })).rejects.toMatchObject({ code: "no_replay_render" });
    await expect(replaySimulation("nobody", { spots: 0.5 })).rejects.toMatchObject({ code: "unknown_persona" });
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
