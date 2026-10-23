import { describe, expect, it } from "vitest";
import { SCENES, VIEWER_ACUITY, type SceneInput } from "../contracts/rehearse";
import { lintText } from "../copy/lint";
import { LUMINANCE_PRESETS } from "../vision/params";
import { SceneError, lightLuminance, resolveScene, videoCallFrame } from "./index";
import { boundPhrase, typicalPhrase } from "./quotes";

const laptop = { device: "laptop", cameraDistanceCm: 50, layout: "speaker" } as const;

describe("resolveScene", () => {
  it("fills the scene's own distance and light, and reads the light from LUMINANCE_PRESETS", () => {
    const r = resolveScene({ scene: "dinner_table" });
    expect(r.distanceM).toBe(1.5);
    expect(r.light).toBe("home");
    expect(r.viewer).toBe("typical");
    expect(r.viewing.luminanceCdM2).toBe(LUMINANCE_PRESETS.home);
    expect(r.viewing.acuityScale).toBe(VIEWER_ACUITY.typical);
    expect(lightLuminance("daylight")).toBe(LUMINANCE_PRESETS.daylight);
    expect(resolveScene({ scene: "conversation", light: "overcast", viewer: "blurry" }).viewing).toMatchObject({
      luminanceCdM2: LUMINANCE_PRESETS.overcast,
      acuityScale: 2,
    });
  });

  it("takes a distance override inside the range (ends included) and treats null as absent", () => {
    expect(resolveScene({ scene: "conversation", distanceM: 0.76 }).distanceM).toBe(0.76);
    expect(resolveScene({ scene: "conversation", distanceM: 1.2 }).distanceM).toBe(1.2);
    expect(resolveScene({ scene: "conversation", distanceM: null as unknown as undefined }).distanceM).toBe(1);
  });

  it("derives a video call's distance from its geometry", () => {
    const r = resolveScene({ scene: "video_call", call: laptop });
    expect(r.light).toBe("videoCall");
    expect(r.distanceM).toBeCloseTo(1.498, 3);
    expect(r.call?.equivalentDistanceM).toBe(r.distanceM);
  });

  it("rejects what it cannot resolve with a SceneError (code bad_scene)", () => {
    const bad: [string, SceneInput][] = [
      ["unknown scene", { scene: "ballroom" as never }],
      ["unknown light", { scene: "conversation", light: "moonlight" as never }],
      ["prototype-key light", { scene: "conversation", light: "constructor" as never }],
      ["unknown viewer", { scene: "conversation", viewer: "eagle" as never }],
      ["distance below the range", { scene: "conversation", distanceM: 0.5 }],
      ["distance above the range", { scene: "conversation", distanceM: 1.3 }],
      ["distance not a number", { scene: "conversation", distanceM: Number.NaN }],
      ["override on a video call", { scene: "video_call", call: laptop, distanceM: 1.5 }],
      ["video call without a call", { scene: "video_call" }],
      ["unknown device", { scene: "video_call", call: { ...laptop, device: "watch" as never } }],
      ["unknown layout", { scene: "video_call", call: { ...laptop, layout: "pip" as never } }],
      ["camera distance in metres", { scene: "video_call", call: { ...laptop, cameraDistanceCm: 0.5 } }],
    ];
    for (const [label, input] of bad) {
      expect(() => resolveScene(input), label).toThrow(SceneError);
    }
    try {
      resolveScene({ scene: "conversation", distanceM: 3 });
    } catch (e) {
      expect(e).toBeInstanceOf(SceneError);
      expect((e as SceneError).code).toBe("bad_scene");
      expect((e as Error).message).toContain("0.76");
    }
  });

  it("ignores a call on an in-person scene", () => {
    expect(resolveScene({ scene: "conversation", call: laptop }).call).toBeUndefined();
  });

  it("covers every scene in the contract", () => {
    for (const s of SCENES) {
      const input: SceneInput = s.id === "video_call" ? { scene: s.id, call: laptop } : { scene: s.id };
      expect(resolveScene(input).distanceM).toBeGreaterThan(0);
    }
  });
});

describe("videoCallFrame", () => {
  // Hand-worked. Equivalent distance d = viewerDistance * frameHeight / tileHeight, frameHeight = 2 D tan(vfov / 2);
  // resolution floor = 2 * frameHeight / rows.
  it("laptop 50 cm from its camera (46 deg), speaker view: 0.6 m from a 17 cm tile is about 1.5 m", () => {
    // tan 23 deg = 0.42447, so the frame is 2 * 500 mm * 0.42447 = 424.5 mm tall.
    // d = 0.6 * 0.4245 / 0.17 = 1.498 m; floor = 2 * 424.5 / 720 = 1.179 mm.
    const r = videoCallFrame(laptop, "c1");
    expect(r.ref).toBe("c1");
    expect(r.equivalentDistanceM).toBeCloseTo(1.498, 3);
    expect(r.resolutionFloorMm).toBeCloseTo(1.179, 3);
    expect(r.quotes).toMatchObject({ equivalentDistance: "1.5 m", resolutionFloor: "1.2 mm", cameraDistance: "50 cm", tileHeight: "17 cm", viewerDistance: "60 cm" });
  });

  it("phone 35 cm from its camera (67 deg), gallery tile: a small tile reads as far away", () => {
    // tan 33.5 deg = 0.66189, frame = 2 * 350 mm * 0.66189 = 463.3 mm.
    // d = 0.6 * 0.4633 / 0.07 = 3.971 m; floor = 2 * 463.3 / 640 = 1.448 mm.
    const r = videoCallFrame({ device: "phone", cameraDistanceCm: 35, layout: "gallery" }, "c2");
    expect(r.equivalentDistanceM).toBeCloseTo(3.971, 3);
    expect(r.resolutionFloorMm).toBeCloseTo(1.448, 3);
    expect(r.quotes.equivalentDistance).toBe("4 m");
  });

  it("looks farther away, and carries less, as you sit back or use a gallery tile", () => {
    const near = videoCallFrame(laptop, "a");
    const back = videoCallFrame({ ...laptop, cameraDistanceCm: 80 }, "b");
    const gallery = videoCallFrame({ ...laptop, layout: "gallery" }, "c");
    for (const farther of [back, gallery]) {
      expect(farther.equivalentDistanceM).toBeGreaterThan(near.equivalentDistanceM);
      expect(farther.resolutionFloorMm).toBeGreaterThan(near.resolutionFloorMm);
    }
  });

  it("states every assumption, and says the estimate is cautious", () => {
    const text = videoCallFrame(laptop, "c").assumptions.join("\n");
    for (const needle of ["webcam", "50 cm", "60 cm from a laptop screen", "17 cm", "720 rows", "cautious"]) expect(text).toContain(needle);
    // Every parameter cites a source or says it is a project assumption.
    for (const a of videoCallFrame(laptop, "c").assumptions.slice(0, 5)) expect(a).toMatch(/Project assumption|OSHA|et al\./);
  });
});

describe("share phrases", () => {
  it("say a typical share in words that match the site's bands, with small shares as 1 in N", () => {
    expect(typicalPhrase(0)).toBe("none");
    expect(typicalPhrase(1)).toBe("all");
    expect(typicalPhrase(0.97)).toBe("nearly all");
    expect(typicalPhrase(0.75)).toBe("most");
    expect(typicalPhrase(0.5)).toBe("about half");
    expect(typicalPhrase(0.35)).toBe("about a third");
    expect(typicalPhrase(54 / 650)).toBe("about 1 in 12");
    expect(typicalPhrase(2 / 650)).toBe("fewer than 1 in 100");
  });

  it("round a bound share up, so 'at most' always holds", () => {
    expect(boundPhrase(81 / 650)).toBe("at most 1 in 8"); // 1/8 = 12.5% >= 12.46%
    expect(boundPhrase(0.1222)).toBe("at most 1 in 8");
    expect(boundPhrase(0.31)).toBe("at most 4 in 10");
    expect(boundPhrase(0.5)).toBe("at most half");
    expect(boundPhrase(0)).toContain("at most");
    for (const share of [0.001, 0.02, 0.09, 0.2, 0.29, 0.4, 0.55, 0.8, 0.95, 1]) {
      expect(boundPhrase(share)).toContain("at most");
      const m = /at most (\d+) in (\d+)/.exec(boundPhrase(share));
      if (m) expect(Number(m[1]) / Number(m[2])).toBeGreaterThanOrEqual(Math.max(share, 0.01) - 1e-12);
    }
  });

  it("pass the copy linter", () => {
    for (const share of [0, 0.01, 0.1, 0.3, 0.5, 0.8, 0.95, 1]) {
      expect(lintText(typicalPhrase(share))).toEqual([]);
      expect(lintText(boundPhrase(share))).toEqual([]);
    }
  });
});
