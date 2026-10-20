// Are the HD masks pixel-aligned with the photo? Shift the mask by (dx,dy) over the photo and see where the
// feature-vs-ring luminance contrast peaks. Peak at (0,0) means aligned.
import { load, p, lumY, components, stats, writeJson } from "./lib";

async function run(label: string, photo: string, maskFile: string, bg: number, pred: (a: number) => boolean) {
  const im = await load(p(photo));
  const m = await load(p(maskFile), true);
  const W = im.w, H = im.h;
  const A = new Uint8Array(W * H);
  for (let i = 0; i < A.length; i++) A[i] = m.data[i * 4 + 3];
  const cc = components(W, H, (i) => pred(A[i]));
  const Y = new Float64Array(W * H);
  for (let i = 0; i < Y.length; i++) Y[i] = lumY(im.data[i * 3], im.data[i * 3 + 1], im.data[i * 3 + 2]);
  const marks = new Uint8Array(W * H);
  for (let i = 0; i < A.length; i++) if (A[i] !== bg) marks[i] = 1;
  const comps = cc.comps.map((c, k) => ({ c, id: k + 1 })).filter(({ c }) => c.area >= 30);
  // precompute pixel lists and ring lists
  const lists = comps.map(({ c, id }) => {
    const f: number[] = [], r: number[] = [];
    for (let y = Math.max(0, c.y0 - 9); y <= Math.min(H - 1, c.y1 + 9); y++)
      for (let x = Math.max(0, c.x0 - 9); x <= Math.min(W - 1, c.x1 + 9); x++) {
        const i = y * W + x;
        if (cc.label[i] === id) f.push(i);
        else if (!marks[i]) {
          const near = Math.max(c.x0 - x, 0, x - c.x1, c.y0 - y, 0, y - c.y1);
          if (near >= 3 && near <= 9) r.push(i);
        }
      }
    return { f, r };
  }).filter((l) => l.f.length >= 20 && l.r.length >= 30);
  const res: Record<string, number> = {};
  let best = { dx: 0, dy: 0, v: 0 };
  for (let dy = -6; dy <= 6; dy++)
    for (let dx = -6; dx <= 6; dx++) {
      const webers: number[] = [];
      for (const { f, r } of lists) {
        // shift the photo under the mask: sample photo at (x+dx, y+dy)
        let sf = 0, nf = 0, sr = 0, nr = 0;
        for (const i of f) { const x = (i % W) + dx, y = ((i / W) | 0) + dy; if (x >= 0 && y >= 0 && x < W && y < H) { sf += Y[y * W + x]; nf++; } }
        for (const i of r) { const x = (i % W) + dx, y = ((i / W) | 0) + dy; if (x >= 0 && y >= 0 && x < W && y < H) { sr += Y[y * W + x]; nr++; } }
        if (nf && nr) webers.push(Math.abs((sf / nf - sr / nr) / (sr / nr)));
      }
      const v = (stats(webers) as any).median as number;
      res[`${dx},${dy}`] = +v.toFixed(4);
      if (v > best.v) best = { dx, dy, v };
    }
  console.log(label, "components used:", lists.length, "median|Weber| at (0,0):", res["0,0"], "best shift:", JSON.stringify({ ...best, v: +best.v.toFixed(4) }), "neighbours (+-1):", ["-1,0", "1,0", "0,-1", "0,1"].map((k) => res[k]).join(" "));
  return { n: lists.length, atZero: res["0,0"], best, ring1: ["-1,0", "1,0", "0,-1", "0,1"].map((k) => res[k]) };
}
async function main() {
  const out: any = {};
  out.p2b_age_spot = await run("HD p2b age_spot", "inputs/p2b_hd.jpg", "sa_hd_p2b/hd_age_spot.png", 51, (a) => a !== 51);
  out.p3a_age_spot = await run("HD p3a age_spot", "inputs/p3a_hd.jpg", "sa_hd_p3a/hd_age_spot.png", 51, (a) => a !== 51);
  out.p2b_pore = await run("HD p2b pore dots", "inputs/p2b_hd.jpg", "sa_hd_p2b/hd_pore_whole.png", 102, (a) => a > 128);
  out.p3a_pore = await run("HD p3a pore dots", "inputs/p3a_hd.jpg", "sa_hd_p3a/hd_pore_whole.png", 102, (a) => a > 128);
  writeJson("mask_alignment.json", out);
}
main();
