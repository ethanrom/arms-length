// Q3: sizes + alignment. Compare input vs resize_image vs VTO/sim outputs.
import sharp from "sharp";
import fs from "node:fs";
import { load, p, lumY, writeJson, Img } from "./lib";

const gray = (im: Img) => {
  const g = new Float64Array(im.w * im.h);
  for (let i = 0; i < g.length; i++) g[i] = 255 * lumY(im.data[i * im.ch], im.data[i * im.ch + 1], im.data[i * im.ch + 2]);
  return g;
};
// mean abs diff of two gray arrays of the same width, with b shifted by (dx,dy) relative to a, over a margin-trimmed ROI
function mad(a: Float64Array, wa: number, ha: number, b: Float64Array, wb: number, hb: number, dx: number, dy: number, roi: [number, number, number, number]) {
  let s = 0, n = 0;
  const [x0, y0, x1, y1] = roi;
  for (let y = y0; y < y1; y++)
    for (let x = x0; x < x1; x++) {
      const xb = x + dx, yb = y + dy;
      if (xb < 0 || yb < 0 || xb >= wb || yb >= hb) continue;
      s += Math.abs(a[y * wa + x] - b[yb * wb + xb]); n++;
    }
  return s / n;
}

async function main() {
  const out: any = {};
  const inp = { p2b: await load(p("inputs/p2b_hd.jpg")), p3a: await load(p("inputs/p3a_hd.jpg")) };
  out.inputs = Object.fromEntries(Object.entries(inp).map(([k, v]) => [k, `${v.w}x${v.h}`]));
  const pairs: [string, string, "p2b" | "p3a"][] = [
    ["resize_hd_p2b", "sa_hd_p2b/resize_image.jpg", "p2b"],
    ["resize_sd_p2b", "sa_sd_p2b/resize_image.jpg", "p2b"],
    ["resize_hd_p3a", "sa_hd_p3a/resize_image.jpg", "p3a"],
    ["conc20", "mu_conc20_p2b/result.jpg", "p2b"],
    ["conc50", "mu_conc50_p2b/result.jpg", "p2b"],
    ["conc90", "mu_conc90_p2b/result.jpg", "p2b"],
    ["found30", "mu_found30_p2b/result.jpg", "p2b"],
    ["found80", "mu_found80_p2b/result.jpg", "p2b"],
    ["sim_p3a", "sim_p3a/result.png", "p3a"],
  ];
  out.pairs = {};
  for (const [name, file, which] of pairs) {
    const a = inp[which];
    const b = await load(p(file));
    const ga = gray(a), gb = gray(b);
    const r: any = { in: `${a.w}x${a.h}`, out: `${b.w}x${b.h}`, sameSize: a.w === b.w && a.h === b.h };
    const roi: [number, number, number, number] = [40, 40, Math.min(a.w, b.w) - 40, Math.min(a.h, b.h) - 40];
    // brute-force integer shift search (-4..4) on whole-image ROI, plus identity MAD
    let best = { dx: 0, dy: 0, mad: Infinity };
    const grid: Record<string, number> = {};
    for (let dy = -4; dy <= 4; dy++)
      for (let dx = -4; dx <= 4; dx++) {
        const m = mad(ga, a.w, a.h, gb, b.w, b.h, dx, dy, roi);
        grid[`${dx},${dy}`] = +m.toFixed(3);
        if (m < best.mad) best = { dx, dy, mad: m };
      }
    r.madIdentity = grid["0,0"];
    r.bestShift_outRelToIn = { dx: best.dx, dy: best.dy, mad: +best.mad.toFixed(3) };
    // regions: top-left 200x200 (background), and mean over whole image
    const bg: [number, number, number, number] = [10, 10, 210, 210];
    r.bgMadIdentity = +mad(ga, a.w, a.h, gb, b.w, b.h, 0, 0, bg).toFixed(3);
    // if height differs by 1 test crop-top vs crop-bottom
    if (a.h !== b.h || a.w !== b.w) {
      const roi2: [number, number, number, number] = [40, 40, Math.min(a.w, b.w) - 40, Math.min(a.h, b.h) - 40];
      r.cropTest = {
        outRow_y_equals_inRow_y: +mad(ga, a.w, a.h, gb, b.w, b.h, 0, 0, roi2).toFixed(3),
        outRow_y_equals_inRow_y_plus1: +mad(ga, a.w, a.h, gb, b.w, b.h, 0, 1, roi2).toFixed(3),
        outRow_y_equals_inRow_y_minus1: +mad(ga, a.w, a.h, gb, b.w, b.h, 0, -1, roi2).toFixed(3),
      };
    }
    out.pairs[name] = r;
    console.log(name, JSON.stringify(r));
  }
  // resize_image vs input exactness
  writeJson("geometry.json", out);
}
main();
