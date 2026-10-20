import { describe, expect, it } from "vitest";
import {
  DEFAULT_AXIS,
  DEFAULT_STOPS,
  bracketStops,
  clampDistance,
  distanceToStep,
  formatDistance,
  fromUnit,
  layerOpacities,
  locateAmongAnchors,
  spokenDistance,
  stepToDistance,
  thresholdLabelOpacity,
  toUnit,
} from "./axis";

describe("log distance axis", () => {
  it("maps the ends to 0 and 1 and clamps outside", () => {
    expect(toUnit(0.25)).toBeCloseTo(0, 12);
    expect(toUnit(6)).toBeCloseTo(1, 12);
    expect(toUnit(0.01)).toBe(0);
    expect(toUnit(50)).toBe(1);
    expect(toUnit(-3)).toBe(0);
  });

  it("puts the geometric mean in the middle (equal ratios, equal spacing)", () => {
    const mid = Math.sqrt(DEFAULT_AXIS.min * DEFAULT_AXIS.max);
    expect(toUnit(mid)).toBeCloseTo(0.5, 12);
    expect(toUnit(1) - toUnit(0.5)).toBeCloseTo(toUnit(2) - toUnit(1), 12);
  });

  it("round-trips and is strictly increasing", () => {
    let prev = -1;
    for (let i = 0; i <= 100; i++) {
      const u = i / 100;
      const d = fromUnit(u);
      expect(toUnit(d)).toBeCloseTo(u, 10);
      expect(d).toBeGreaterThan(prev);
      prev = d;
    }
  });

  it("quantises to slider steps and back", () => {
    expect(stepToDistance(0, 160)).toBeCloseTo(0.25, 12);
    expect(stepToDistance(160, 160)).toBeCloseTo(6, 12);
    for (const d of [0.3, 1, 1.5, 4]) {
      const step = distanceToStep(d, 160);
      expect(Math.abs(Math.log(stepToDistance(step, 160) / d))).toBeLessThan(Math.log(24) / 160);
    }
  });

  it("clamps distances to the axis", () => {
    expect(clampDistance(0.1)).toBe(0.25);
    expect(clampDistance(99)).toBe(6);
    expect(clampDistance(2)).toBe(2);
  });
});

describe("render stops", () => {
  it("brackets a distance and measures the fraction in log distance", () => {
    expect(bracketStops(DEFAULT_STOPS, 0.1)).toEqual({ index: 0, t: 0 });
    expect(bracketStops(DEFAULT_STOPS, 99)).toEqual({ index: DEFAULT_STOPS.length - 2, t: 1 });
    // Exactly on a stop: that stop is the lower layer, fully shown.
    expect(bracketStops(DEFAULT_STOPS, 1.5)).toEqual({ index: DEFAULT_STOPS.indexOf(1.5), t: 0 });
    const half = bracketStops([1, 4], 2);
    expect(half.index).toBe(0);
    expect(half.t).toBeCloseTo(0.5, 12);
  });

  it("crossfades exactly two neighbouring layers", () => {
    const o = layerOpacities([1, 2, 4], 1.5);
    expect(o).toHaveLength(3);
    expect(o[0]).toBe(1);
    expect(o[1]).toBeGreaterThan(0);
    expect(o[1]).toBeLessThan(1);
    expect(o[2]).toBe(0);
    expect(layerOpacities([1, 2, 4], 1)).toEqual([1, 0, 0]);
    expect(layerOpacities([1, 2, 4], 4)).toEqual([0, 1, 1]);
    expect(layerOpacities([3], 1)).toEqual([1]);
  });
});

describe("distance wording", () => {
  it("formats short distances in cm and long ones in m", () => {
    expect(formatDistance(0.25)).toBe("25 cm");
    expect(formatDistance(0.4)).toBe("40 cm");
    expect(formatDistance(0.999)).toBe("1 m");
    expect(formatDistance(1.5)).toBe("1.5 m");
    expect(formatDistance(1.449)).toBe("1.4 m");
    expect(formatDistance(6)).toBe("6 m");
  });

  it("speaks distances for assistive tech", () => {
    expect(spokenDistance(1.5)).toBe("1.5 metres");
    expect(spokenDistance(1)).toBe("1 metre");
    expect(spokenDistance(0.25)).toBe("25 centimetres");
  });

  it("finds the nearest anchor or the pair a distance sits between", () => {
    const anchors = [
      { distanceM: 0.25, label: "Mirror" },
      { distanceM: 1, label: "Conversation" },
      { distanceM: 4, label: "Room" },
    ];
    expect(locateAmongAnchors(anchors, 1.05).near?.label).toBe("Conversation");
    const between = locateAmongAnchors(anchors, 2);
    expect(between.near).toBeNull();
    expect(between.below?.label).toBe("Conversation");
    expect(between.above?.label).toBe("Room");
  });

  it("fades threshold labels in around the threshold only", () => {
    expect(thresholdLabelOpacity(1.4, 1.4)).toBeCloseTo(1, 12);
    expect(thresholdLabelOpacity(3, 1.4)).toBe(0);
    expect(thresholdLabelOpacity(0.5, 1.4)).toBe(0);
    expect(thresholdLabelOpacity(1.3, 1.4)).toBeGreaterThan(thresholdLabelOpacity(1.2, 1.4));
  });
});
