import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { CONCERNS, type ConcernId } from "../contracts/concerns";
import type {
  CallGeometry,
  FreeFixResult,
  LightestTouchResult,
  ObserveResult,
  ReceiptResult,
  RehearseFace,
  SceneInput,
  WorthItResult,
} from "../contracts/rehearse";
import { SCENES } from "../contracts/rehearse";
import { UI_LISTS } from "../copy/banned";
import { lintText } from "../copy/lint";
import { profileAt } from "../copy/profile";
import { buildReceipt } from "../integration/receipt";
import type { ReadingBundle } from "../integration/types";
import { viewingAt } from "../science/visibility";
import { buildVisibilityReport } from "../vision/report";
import {
  SceneError,
  faceFromBundle,
  findFreeFix,
  lightestTouch,
  observeScene,
  receiptAt,
  resolveScene,
  videoCallFrame,
  worthIt,
} from "./index";
import { measureScene } from "./observe";

const loadFace = (id: string): RehearseFace =>
  faceFromBundle(JSON.parse(readFileSync(new URL(`../../public/demo/${id}/bundle.json`, import.meta.url), "utf8")) as ReadingBundle);

const p1a = loadFace("p1a");
const laptop: CallGeometry = { device: "laptop", cameraDistanceCm: 50, layout: "speaker" };
const phone: CallGeometry = { device: "phone", cameraDistanceCm: 35, layout: "speaker" };
const get = (o: ObserveResult, c: ConcernId) => o.concerns.find((x) => x.concern === c)!;

describe("faceFromBundle", () => {
  it("keeps the measurements, the plans and the simulations (without renders)", () => {
    const bundle = JSON.parse(readFileSync(new URL("../../public/demo/p1a/bundle.json", import.meta.url), "utf8")) as ReadingBundle;
    const face = faceFromBundle(bundle);
    expect(face.measurements).toBe(bundle.measurements);
    expect(face.coverage).toEqual(bundle.coverageEntries.map((e) => e.plan));
    expect(face.worthIt).toHaveLength(bundle.worthIt.length);
    for (const w of face.worthIt) expect("render" in w).toBe(false);
  });
});

describe("observeScene", () => {
  it("counts exactly the targets the model says are still detectable at the distance", () => {
    const o = observeScene(p1a, { scene: "dinner_table", light: "indoor" }, "o1");
    // Independent count from the same report the site builds.
    const report = buildVisibilityReport(p1a.measurements, { ...viewingAt(45), acuityScale: 1 });
    expect(o.distanceM).toBe(1.5);
    for (const c of o.concerns) {
      const targets = report.targets.filter((t) => t.concern === c.concern);
      expect(c.targetCount).toBe(targets.length);
      expect(c.typicalCount).toBe(targets.filter((t) => t.nominalM! >= 1.5).length);
      expect(c.boundCount).toBe(targets.filter((t) => t.distanceM >= 1.5).length);
      expect(c.typicalCount).toBeLessThanOrEqual(c.boundCount);
      if (!c.soft) {
        expect(c.typicalShare).toBe(c.typicalCount / c.targetCount);
        expect(c.boundShare).toBe(c.boundCount / c.targetCount);
      } else {
        expect([0, 1]).toContain(c.typicalShare);
        expect([0, 1]).toContain(c.boundShare);
      }
      expect(o.quotes[`${c.concern}.typicalCount`]).toBe(`${c.typicalCount} of ${c.targetCount}`);
      expect(o.quotes[`${c.concern}.boundCount`]).toBe(`at most ${c.boundCount} of ${c.targetCount}`);
      expect(o.quotes[`${c.concern}.bound`]).toContain("at most");
    }
    expect(o.quotes.distance).toBe("1.5 m");
    expect(o.quotes.light).toBe("indoor light");
    expect(get(o, "dark_circle").soft).toBe(true);
    expect(["noticeable", "out of sight"]).toContain(o.quotes["dark_circle.typical"]);
    expect(get(o, "pore").soft).toBe(false);
  });

  it("shows a typical viewer less or the same in dimmer light, at every distance", () => {
    for (const s of SCENES.filter((x) => x.rangeM)) {
      for (const d of [s.rangeM![0], s.distanceM!, s.rangeM![1]]) {
        const dim = observeScene(p1a, { scene: s.id, distanceM: d, light: "home" }, "dim");
        const bright = observeScene(p1a, { scene: s.id, distanceM: d, light: "indoor" }, "bright");
        for (const c of dim.concerns) expect(c.typicalCount).toBeLessThanOrEqual(get(bright, c.concern).typicalCount);
      }
    }
  });

  it("does not shrink the bound in dim light (the luminance gain is floored at 1): 12 cd/m2 equals the 30 cd/m2 calibration for luminance concerns", () => {
    const dim = buildVisibilityReport(p1a.measurements, { ...viewingAt(12), acuityScale: 1 });
    const calibrated = buildVisibilityReport(p1a.measurements, { ...viewingAt(30), acuityScale: 1 });
    for (const t of dim.targets) {
      if (CONCERNS[t.concern].chromatic) continue;
      const other = calibrated.targets.find((x) => x.targetId === t.targetId)!;
      expect(t.distanceM).toBeCloseTo(other.distanceM, 6);
    }
  });

  it("shows a blurry viewer less or the same as a typical one", () => {
    for (const light of ["home", "indoor", "daylight"] as const) {
      for (const d of [0.8, 1.5, 4]) {
        const sharp = observeScene(p1a, { scene: "meeting_room", distanceM: d > 3.7 ? 3.7 : Math.max(d, 2.1), light, viewer: "typical" }, "s");
        const blurry = observeScene(p1a, { scene: "meeting_room", distanceM: d > 3.7 ? 3.7 : Math.max(d, 2.1), light, viewer: "blurry" }, "b");
        expect(blurry.acuityScale).toBe(2);
        for (const c of sharp.concerns) {
          expect(get(blurry, c.concern).typicalCount).toBeLessThanOrEqual(c.typicalCount);
          expect(get(blurry, c.concern).boundCount).toBeLessThanOrEqual(c.boundCount);
        }
      }
    }
  });

  it("never shows more as the distance grows", () => {
    for (const s of SCENES.filter((x) => x.rangeM)) {
      const [lo, hi] = s.rangeM!;
      let last: ObserveResult | null = null;
      for (let i = 0; i <= 8; i++) {
        const o = observeScene(p1a, { scene: s.id, distanceM: lo + ((hi - lo) * i) / 8 }, "x");
        if (last) for (const c of o.concerns) expect(c.typicalCount).toBeLessThanOrEqual(get(last, c.concern).typicalCount);
        last = o;
      }
    }
  });

  it("on a video call uses the equivalent distance and drops what the video cannot carry", () => {
    const call = videoCallFrame(laptop, "c");
    const o = observeScene(p1a, { scene: "video_call", call: laptop }, "v");
    expect(o.distanceM).toBeCloseTo(call.equivalentDistanceM, 9);
    expect(o.input.call).toEqual(laptop);
    expect(o.input.light).toBe("videoCall");
    expect(o.quotes.floor).toBe("1.2 mm");
    // The same distance and light in person: the video only ever takes away, and no more than the marks under the floor.
    const inPerson = observeScene(p1a, { scene: "dinner_table", distanceM: call.equivalentDistanceM, light: "videoCall" }, "p");
    for (const c of o.concerns) {
      const person = get(inPerson, c.concern);
      expect(c.typicalCount).toBeLessThanOrEqual(person.typicalCount);
      expect(c.boundCount).toBeLessThanOrEqual(person.boundCount);
      expect(person.boundCount - c.boundCount).toBeLessThanOrEqual(c.belowCameraCount!);
    }
    for (const c of o.concerns) {
      expect(c.belowCameraCount).toBeGreaterThanOrEqual(0);
      expect(o.quotes[`${c.concern}.belowCamera`]).toBe(`${c.belowCameraCount} of ${c.targetCount}`);
    }
    // Fine lines are far under 1.2 mm wide: most are lost in the video.
    expect(get(o, "wrinkle").belowCameraCount!).toBeGreaterThan(get(o, "wrinkle").targetCount / 2);
  });

  it("reuses the report: seven more scenes on p1a take well under 300 ms", () => {
    observeScene(p1a, { scene: "dinner_table" }, "warm");
    const t0 = performance.now();
    for (const s of SCENES) observeScene(p1a, s.id === "video_call" ? { scene: s.id, call: laptop } : { scene: s.id }, "x");
    expect(performance.now() - t0).toBeLessThan(300);
  });

  it("lists every assumption in plain words", () => {
    const text = observeScene(p1a, { scene: "video_call", call: laptop, viewer: "blurry" }, "v").assumptions.join("\n");
    for (const needle of ["Light:", "Viewer:", "20/40", "At most", "iris", "cautious"]) expect(text.toLowerCase()).toContain(needle.toLowerCase());
  });
});

describe("findFreeFix", () => {
  const meets = (o: ObserveResult, concerns: ConcernId[]) => concerns.every((c) => get(o, c).typicalShare <= 0.1 + 1e-9);

  it("reports a moment that already meets the goal as reachable with no lever", () => {
    const r = findFreeFix(p1a, { moment: { scene: "dinner_table" }, concerns: ["pore"] }, "f");
    expect(r.reachable).toBe(true);
    expect(r.lever).toBeNull();
    expect(r.to).toBeNull();
    expect(r.after.ref).toBe("f.after");
    expect(r.quotes.change).toContain("nothing needs to change");
  });

  it("moves the laptop back by the smallest 5 cm step that does it (camera_distance)", () => {
    const moment: SceneInput = { scene: "video_call", call: laptop };
    const r = findFreeFix(p1a, { moment, concerns: ["acne"] }, "f1");
    expect(r).toMatchObject({ reachable: true, lever: "camera_distance" });
    const to = r.to!.call!;
    expect(to.layout).toBe("speaker");
    expect(to.cameraDistanceCm % 5).toBe(0);
    expect(to.cameraDistanceCm).toBeGreaterThan(laptop.cameraDistanceCm);
    expect(meets(r.after, ["acne"])).toBe(true);
    // One step less is not enough: the change is the smallest.
    const less = observeScene(p1a, { scene: "video_call", call: { ...to, cameraDistanceCm: to.cameraDistanceCm - 5 } }, "less");
    expect(meets(less, ["acne"])).toBe(false);
    expect(r.quotes.change).toBe(`move the laptop about ${to.cameraDistanceCm - laptop.cameraDistanceCm} cm further back`);
    expect(r.quotes.to).toBe(`as if you were about ${r.after.quotes.distance} away`);
    expect(r.after.ref).toBe("f1.after");
    expect(r.from).toBe(moment);
  });

  it("falls back to the gallery layout when the camera alone is not enough, and says what it changed", () => {
    const r = findFreeFix(p1a, { moment: { scene: "video_call", call: laptop }, concerns: ["age_spot"] }, "f2");
    expect(r).toMatchObject({ reachable: true, lever: "call_layout" });
    expect(r.to!.call!.layout).toBe("gallery");
    expect(meets(r.after, ["age_spot"])).toBe(true);
    expect(r.quotes.change).toContain("use gallery view");
    // The camera alone, at its stated maximum, was not enough.
    const farthest = observeScene(p1a, { scene: "video_call", call: { ...laptop, cameraDistanceCm: 90 } }, "far");
    expect(meets(farthest, ["age_spot"])).toBe(false);
  });

  it("sits farther apart in person by the smallest step the distance can be said in (distance)", () => {
    const moment: SceneInput = { scene: "presenting", light: "daylight" };
    const r = findFreeFix(p1a, { moment, concerns: ["wrinkle", "age_spot"] }, "f3");
    expect(r).toMatchObject({ reachable: true, lever: "distance" });
    const d = r.to!.distanceM!;
    expect(d).toBeGreaterThan(4);
    expect(d).toBeLessThanOrEqual(6);
    expect(meets(r.after, ["wrinkle", "age_spot"])).toBe(true);
    const less = observeScene(p1a, { scene: "presenting", light: "daylight", distanceM: d - 1 }, "less");
    expect(meets(less, ["wrinkle", "age_spot"])).toBe(false);
    expect(r.quotes.change).toMatch(/^sit or stand about .* further away$/);
  });

  it("steps to softer light only when distance is not enough, one step, never brighter", () => {
    const r = findFreeFix(p1a, { moment: { scene: "cafe_table" }, concerns: ["pore"] }, "f4");
    expect(r).toMatchObject({ reachable: true, lever: "light" });
    expect(r.to!.light).toBe("home");
    expect(r.quotes.change).toContain("softer light (evening light at home)");
    // No scene's fix ever raises the light.
    for (const s of SCENES.filter((x) => x.rangeM)) {
      const fix = findFreeFix(p1a, { moment: { scene: s.id }, concerns: ["acne", "pore", "wrinkle", "age_spot"] }, "g");
      if (fix.to?.light) expect(observeScene(p1a, fix.to, "x").luminanceCdM2).toBeLessThan(observeScene(p1a, { scene: s.id }, "y").luminanceCdM2);
    }
  });

  it("says plainly when even the maximum of every lever is not enough, and leaves the scene as it is", () => {
    const moment: SceneInput = { scene: "dinner_table" };
    const r = findFreeFix(p1a, { moment, concerns: ["age_spot"] }, "f5");
    expect(r).toMatchObject({ reachable: false, lever: null, to: null });
    expect(r.after.input.scene).toBe("dinner_table");
    expect(r.after.distanceM).toBe(1.5);
    expect(r.quotes.change).toContain("no free change");
    // Large soft areas are always in view, so they are never reachable: the model's own statement, not a failure.
    for (const m of [{ scene: "presenting" } as SceneInput, { scene: "video_call", call: laptop } as SceneInput]) {
      expect(findFreeFix(p1a, { moment: m, concerns: ["dark_circle"] }, "s").reachable).toBe(false);
    }
  });

  it("never proposes a change that fails its own goal, on any demo face", () => {
    const concerns: ConcernId[] = ["acne", "age_spot", "pore", "wrinkle"];
    for (const id of ["p2b", "p3a", "p5a"]) {
      const face = loadFace(id);
      for (const moment of [{ scene: "video_call", call: phone }, { scene: "conversation" }, { scene: "meeting_room" }] as SceneInput[]) {
        const r: FreeFixResult = findFreeFix(face, { moment, concerns }, "x");
        if (r.reachable) expect(meets(r.after, concerns)).toBe(true);
        else expect(r.to).toBeNull();
      }
    }
  });

  it("rejects an unknown concern or scene", () => {
    expect(() => findFreeFix(p1a, { moment: { scene: "dinner_table" }, concerns: ["freckles" as ConcernId] }, "f")).toThrow(SceneError);
    expect(() => findFreeFix(p1a, { moment: { scene: "nowhere" as never }, concerns: [] }, "f")).toThrow(SceneError);
  });
});

describe("lightestTouch", () => {
  it("quotes the recorded coverage with the conditions it was measured in", () => {
    const r = lightestTouch(p1a, "acne", "t");
    expect(r).toMatchObject({ status: "not_met", coveragePct: 75, measuredAtM: 1.5 });
    expect(r.quotes.coverage).toBe("75% coverage");
    expect(r.quotes.measuredAt).toBe("measured in indoor light at 1.5 m");
    expect(r.quotes.after).toContain("at most");
    expect(r.quotes.before).toContain("at most");
    expect(r.afterShare).toBeLessThan(r.baselineShare!);
  });

  it("passes no_lever through, and says not_measured when no plan was run", () => {
    expect(lightestTouch(p1a, "wrinkle", "t")).toMatchObject({ status: "not_measured", coveragePct: null, quotes: {} });
    const noLever: RehearseFace = { ...p1a, coverage: [{ concern: "redness", targetDistanceM: 1.5, baselineDistanceM: 3, steps: [], chosen: null, status: "no_lever", reason: "no_makeup_lever" }] };
    const r = lightestTouch(noLever, "redness", "t");
    expect(r).toMatchObject({ status: "no_lever", coveragePct: null, afterShare: null });
    expect(r.quotes).toEqual({});
  });

  it("reads a plan that was already met as needing no coverage", () => {
    const met: RehearseFace = { ...p1a, coverage: [{ concern: "pore", targetDistanceM: 1.5, baselineDistanceM: 1, steps: [], chosen: null, status: "met", reason: "already_met", baselineFraction: 0.04 }] };
    const r = lightestTouch(met, "pore", "t");
    expect(r).toMatchObject({ status: "met", coveragePct: 0, baselineShare: 0.04, afterShare: 0.04 });
    expect(r.quotes.coverage).toBe("no coverage needed");
    expect(r.quotes.measuredAt).toContain("measured in indoor light at 1.5 m");
  });
});

describe("worthIt", () => {
  it("reads the recorded simulation's profiles on a log axis: typical from the nominal profile, bound from the bound profile", () => {
    const w = p1a.worthIt.find((x) => x.concern === "age_spot")!;
    const r = worthIt(p1a, "age_spot", 1.5, "w");
    expect(r.simulated).toBe(true);
    expect(r.boundShareOfChange).toBeCloseTo(profileAt(w.differenceProfile!, 1.5).fraction, 12);
    expect(r.typicalShareOfChange).toBeCloseTo(profileAt(w.differenceNominalProfile!, 1.5).fraction, 12);
    expect(r.typicalShareOfChange!).toBeLessThanOrEqual(r.boundShareOfChange!);
    expect(r.quotes["change.bound"]).toContain("at most");
    expect(r.quotes.measuredAt).toBe("measured on YouCam Skin Simulation at half strength, in indoor light");
    // Between two profile distances, between their shares.
    const mid = worthIt(p1a, "age_spot", 1.2, "w2").boundShareOfChange!;
    const a = profileAt(w.differenceProfile!, 1).fraction;
    const b = profileAt(w.differenceProfile!, 1.5).fraction;
    expect(mid).toBeGreaterThanOrEqual(Math.min(a, b) - 1e-12);
    expect(mid).toBeLessThanOrEqual(Math.max(a, b) + 1e-12);
  });

  it("says simulated: false, with nothing to quote, when no simulation was run", () => {
    const r = worthIt(p1a, "texture", 1.5, "w");
    expect(r).toMatchObject({ simulated: false, typicalShareOfChange: null, boundShareOfChange: null, quotes: {} });
    expect(() => worthIt(p1a, "pore", -1, "w")).toThrow(SceneError);
  });
});

describe("receiptAt", () => {
  it("is the concern's most visible target, with the receipt's own numbers", () => {
    const input = { scene: "dinner_table" as const, light: "indoor" as const, concern: "age_spot" as const };
    const r = receiptAt(p1a, input, "r") as ReceiptResult;
    const resolved = resolveScene(input);
    const report = buildVisibilityReport(p1a.measurements, resolved.viewing);
    const topId = report.concerns.find((c) => c.concern === "age_spot")!.topTargets[0];
    expect(r.targetId).toBe(topId);
    const target = p1a.measurements.features.find((f) => f.id === topId)!;
    const numbers = buildReceipt(target, p1a.measurements.scale, resolved.viewing, 1.5)!;
    expect(r).toMatchObject({ distanceM: 1.5, sizeMm: numbers.sizeMm, contrastPct: numbers.contrastPct, thresholdPct: numbers.thresholdPct, typicalThresholdPct: numbers.typicalThresholdPct });
    for (const key of ["size", "contrast", "angle", "threshold", "typicalThreshold"]) expect(r.quotes[key]).toBeTruthy();
    expect(r.quotes.angle).toMatch(/^[\d.]+ arcmin$/);
    expect(r.quotes.threshold).toMatch(/^about [\d.]+%$/);
  });

  it("is null when the concern has nothing measurable, and treats a mark under the video's floor as lost", () => {
    expect(receiptAt(loadFace("p5a"), { scene: "dinner_table", concern: "redness" }, "r")).toBeNull();
    expect(receiptAt(p1a, { scene: "dinner_table", concern: "texture" }, "r")).toBeNull();
    const mark = receiptAt(p1a, { scene: "video_call", call: laptop, concern: "pore" }, "r")!;
    expect(mark.sizeMm).toBeLessThan(videoCallFrame(laptop, "c").resolutionFloorMm);
    expect(mark.visibleTypical).toBe(false);
    expect(mark.visibleBound).toBe(false);
    expect(mark.quotes.camera).toContain("smaller than the video can carry");
  });
});

describe("every quote and assumption passes the copy linter", () => {
  const extra = /\b(never|nobody|no one|promise)\b/i;
  const check = (label: string, result: { quotes: Record<string, string>; assumptions: string[] }) => {
    for (const text of [...Object.values(result.quotes), ...result.assumptions]) {
      expect(lintText(text, UI_LISTS), `${label}: ${text}`).toEqual([]);
      expect(extra.test(text), `${label}: ${text}`).toBe(false);
    }
  };

  it("across all four demo faces and every tool", () => {
    const concerns = Object.keys(CONCERNS) as ConcernId[];
    for (const id of ["p1a", "p2b", "p3a", "p5a"]) {
      const face = loadFace(id);
      check(`${id} call`, videoCallFrame(phone, "c"));
      for (const s of SCENES) {
        const input: SceneInput = s.id === "video_call" ? { scene: s.id, call: laptop, viewer: "blurry" } : { scene: s.id };
        check(`${id} ${s.id}`, observeScene(face, input, "o"));
        for (const concern of concerns) {
          const rec = receiptAt(face, { ...input, concern }, "r");
          if (rec) check(`${id} ${s.id} receipt ${concern}`, rec);
        }
      }
      for (const concern of concerns) {
        const touch: LightestTouchResult = lightestTouch(face, concern, "t");
        check(`${id} touch ${concern}`, touch);
        const worth: WorthItResult = worthIt(face, concern, 1.5, "w");
        check(`${id} worth ${concern}`, worth);
        for (const moment of [{ scene: "conversation" }, { scene: "video_call", call: phone }, { scene: "cafe_table" }] as SceneInput[]) {
          const fix = findFreeFix(face, { moment, concerns: [concern] }, "f");
          check(`${id} fix ${concern}`, fix);
          check(`${id} fix.after ${concern}`, fix.after);
        }
      }
    }
  });
});

describe("measureScene", () => {
  it("is what observe_scene reports", () => {
    const resolved = resolveScene({ scene: "conversation" });
    expect(measureScene(p1a, resolved)).toEqual(observeScene(p1a, { scene: "conversation" }, "x").concerns);
  });
});
