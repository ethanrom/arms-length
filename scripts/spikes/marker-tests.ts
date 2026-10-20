// Are pore/acne marks fixed-size markers (locations) or sized shapes? Plus wrinkle widths, redness alpha structure.
import { load, p, components, stats, writeJson } from "./lib";

async function alphaOf(file: string) {
  const m = await load(p(file), true);
  const A = new Uint8Array(m.w * m.h);
  for (let i = 0; i < A.length; i++) A[i] = m.data[i * 4 + 3];
  return { m, A };
}
function areaHist(areas: number[], lo: number, hi: number, step: number) {
  const h: Record<string, number> = {};
  for (let a = lo; a < hi; a += step) h[`${a}-${a + step - 1}`] = 0;
  let over = 0;
  for (const a of areas) { if (a >= hi) over++; else if (a >= lo) h[`${lo + Math.floor((a - lo) / step) * step}-${lo + Math.floor((a - lo) / step) * step + step - 1}`]++; }
  h[`>=${hi}`] = over;
  return h;
}
// width proxy: for each fg pixel min(horizontal run length, vertical run length) through it
function widthProxy(A: Uint8Array, w: number, h: number, thr: number) {
  const hr = new Int32Array(w * h), vr = new Int32Array(w * h);
  for (let y = 0; y < h; y++) {
    let x = 0;
    while (x < w) {
      if (A[y * w + x] <= thr) { x++; continue; }
      let e = x; while (e < w && A[y * w + e] > thr) e++;
      for (let k = x; k < e; k++) hr[y * w + k] = e - x;
      x = e;
    }
  }
  for (let x = 0; x < w; x++) {
    let y = 0;
    while (y < h) {
      if (A[y * w + x] <= thr) { y++; continue; }
      let e = y; while (e < h && A[e * w + x] > thr) e++;
      for (let k = y; k < e; k++) vr[k * w + x] = e - y;
      y = e;
    }
  }
  const vals: number[] = [];
  for (let i = 0; i < w * h; i++) if (A[i] > thr) vals.push(Math.min(hr[i], vr[i]));
  return stats(vals);
}
async function main() {
  const out: any = {};
  // 1. marker size tests
  for (const [label, file, thr] of [
    ["HD p2b pore (a>128)", "sa_hd_p2b/hd_pore_whole.png", 128],
    ["HD p3a pore (a>128)", "sa_hd_p3a/hd_pore_whole.png", 128],
    ["SD p2b pore (a>0)", "sa_sd_p2b/pore.png", 0],
    ["HD p2b acne (a>128 ring)", "sa_hd_p2b/hd_acne_whole.png", 128],
    ["HD p3a acne (a>128 ring)", "sa_hd_p3a/hd_acne_whole.png", 128],
  ] as const) {
    const { m, A } = await alphaOf(file);
    const { comps } = components(m.w, m.h, (i) => A[i] > thr);
    const areas = comps.map((c) => c.area);
    const bw = comps.map((c) => c.x1 - c.x0 + 1), bh = comps.map((c) => c.y1 - c.y0 + 1);
    out[label] = { n: comps.length, areaHist: areaHist(areas, 30, 130, 10), bboxW: stats(bw), bboxH: stats(bh) };
    console.log(label, comps.length, JSON.stringify(out[label].areaHist));
    console.log("   bboxW", JSON.stringify(out[label].bboxW), "bboxH", JSON.stringify(out[label].bboxH));
  }
  // pore dot colour variety
  {
    const m = await load(p("sa_hd_p2b/hd_pore_whole.png"), true);
    const cols = new Map<string, number>();
    for (let i = 0; i < m.w * m.h; i++) if (m.data[i * 4 + 3] === 255) { const k = `${m.data[i * 4]},${m.data[i * 4 + 1]},${m.data[i * 4 + 2]}`; cols.set(k, (cols.get(k) ?? 0) + 1); }
    out.poreColourDistinct = cols.size;
    console.log("HD p2b pore: distinct colours among alpha=255 px:", cols.size, "top:", [...cols.entries()].sort((a, b) => b[1] - a[1]).slice(0, 4));
  }
  // 2. wrinkle width proxy
  out.wrinkleWidthPx = {};
  for (const [label, file, thr] of [
    ["HD p2b wrinkle_whole a>64", "sa_hd_p2b/hd_wrinkle_whole.png", 64],
    ["HD p3a wrinkle_whole a>64", "sa_hd_p3a/hd_wrinkle_whole.png", 64],
    ["SD p2b wrinkle a>64", "sa_sd_p2b/wrinkle.png", 64],
  ] as const) {
    const { m, A } = await alphaOf(file);
    out.wrinkleWidthPx[label] = widthProxy(A, m.w, m.h, thr);
    console.log("width proxy", label, JSON.stringify(out.wrinkleWidthPx[label]));
  }
  // 3. region-type alpha structure
  out.alphaStructure = {};
  for (const [label, file, bg] of [
    ["HD p3a redness", "sa_hd_p3a/hd_redness.png", 51],
    ["HD p2b dark_circle", "sa_hd_p2b/hd_dark_circle.png", 0],
    ["HD p3a dark_circle", "sa_hd_p3a/hd_dark_circle.png", 0],
    ["HD p2b eye_bag", "sa_hd_p2b/hd_eye_bag.png", 0],
    ["SD p2b age_spot", "sa_sd_p2b/age_spot.png", 0],
  ] as const) {
    const { m, A } = await alphaOf(file);
    const vals: number[] = [];
    for (let i = 0; i < A.length; i++) if (A[i] !== bg) vals.push(A[i]);
    const buckets: Record<string, number> = {};
    const step = bg === 51 ? 10 : 32;
    for (const v of vals) { const k = `${Math.floor(v / step) * step}-${Math.floor(v / step) * step + step - 1}`; buckets[k] = (buckets[k] ?? 0) + 1; }
    out.alphaStructure[label] = { fgPx: vals.length, alphaStats: stats(vals), buckets };
    console.log("alpha structure", label, "fgPx", vals.length, JSON.stringify(stats(vals)), JSON.stringify(buckets));
  }
  writeJson("marker_tests.json", out);
}
main();
