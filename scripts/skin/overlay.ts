/**
 * Eyeball check for lib/skin: runs measureAnalysis on a recorded fixture persona and writes an overlay PNG
 * plus a JSON summary.
 *
 *   npx tsx scripts/skin/overlay.ts [persona ...]        (default: every fixture persona)
 *
 * Output: E:/hackathons/youcam-api/internal/research/skin-overlays/<persona>.png|json
 * Colours: age spots cyan (equivalent-diameter circle), pores green, acne red (diameter circle, dashed when
 * the size is a prior), wrinkles orange (skeleton pixels of the lines that were kept), dark circles blue,
 * eye bags magenta, redness yellow (dashed boxes).
 * The scale is a PLACEHOLDER (11.71 mm / 52 px, the iris diameter over an assumed iris width in px).
 */
import fs from "node:fs";
import path from "node:path";
import sharp from "sharp";
import type { Feature, Measurements, RegionMeasure, ScaleEstimate } from "../../lib/contracts";
import { listFixturePersonas } from "../../lib/youcam/fixtures";
import { loadPersona } from "../../lib/skin/fixtures-io";
import { detectPolylines } from "../../lib/skin/features";
import { measureAnalysis } from "../../lib/skin/measure";

const OUT_DIR = "E:/hackathons/youcam-api/internal/research/skin-overlays";

// Placeholder until lib/scale supplies a real estimate: 11.71 mm iris over an assumed 52 px.
const PLACEHOLDER_SCALE: ScaleEstimate = { mmPerPx: 11.71 / 52, relSd: 0.04, source: "assumed" };

const COLORS: Record<string, string> = {
  age_spot: "#00e5ff",
  pore: "#39ff14",
  acne: "#ff3030",
  wrinkle: "#ff9500",
  dark_circle: "#4d79ff",
  eye_bag: "#ff40ff",
  redness: "#ffe600",
};

function quantiles(values: number[]) {
  if (values.length === 0) return null;
  const s = values.slice().sort((a, b) => a - b);
  const q = (f: number) => +s[Math.min(s.length - 1, Math.floor(f * s.length))].toFixed(4);
  return { min: q(0), p10: q(0.1), median: q(0.5), p90: q(0.9), max: +s[s.length - 1].toFixed(4) };
}

function featureSvg(f: Feature, mmPerPx: number): string {
  const color = COLORS[f.concern] ?? "#fff";
  if (f.shape === "line") return ""; // drawn as skeleton pixels
  const r = Math.max(2, (f.diameterMm ?? 0) / mmPerPx / 2);
  const dash = f.sizeSource === "prior" ? ' stroke-dasharray="2 2"' : "";
  return `<circle cx="${f.centroid.x.toFixed(1)}" cy="${f.centroid.y.toFixed(1)}" r="${r.toFixed(1)}" fill="none" stroke="${color}" stroke-width="1.2"${dash}/>`;
}

function regionSvg(r: RegionMeasure): string {
  const color = COLORS[r.concern] ?? "#fff";
  const { x, y, w, h } = r.bbox;
  return `<rect x="${x}" y="${y}" width="${w}" height="${h}" fill="none" stroke="${color}" stroke-width="3" stroke-dasharray="10 6"/>`;
}

function summarise(m: Measurements) {
  const byConcern: Record<string, unknown> = {};
  for (const concern of new Set(m.features.map((f) => f.concern))) {
    const fs_ = m.features.filter((f) => f.concern === concern);
    const sizes = fs_.map((f) => f.diameterMm ?? f.lengthMm ?? 0);
    const sources: Record<string, number> = {};
    const regions: Record<string, number> = {};
    for (const f of fs_) {
      sources[f.sizeSource] = (sources[f.sizeSource] ?? 0) + 1;
      regions[f.region] = (regions[f.region] ?? 0) + 1;
    }
    byConcern[concern] = {
      count: fs_.length,
      sizeMm: quantiles(sizes),
      ...(concern === "wrinkle" ? { widthMm: quantiles(fs_.map((f) => f.widthMm ?? 0)) } : {}),
      contrastLum: quantiles(fs_.map((f) => f.contrast.lum)),
      contrastRg: quantiles(fs_.map((f) => f.contrast.rg)),
      sizeSource: sources,
      regions,
      examples: fs_.slice(0, 3),
    };
  }
  return { scale: m.scale, byConcern, regions: m.regions, skipped: m.skipped };
}

async function run(persona: string) {
  const { analysis, masks, photo } = await loadPersona(persona);
  const t0 = performance.now();
  const m = measureAnalysis(analysis, masks, photo, PLACEHOLDER_SCALE);
  const ms = Math.round(performance.now() - t0);

  const wrinkleMask = analysis.results.find((r) => r.concern === "wrinkle" && r.region === "whole")?.maskRef;
  const lines = wrinkleMask ? detectPolylines(masks.get(wrinkleMask)!).lines : [];
  const skeleton = lines
    .map((l) => Array.from(l.info.pixels, (p) => `M${l.ox + (p % l.w)} ${l.oy + Math.floor(p / l.w)}h1v1h-1z`).join(""))
    .join("");
  const shapes = [
    `<path d="${skeleton}" fill="${COLORS.wrinkle}"/>`,
    ...m.features.map((f) => featureSvg(f, m.scale.mmPerPx)),
    ...m.regions.map(regionSvg),
  ].join("\n");
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${photo.width}" height="${photo.height}">${shapes}</svg>`;
  fs.mkdirSync(OUT_DIR, { recursive: true });
  await sharp(Buffer.from(photo.data.buffer, photo.data.byteOffset, photo.data.byteLength), {
    raw: { width: photo.width, height: photo.height, channels: 4 },
  })
    .composite([{ input: Buffer.from(svg) }])
    .png()
    .toFile(path.join(OUT_DIR, `${persona}.png`));
  const summary = {
    persona,
    note: "scale is a placeholder (11.71 mm / 52 px); sizes in mm scale with it",
    measureMs: ms,
    ...summarise(m),
  };
  fs.writeFileSync(path.join(OUT_DIR, `${persona}.json`), JSON.stringify(summary, null, 2));
  const counts = Object.entries(summary.byConcern as Record<string, { count: number }>).map(([k, v]) => `${k} ${v.count}`);
  console.log(`${persona}: ${counts.join(", ")}; regions ${m.regions.length}; skipped ${m.skipped.map((s) => s.concern).join(",")} (${ms} ms)`);
}

async function main() {
  const personas = process.argv.slice(2);
  for (const p of personas.length ? personas : listFixturePersonas()) await run(p);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
