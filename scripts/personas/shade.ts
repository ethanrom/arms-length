/**
 * Free, local: the foundation shade for a persona is the mean sRGB colour of cheek patches, with every pixel near a
 * discrete analysis mark left out (spots, acne, dark circles, eye bags, wrinkle lines; marks dilated by 4 px). The
 * Phase 0 spike used one 40 px patch for p2b (#8a5840 at (300, 820)); the later personas pool one patch per cheek.
 *   npx tsx scripts/personas/shade.ts p3a 300,780,80,80 640,780,80,80           # x,y,w,h patches: report only
 *   npx tsx scripts/personas/shade.ts p3a 300,780,80,80 640,780,80,80 --write   # also store in scripts/personas/shades.json
 * A mark is any pixel whose alpha differs from the mask's modal alpha (HD masks carry a baked dark layer, see
 * fixtures/youcam/README.md). Zone masks (redness, region windows, texture, pore dots) cover whole cheeks by design
 * and are not excluded.
 */
import fs from "node:fs";
import path from "node:path";
import sharp from "sharp";
import { FIXTURES, SHADES } from "./common";

const FEATURES = ["hd_age_spot", "hd_acne_whole", "hd_dark_circle", "hd_eye_bag", "hd_wrinkle_whole"];
const DILATE = 4;

async function main() {
  const persona = process.argv[2];
  const rects = process.argv.slice(3).filter((a) => /^\d+,\d+,\d+,\d+$/.test(a)).map((a) => a.split(",").map(Number));
  if (!persona || rects.length === 0) throw new Error("usage: shade.ts <persona> x,y,w,h [x,y,w,h ...] [--write]");
  const { data, info } = await sharp(path.join(FIXTURES, persona, "input.jpg")).removeAlpha().raw().toBuffer({ resolveWithObject: true });
  const W = info.width;
  const H = info.height;

  const near = new Uint8Array(W * H); // within DILATE px of any discrete mark
  for (const name of FEATURES) {
    const file = path.join(FIXTURES, persona, "masks", "hd", `${name}.png`);
    if (!fs.existsSync(file)) continue;
    const m = await sharp(file).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
    if (m.info.width !== W || m.info.height !== H) throw new Error(`${name}: mask size differs from the photo`);
    const hist = new Uint32Array(256);
    for (let i = 3; i < m.data.length; i += 4) hist[m.data[i]]++;
    let modal = 0;
    for (let a = 1; a < 256; a++) if (hist[a] > hist[modal]) modal = a;
    for (let y = 0; y < H; y++)
      for (let x = 0; x < W; x++)
        if (m.data[(y * W + x) * 4 + 3] !== modal)
          for (let dy = -DILATE; dy <= DILATE; dy++)
            for (let dx = -DILATE; dx <= DILATE; dx++) {
              const xx = x + dx;
              const yy = y + dy;
              if (xx >= 0 && yy >= 0 && xx < W && yy < H) near[yy * W + xx] = 1;
            }
  }

  const sum = [0, 0, 0];
  let n = 0;
  const report: unknown[] = [];
  for (const [x0, y0, w, h] of rects) {
    const s = [0, 0, 0];
    let k = 0;
    for (let y = y0; y < y0 + h; y++)
      for (let x = x0; x < x0 + w; x++) {
        if (near[y * W + x]) continue;
        for (let c = 0; c < 3; c++) s[c] += data[(y * W + x) * 3 + c];
        k++;
      }
    for (let c = 0; c < 3; c++) sum[c] += s[c];
    n += k;
    report.push({ rect: [x0, y0, w, h], keptPx: k, kept: Number((k / (w * h)).toFixed(3)), meanRgb: s.map((v) => Number((v / k).toFixed(1))) });
  }
  const mean = sum.map((s) => s / n);
  const hex = "#" + mean.map((v) => Math.round(v).toString(16).padStart(2, "0")).join("");
  console.log(`${persona}: ${hex} (mean RGB ${mean.map((v) => v.toFixed(1)).join(", ")} over ${n} px)`);
  for (const r of report) console.log("  " + JSON.stringify(r));

  if (process.argv.includes("--write")) {
    const file = fs.existsSync(SHADES) ? JSON.parse(fs.readFileSync(SHADES, "utf8")) : { shades: {} };
    file.note = "Foundation shade per persona: mean sRGB of cheek patches [x, y, w, h] with pixels within 4 px of a discrete mark left out. scripts/personas/shade.ts";
    file.shades[persona] = { hex, patches: rects, meanRgb: mean.map((v) => Number(v.toFixed(2))), pixels: n };
    fs.writeFileSync(SHADES, JSON.stringify(file, null, 2) + "\n");
    console.log("  stored in scripts/personas/shades.json");
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
