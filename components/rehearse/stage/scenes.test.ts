import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, test } from "vitest";
import { SCENES, type CallGeometry } from "@/lib/contracts/rehearse";
import { LAPTOP, callTilesPx, type PxRect } from "./art/layout";
import { callTileHeightFraction } from "./pov";
import { LightTint, SceneBack, SceneFront, sceneLayout } from "./scenes";
import { STAGE_VIEWBOX, type StageRect } from "./types";

const call = (layout: CallGeometry["layout"]): CallGeometry => ({ device: "laptop", cameraDistanceCm: 50, layout });
const inUnit = (v: number) => v >= 0 && v <= 1;
const rectInUnit = (r: StageRect) => inUnit(r.x) && inUnit(r.y) && inUnit(r.x + r.w) && inUnit(r.y + r.h) && r.w > 0 && r.h > 0;
const inside = (a: PxRect, outer: PxRect) => a.x >= outer.x && a.y >= outer.y && a.x + a.w <= outer.x + outer.w && a.y + a.h <= outer.y + outer.h;
const overlap = (a: PxRect, b: PxRect) => a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;

describe("scene layouts", () => {
  test("every in-person face centre is on the stage, with room for the eyes above the props", () => {
    for (const s of SCENES.filter((t) => t.id !== "video_call")) {
      const { face } = sceneLayout(s.id);
      expect(inUnit(face.cx) && inUnit(face.cy), s.id).toBe(true);
      expect(face.cy, s.id).toBeGreaterThan(0.3);
      expect(face.cy, s.id).toBeLessThan(0.55);
    }
  });

  test("call tiles are fractions of the stage, at the heights pov.ts gives", () => {
    for (const layout of ["speaker", "gallery"] as const) {
      const l = sceneLayout("video_call", call(layout));
      expect(l.tile).toBeDefined();
      for (const r of [l.tile!, ...(l.otherTiles ?? [])]) expect(rectInUnit(r)).toBe(true);
      expect(l.tile!.h).toBeCloseTo(callTileHeightFraction(layout), 6);
      expect(inUnit(l.face.cx) && inUnit(l.face.cy)).toBe(true);
    }
  });

  test("gallery shows three other tiles; speaker shows none", () => {
    expect(sceneLayout("video_call", call("speaker")).otherTiles).toBeUndefined();
    expect(sceneLayout("video_call", call("gallery")).otherTiles).toHaveLength(3);
  });

  test("tiles sit inside the display, 16:9, without overlapping each other or the control bar", () => {
    for (const layout of ["speaker", "gallery"] as const) {
      const { tile, others, bar } = callTilesPx(layout);
      const all = [tile, ...others];
      for (const t of all) {
        expect(inside(t, LAPTOP.screen), layout).toBe(true);
        expect(t.w / t.h).toBeCloseTo(16 / 9, 6);
        expect(overlap(t, bar), layout).toBe(false);
      }
      expect(inside(bar, LAPTOP.screen)).toBe(true);
      for (let i = 0; i < all.length; i++) for (let j = i + 1; j < all.length; j++) expect(overlap(all[i], all[j]), `${layout} ${i}/${j}`).toBe(false);
    }
  });

  test("the display sits inside the lid, which sits on the drawing", () => {
    expect(inside(LAPTOP.screen, LAPTOP.lid)).toBe(true);
    expect(inside(LAPTOP.lid, { x: 0, y: 0, w: STAGE_VIEWBOX.width, h: STAGE_VIEWBOX.height })).toBe(true);
    // The display is about 0.45 of the stage height: a 19 cm display at 60 cm in a 40 degree view.
    expect(LAPTOP.screen.h / STAGE_VIEWBOX.height).toBeCloseTo(0.45, 2);
  });

  test("the layout of a call does not depend on the call device", () => {
    const a = sceneLayout("video_call", { ...call("speaker"), device: "phone" });
    const b = sceneLayout("video_call", call("speaker"));
    expect(a).toEqual(b);
  });

  test("the art draws in: blank at 0, finished at 1, decorative throughout", () => {
    for (const s of SCENES) {
      const props = { scene: s.id, light: s.light, call: s.id === "video_call" ? call("gallery") : undefined };
      for (const Part of [SceneBack, SceneFront]) {
        const blank = renderToStaticMarkup(createElement(Part, { ...props, drawn: 0 }));
        expect(blank, s.id).not.toContain("<path");
        expect(blank, s.id).toContain("aria-hidden=\"true\"");
        const done = renderToStaticMarkup(createElement(Part, { ...props, drawn: 1 }));
        expect(done, s.id).not.toContain("stroke-dasharray");
        expect(done, s.id).not.toContain("<text");
      }
      const half = renderToStaticMarkup(createElement(SceneBack, { ...props, drawn: 0.5 }));
      expect(half, s.id).toContain("stroke-dasharray");
    }
  });

  test("every light tint stays at or under 0.12 alpha", () => {
    for (const light of ["home", "indoor", "overcast", "daylight", "videoCall"] as const) {
      const html = renderToStaticMarkup(createElement(LightTint, { light, scene: light === "videoCall" ? "video_call" : "meeting_room" }));
      const alphas = [...html.matchAll(/rgba\([^)]*?,\s*([0-9.]+)\)/g)].map((m) => Number(m[1]));
      expect(alphas.length, light).toBeGreaterThan(0);
      for (const a of alphas) expect(a, light).toBeLessThanOrEqual(0.12);
    }
  });
});
