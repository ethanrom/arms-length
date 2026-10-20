/**
 * measureAnalysis: YouCam masks + photo + scale -> physical measurements of every visible skin feature.
 * Pure and deterministic; works in Node and the browser (no DOM APIs).
 *
 * Features come from each concern's "whole" mask. The regional masks (pore forehead/nose/cheek, wrinkle
 * forehead/glabellar/...) are used only to label `Feature.region`. The texture window, when present, is
 * the skin area used for reference colours.
 */
import {
  CONCERNS, type ConcernId, type Feature, type Measurements, type Point, type RegionMeasure, type RgbaImage,
  type ScaleEstimate, type SkinAnalysis,
} from "../contracts";
import { toLinearPlanes } from "./color";
import { bandBelow, surroundStat, type Surround } from "./contrast";
import {
  detectContours, detectMarkers, detectPolylines, detectRegions, measureContours, measureMarkers, measurePolylines,
  measureRegion, type FeatureDraft, type MeasureContext, type RegionDetection,
} from "./features";
import { connectedComponents, dilate, fillHoles, foregroundOf } from "./masks";
import * as P from "./params";

/** Texture-window components smaller than this (px) are the sample dots, not the window. */
const MIN_ROI_AREA_PX = 2_000;

/** Filled convex hull of a point set (monotone chain + scanline). Empty for fewer than 3 points. */
function hullMask(points: Point[], width: number, height: number): Uint8Array {
  const out = new Uint8Array(width * height);
  if (points.length < 3) return out;
  const pts = points.slice().sort((a, b) => a.x - b.x || a.y - b.y);
  const cross = (o: Point, a: Point, b: Point) => (a.x - o.x) * (b.y - o.y) - (a.y - o.y) * (b.x - o.x);
  const half = (list: Point[]) => {
    const h: Point[] = [];
    for (const p of list) {
      while (h.length >= 2 && cross(h[h.length - 2], h[h.length - 1], p) <= 0) h.pop();
      h.push(p);
    }
    h.pop();
    return h;
  };
  const hull = [...half(pts), ...half(pts.slice().reverse())];
  if (hull.length < 3) return out;
  for (let y = 0; y < height; y++) {
    let lo = Infinity;
    let hi = -Infinity;
    for (let i = 0; i < hull.length; i++) {
      const a = hull[i];
      const b = hull[(i + 1) % hull.length];
      if (Math.min(a.y, b.y) > y || Math.max(a.y, b.y) < y) continue;
      const xs = a.y === b.y ? [a.x, b.x] : [a.x + ((y - a.y) / (b.y - a.y)) * (b.x - a.x)];
      for (const x of xs) {
        lo = Math.min(lo, x);
        hi = Math.max(hi, x);
      }
    }
    for (let x = Math.max(0, Math.ceil(lo)); x <= Math.min(width - 1, Math.floor(hi)); x++) out[y * width + x] = 1;
  }
  return out;
}

function pixelsWhere(n: number, include: Uint8Array, ...exclude: Uint8Array[]): Int32Array {
  const out: number[] = [];
  for (let i = 0; i < n; i++) {
    if (!include[i]) continue;
    let ok = true;
    for (const e of exclude) {
      if (e[i]) {
        ok = false;
        break;
      }
    }
    if (ok) out.push(i);
  }
  return Int32Array.from(out);
}

function union(n: number, ...maps: Uint8Array[]): Uint8Array {
  const out = new Uint8Array(n);
  for (const m of maps) for (let i = 0; i < n; i++) if (m[i]) out[i] = 1;
  return out;
}

interface RegionLabeller {
  name: string;
  area: number;
  binary: Uint8Array;
}

export function measureAnalysis(
  analysis: SkinAnalysis,
  masks: Map<string, RgbaImage>,
  photo: RgbaImage,
  scale: ScaleEstimate,
): Measurements {
  const { width, height } = analysis.frame;
  if (photo.width !== width || photo.height !== height) {
    throw new RangeError(`photo is ${photo.width}x${photo.height} but the analysis frame is ${width}x${height}`);
  }
  const n = width * height;
  const skipped: Measurements["skipped"] = [];
  const skip = (concern: ConcernId, reason: string) => skipped.push({ concern, reason });

  const maskOf = (concern: ConcernId, region: string): RgbaImage | string => {
    const result = analysis.results.find((r) => r.concern === concern && r.region === region);
    if (!result) return `no "${region}" mask in the analysis`;
    const mask = result.maskRef ? masks.get(result.maskRef) : undefined;
    if (!mask) return "mask not provided";
    if (mask.width !== width || mask.height !== height) return `mask is ${mask.width}x${mask.height}, not the ${width}x${height} frame`;
    return mask;
  };

  // 1. Detection from masks alone.
  const measurers: { concern: ConcernId; run: (ctx: MeasureContext) => FeatureDraft[] }[] = [];
  const footprints: Uint8Array[] = [];
  const centres: Point[] = [];

  for (const spec of Object.values(CONCERNS)) {
    if (spec.maskKind === "roi" || spec.maskKind === "region") continue;
    const mask = maskOf(spec.id, "whole");
    if (typeof mask === "string") {
      skip(spec.id, mask);
      continue;
    }
    if (spec.maskKind === "contour") {
      const det = detectContours(mask);
      footprints.push(det.footprint);
      det.comps.forEach((c) => centres.push(c.centroid));
      measurers.push({ concern: spec.id, run: (ctx) => measureContours(spec.id, det.comps, ctx) });
      if (det.comps.length === 0) skip(spec.id, "mask has no features");
    } else if (spec.maskKind === "polyline") {
      const det = detectPolylines(mask);
      footprints.push(det.footprint);
      det.lines.forEach((l) => centres.push(l.comp.centroid));
      measurers.push({ concern: spec.id, run: (ctx) => measurePolylines(spec.id, det.lines, ctx) });
      if (det.lines.length === 0) skip(spec.id, "mask has no lines above the length threshold");
    } else {
      const kind = spec.id === "acne" ? "acne" : "pore";
      const det = detectMarkers(mask, kind);
      footprints.push(det.footprint);
      det.markers.forEach((m) => centres.push({ x: m.x, y: m.y }));
      measurers.push({ concern: spec.id, run: (ctx) => measureMarkers(kind, det, ctx) });
      if (det.markers.length === 0) skip(spec.id, "mask has no markers");
    }
  }

  const regionDetections = new Map<ConcernId, RegionDetection>();
  for (const spec of Object.values(CONCERNS)) {
    if (spec.maskKind !== "region") continue;
    const mask = maskOf(spec.id, "whole");
    if (typeof mask === "string") {
      skip(spec.id, mask);
      continue;
    }
    const det = detectRegions(mask);
    if (det.comps.length === 0) {
      skip(spec.id, `mask is empty: no ${spec.id.replace("_", " ")} zones were found`);
      continue;
    }
    regionDetections.set(spec.id, det);
    for (const c of det.comps) centres.push({ x: c.bbox.x, y: c.bbox.y }, { x: c.bbox.x + c.bbox.w - 1, y: c.bbox.y + c.bbox.h - 1 });
  }
  skip("texture", "a sampling window, not a visible mark; used only as the skin reference area");

  // 2. Shared maps: where features sit, where regions sit, and which pixels are face skin.
  const occupied = dilate(union(n, ...footprints), width, height, 1);
  const regionMap = dilate(union(n, ...[...regionDetections.values()].map((d) => d.footprint)), width, height, 3);

  let skinArea: Uint8Array | null = null;
  const texture = maskOf("texture", "whole");
  if (typeof texture !== "string") {
    const fg = foregroundOf(texture);
    const windows = connectedComponents(fillHoles(fg.binary, width, height), width, height).filter((c) => c.area >= MIN_ROI_AREA_PX);
    if (windows.length) {
      skinArea = new Uint8Array(n);
      for (const c of windows) for (const p of c.pixels) skinArea[p] = 1;
    }
  }
  const faceArea = skinArea ?? hullMask(centres, width, height);
  const planes = toLinearPlanes(photo);
  const skinPixels = pixelsWhere(n, faceArea, occupied, regionMap);
  const skin: Surround | null = skinPixels.length >= P.MIN_REFERENCE_PIXELS ? surroundStat(planes, skinPixels) : null;
  const ctx: MeasureContext = { planes, mmPerPx: scale.mmPerPx, occupied, skin };

  // 3. Measure discrete features.
  const drafts = measurers.map((m) => ({ concern: m.concern, items: m.run(ctx) }));

  // 4. Label regions from the regional masks (pores, wrinkles), most specific (smallest) first.
  const features: Feature[] = [];
  for (const { concern, items } of drafts) {
    const labellers: RegionLabeller[] = [];
    for (const r of analysis.results) {
      if (r.concern !== concern || r.region === "whole") continue;
      const m = maskOf(concern, r.region);
      if (typeof m === "string") continue;
      const fg = foregroundOf(m);
      labellers.push({ name: r.region, area: fg.count, binary: fg.binary });
    }
    labellers.sort((a, b) => a.area - b.area || a.name.localeCompare(b.name));
    const sorted = items
      .slice()
      .sort((a, b) => a.centroid.y - b.centroid.y || a.centroid.x - b.centroid.x || a.areaPx - b.areaPx);
    sorted.forEach((d, i) => {
      const px = Math.min(width - 1, Math.max(0, Math.round(d.centroid.x)));
      const py = Math.min(height - 1, Math.max(0, Math.round(d.centroid.y)));
      const region = labellers.find((l) => l.binary[py * width + px])?.name ?? "whole";
      features.push({ id: `${concern}:${i}`, region, ...d });
    });
  }

  // 5. Regions against their references.
  const regions: RegionMeasure[] = [];
  for (const [concern, det] of regionDetections) {
    const out: Omit<RegionMeasure, "id">[] = [];
    if (concern === "redness") {
      const zones = dilate(det.footprint, width, height, 6);
      const px = pixelsWhere(n, faceArea, zones, occupied);
      const ref = px.length >= P.MIN_REFERENCE_PIXELS ? surroundStat(planes, px) : null;
      if (!ref) {
        skip(concern, "no skin outside the redness zones to compare with");
        continue;
      }
      for (const comp of det.comps) {
        out.push({ ...measureRegion(concern, comp, det.fg, ref, ctx), reference: "skin_outside_zones" });
      }
    } else {
      const blocked = union(n, occupied, regionMap);
      for (const comp of det.comps) {
        const band = bandBelow(comp, width, height, P.BAND_GAP_FRAC, P.BAND_HEIGHT_FRAC, blocked);
        const bandRef = band.length >= P.MIN_BAND_PIXELS ? surroundStat(planes, band) : null;
        const ref = bandRef ?? skin;
        if (!ref) continue;
        out.push({ ...measureRegion(concern, comp, det.fg, ref, ctx), reference: bandRef ? "cheek_band" : "face_skin" });
      }
      if (out.length === 0) {
        skip(concern, "no reference skin below the region");
        continue;
      }
    }
    out.sort((a, b) => a.bbox.y - b.bbox.y || a.bbox.x - b.bbox.x);
    out.forEach((r, i) => regions.push({ ...r, id: `${concern}:${i}` }));
  }

  return { scale, features, regions, skipped };
}
