import { describe, expect, test } from "vitest";
import type { CallGeometry } from "@/lib/contracts/rehearse";
import { videoCallFrame } from "@/lib/rehearse/call";
import { frameBase, frameKey } from "./face/frames";
import { LruCache } from "./face/lru";
import { LaterQueue } from "./face/queue";
import {
  FEATHER_SOLID,
  MIRROR_HEIGHT_FRACTION,
  SCENE_FOV_DEG,
  angularHeightDeg,
  callPhotoRect,
  callTileHeightFraction,
  callView,
  cameraFrameMm,
  featherMask,
  featherRadii,
  inPersonHeightFraction,
  inPersonRect,
  maxSideFor,
  mirrorRect,
  photoHeightMm,
  streamSize,
} from "./pov";
import { STAGE_ASPECT } from "./types";

const laptopSpeaker: CallGeometry = { device: "laptop", cameraDistanceCm: 50, layout: "speaker" };
const frame = { width: 1080, height: 1610 };

describe("in person: true angular size", () => {
  test("a 300 mm photo at 1.5 m is 11.42 degrees, about 0.286 of the stage", () => {
    expect(angularHeightDeg(300, 1.5)).toBeCloseTo(11.42, 2);
    expect(inPersonHeightFraction(300, 1.5)).toBeCloseTo(11.4212 / SCENE_FOV_DEG, 4);
    expect(inPersonHeightFraction(300, 1.5)).toBeCloseTo(0.286, 3);
  });

  test("the share falls with distance and is clamped to [0.04, 1.6]", () => {
    const at = [0.5, 0.8, 1.5, 2.5, 4].map((d) => inPersonHeightFraction(262, d));
    for (let i = 1; i < at.length; i++) expect(at[i]).toBeLessThan(at[i - 1]);
    expect(inPersonHeightFraction(262, 60)).toBe(0.04);
    expect(inPersonHeightFraction(3000, 0.1)).toBe(1.6);
  });

  test("photo height is the frame height times mm per pixel", () => {
    expect(photoHeightMm({ height: 1610 }, { mmPerPx: 0.16301 })).toBeCloseTo(262.4, 1);
  });

  test("the rectangle is centred on the face and keeps the photo's aspect on the 16:10 stage", () => {
    const rect = inPersonRect(frame, 262.4, 1.5, { cx: 0.5, cy: 0.42 });
    expect(rect.x + rect.w / 2).toBeCloseTo(0.5, 10);
    expect(rect.y + rect.h / 2).toBeCloseTo(0.42, 10);
    expect((rect.w * STAGE_ASPECT) / rect.h).toBeCloseTo(frame.width / frame.height, 10);
  });
});

describe("video call: camera frame, tile share, stream rows", () => {
  test("a laptop at 0.5 m and 46 degrees frames 424.5 mm", () => {
    expect(cameraFrameMm(laptopSpeaker)).toBeCloseTo(424.5, 1);
  });

  test("720 rows give 0.590 mm per pixel; a 300 mm photo is 509 rows, 0.707 of the tile", () => {
    const v = callView(300, laptopSpeaker);
    expect(v.mmPerStreamPx).toBeCloseTo(0.5895, 3);
    expect(v.mmPerStreamPx).toBeCloseTo(0.59, 2);
    expect(v.streamRows).toBeCloseTo(509, 0);
    expect(v.share).toBeCloseTo(0.707, 3);
    expect(v.cropped).toBe(false);
  });

  test("the gallery tile carries half the rows, so the same photo is half as many", () => {
    const speaker = callView(300, laptopSpeaker);
    const gallery = callView(300, { ...laptopSpeaker, layout: "gallery" });
    expect(gallery.share).toBeCloseTo(speaker.share, 10);
    expect(gallery.streamRows).toBeCloseTo(speaker.streamRows / 2, 6);
  });

  test("a photo taller than the camera frame crops: the face fills the tile and the photo covers it", () => {
    const close: CallGeometry = { device: "laptop", cameraDistanceCm: 30, layout: "speaker" };
    const v = callView(300, close);
    expect(v.share).toBeGreaterThan(1);
    expect(v.cropped).toBe(true);
    const tile = { x: 0.18, y: 0.08, w: 0.64, h: 0.72 };
    const rect = callPhotoRect(frame, v, tile, { x: 380, y: 800, w: 300, h: 225 });
    expect(rect.y).toBeLessThanOrEqual(tile.y + 1e-9);
    expect(rect.y + rect.h).toBeGreaterThanOrEqual(tile.y + tile.h - 1e-9);
    expect(rect.h).toBeCloseTo(v.share * tile.h, 10);
  });

  test("an uncropped photo sits in the middle of the tile", () => {
    const tile = { x: 0.53, y: 0.2, w: 0.2, h: 0.25 };
    const rect = callPhotoRect(frame, callView(262.4, laptopSpeaker), tile);
    expect(rect.x + rect.w / 2).toBeCloseTo(tile.x + tile.w / 2, 10);
    expect(rect.y + rect.h / 2).toBeCloseTo(tile.y + tile.h / 2, 10);
  });

  test("a tile sized as on the other person's screen puts the face at its in-person size at the equivalent distance", () => {
    expect(callTileHeightFraction("speaker")).toBeCloseTo(0.403, 3);
    expect(callTileHeightFraction("gallery")).toBeCloseTo(0.167, 3);
    for (const call of [laptopSpeaker, { ...laptopSpeaker, layout: "gallery" as const }, { device: "phone" as const, cameraDistanceCm: 35, layout: "speaker" as const }]) {
      const inCall = callView(262.4, call).share * callTileHeightFraction(call.layout);
      const inPerson = inPersonHeightFraction(262.4, videoCallFrame(call, "x").equivalentDistanceM);
      expect(inCall / inPerson).toBeGreaterThan(0.97);
      expect(inCall / inPerson).toBeLessThan(1.03);
    }
  });

  test("the stream size keeps the photo's aspect", () => {
    const s = streamSize(509, frame);
    expect(s.h).toBe(509);
    expect(s.w / s.h).toBeCloseTo(frame.width / frame.height, 2);
    expect(streamSize(0.2, frame).h).toBe(2);
  });
});

describe("mirror", () => {
  test("the face fills the stage: 1.15 tall, covering top and bottom, centred across", () => {
    for (const focus of [undefined, { x: 300, y: 900, w: 290, h: 220 }, { x: 0, y: 1500, w: 10, h: 10 }, { x: 0, y: 0, w: 10, h: 10 }]) {
      const r = mirrorRect(frame, focus);
      expect(r.h).toBe(MIRROR_HEIGHT_FRACTION);
      expect(r.y).toBeLessThanOrEqual(1e-9);
      expect(r.y + r.h).toBeGreaterThanOrEqual(1 - 1e-9);
      expect(r.x + r.w / 2).toBeCloseTo(0.5, 10);
    }
  });

  test("the focus patch is centred when the photo can still cover the stage, else clamped", () => {
    const middle = mirrorRect(frame, { x: 0, y: 805 - 50, w: 100, h: 100 });
    expect(middle.y + (805 / frame.height) * middle.h).toBeCloseTo(0.5, 6);
    expect(mirrorRect(frame, { x: 0, y: 1500, w: 10, h: 10 }).y).toBeCloseTo(1 - MIRROR_HEIGHT_FRACTION, 10);
  });
});

describe("feather", () => {
  test("inside the stage the ellipse is inscribed in the photo", () => {
    expect(featherRadii({ x: 0.4, y: 0.2, w: 0.2, h: 0.4 })).toEqual({ rx: 50, ry: 50 });
  });

  test("where the stage cuts the photo off, the fade moves out of view on that axis only", () => {
    const { rx, ry } = featherRadii({ x: 0.4, y: -0.05, w: 0.2, h: 1.1 });
    expect(rx).toBe(50);
    // The stage shows 0.5 either side of the photo's centre; the solid part must reach that far.
    expect(ry).toBeGreaterThan(50);
    expect((ry / 100) * FEATHER_SOLID * 1.1).toBeCloseTo(0.5, 6);
    // Cropped by a lot: the inscribed ellipse is already solid across the whole stage.
    expect(featherRadii({ x: 0.4, y: -0.3, w: 0.2, h: 1.6 }).ry).toBe(50);
  });

  test("a call tile clips the same way", () => {
    const tile = { x: 0.2, y: 0.1, w: 0.6, h: 0.5 };
    const { ry } = featherRadii({ x: 0.4, y: 0.05, w: 0.2, h: 0.6 }, tile);
    expect(ry).toBeGreaterThan(50);
  });

  test("the mask is a radial gradient from solid to transparent", () => {
    expect(featherMask({ x: 0.4, y: 0.2, w: 0.2, h: 0.4 })).toBe("radial-gradient(ellipse 50.00% 50.00% at 50% 50%, #000 74%, transparent 100%)");
  });
});

describe("render size and cache", () => {
  test("the working size steps up to the display size in device pixels, capped near 1000", () => {
    expect(maxSideFor(200, 1)).toBe(320);
    expect(maxSideFor(200, 2)).toBe(480);
    expect(maxSideFor(321, 1)).toBe(480);
    expect(maxSideFor(700, 2)).toBe(1000);
    expect(maxSideFor(5000, 3)).toBe(1000);
  });

  test("the key depends on source, distance, luminance, acuity and size", () => {
    const k = frameKey("/a.jpg", 1.5, 45, 1, 640);
    expect(frameKey("/a.jpg", 1.5, 45, 1, 640)).toBe(k);
    expect(frameKey("/a.jpg", 1.5004, 45, 1, 640)).toBe(k);
    for (const other of [frameKey("/b.jpg", 1.5, 45, 1, 640), frameKey("/a.jpg", 2, 45, 1, 640), frameKey("/a.jpg", 1.5, 120, 1, 640), frameKey("/a.jpg", 1.5, 45, 2, 640), frameKey("/a.jpg", 1.5, 45, 1, 480)]) {
      expect(other).not.toBe(k);
    }
    expect(k.startsWith(`${frameBase("/a.jpg", 1.5, 45, 1)}|`)).toBe(true);
  });

  test("the store drops the least recently used frame when over budget, and finds a frame at another size", () => {
    const cache = new LruCache<number>(100, (n) => n);
    cache.set("a|1", 40);
    cache.set("b|1", 40);
    cache.get("a|1");
    cache.set("c|1", 40);
    expect(cache.has("b|1")).toBe(false);
    expect(cache.has("a|1")).toBe(true);
    expect(cache.weight).toBe(80);
    cache.set("a|2", 10);
    expect(cache.findByPrefix("a")).toBe(10);
    expect(cache.findByPrefix("z")).toBeUndefined();
  });
});

describe("later renders start one at a time", () => {
  test("the next waits for the one running to release; a cancelled one never starts", () => {
    const idle: Array<() => void> = [];
    const queue = new LaterQueue((fn) => idle.push(fn));
    const started: string[] = [];
    const a = queue.enqueue(() => started.push("a"));
    const b = queue.enqueue(() => started.push("b"));
    const c = queue.enqueue(() => started.push("c"));
    b.cancel();
    idle.shift()?.();
    expect(started).toEqual(["a"]);
    expect(idle).toHaveLength(0);
    a.release();
    idle.shift()?.();
    expect(started).toEqual(["a", "c"]);
    c.release();
    expect(idle).toHaveLength(0);
  });
});
