// Q6 (cont.): per-side dark-circle Weber contrasts, pairwise render differences (does the coverage parameter do anything?),
// and difference heat maps. VTO outputs are sampled with out(x, y+1) == in(x, y).
import sharp from "sharp";
import { load, p, lumY, components, stats, writeJson, Img } from "./lib";

const alphaPlane = async (file: string) => {
  const m = await load(p(file), true);
  const A = new Uint8Array(m.w * m.h);
  for (let i = 0; i < A.length; i++) A[i] = m.data[i * 4 + 3];
  return A;
};
type Px = (x: number, y: number) => [number, number, number];
const px = (im: Img, dy: number): Px => (x, y) => {
  const o = (Math.min(im.h - 1, y + dy) * im.w + x) * im.ch;
  return [im.data[o], im.data[o + 1], im.data[o + 2]];
};
const L = (c: [number, number, number]) => lumY(c[0], c[1], c[2]);

async function main() {
  const W = 1080, H = 1341;
  const out: any = {};
  const names = ["input", "conc20", "conc50", "conc90", "found30", "found80"] as const;
  const files: Record<string, [string, number]> = {
    input: ["inputs/p2b_hd.jpg", 0],
    conc20: ["mu_conc20_p2b/result.jpg", 1],
    conc50: ["mu_conc50_p2b/result.jpg", 1],
    conc90: ["mu_conc90_p2b/result.jpg", 1],
    found30: ["mu_found30_p2b/result.jpg", 1],
    found80: ["mu_found80_p2b/result.jpg", 1],
  };
  const imgs: Record<string, Px> = {};
  const raw: Record<string, Img> = {};
  for (const n of names) { raw[n] = await load(p(files[n][0])); imgs[n] = px(raw[n], files[n][1]); }

  const dc = await alphaPlane("sa_hd_p2b/hd_dark_circle.png");
  const eb = await alphaPlane("sa_hd_p2b/hd_eye_bag.png");
  const pore = await alphaPlane("sa_hd_p2b/hd_pore_whole.png");
  const spot = await alphaPlane("sa_hd_p2b/hd_age_spot.png");
  const acne = await alphaPlane("sa_hd_p2b/hd_acne_whole.png");
  const cc = components(W, H, (i) => dc[i] > 0);
  const big = cc.comps.map((c, k) => ({ c, id: k + 1 })).sort((a, b) => b.c.area - a.c.area).slice(0, 2);
  const sides = big.map((b) => ({ id: b.id, c: b.c, name: b.c.cx < W / 2 ? "left(viewer)" : "right(viewer)" }));

  const excl = new Uint8Array(W * H);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const i = y * W + x;
    if (dc[i] > 0 || eb[i] > 0 || spot[i] !== 51 || acne[i] !== 92 || pore[i] !== 102) {
      for (let dy = -4; dy <= 4; dy++) for (let dx = -4; dx <= 4; dx++) { const xx = x + dx, yy = y + dy; if (xx >= 0 && yy >= 0 && xx < W && yy < H) excl[yy * W + xx] = 1; }
    }
  }
  const rect = (x0: number, y0: number, x1: number, y1: number) => { const a: number[] = []; for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) if (!excl[y * W + x]) a.push(y * W + x); return a; };
  const mean = (S: Px, idx: number[], wts?: number[]) => { let s = 0, w = 0; idx.forEach((i, k) => { const wt = wts ? wts[k] : 1; s += wt * L(S(i % W, (i / W) | 0)); w += wt; }); return s / w; };

  out.perSide = {};
  for (const s of sides) {
    const core: number[] = [], all: number[] = [], aw: number[] = [];
    for (let i = 0; i < W * H; i++) if (cc.label[i] === s.id) { all.push(i); aw.push(dc[i] / 255); if (dc[i] >= 64) core.push(i); }
    // reference A: cheek patch on same side; reference B: band 25..95 px below the crescent bbox (same x-range, inner 60%)
    const refA = s.c.cx < W / 2 ? rect(270, 800, 370, 880) : rect(760, 790, 860, 870);
    const bw = s.c.x1 - s.c.x0;
    const refB = rect(Math.round(s.c.x0 + 0.2 * bw), s.c.y1 + 25, Math.round(s.c.x1 - 0.2 * bw), s.c.y1 + 95);
    const row: any = { corePx: core.length, allPx: all.length, refA_px: refA.length, refB_px: refB.length, bbox: [s.c.x0, s.c.y0, s.c.x1, s.c.y1] };
    for (const n of names) {
      const Lc = mean(imgs[n], core), Lw = mean(imgs[n], all, aw), La = mean(imgs[n], refA), Lb = mean(imgs[n], refB);
      row[n] = { L_core: +Lc.toFixed(5), weber_core_vs_cheekPatch: +((Lc - La) / La).toFixed(4), weber_alphaW_vs_cheekPatch: +((Lw - La) / La).toFixed(4), weber_core_vs_bandBelow: +((Lc - Lb) / Lb).toFixed(4), weber_alphaW_vs_bandBelow: +((Lw - Lb) / Lb).toFixed(4) };
    }
    out.perSide[s.name] = row;
    console.log(s.name, JSON.stringify(row));
  }

  // pairwise differences (mean abs diff in 0-255 RGB), for: whole image (trimmed), dark-circle region, spot comps, cheek patch, background corner
  const regions: Record<string, number[]> = {};
  regions.wholeImage = rect(10, 10, W - 10, H - 12).concat([]);
  const dcAll: number[] = []; for (let i = 0; i < W * H; i++) if (dc[i] >= 64) dcAll.push(i);
  regions.darkCircleCore = dcAll;
  const spotPx: number[] = []; for (let i = 0; i < W * H; i++) if (spot[i] !== 51) spotPx.push(i);
  regions.ageSpotMarks = spotPx;
  regions.cheekPatches = rect(270, 800, 370, 880).concat(rect(760, 790, 860, 870));
  regions.backgroundCorner = Array.from({ length: 100 * 100 }, (_, k) => (20 + ((k / 100) | 0)) * W + 20 + (k % 100));
  const mad = (a: Px, b: Px, idx: number[]) => { let s = 0; for (const i of idx) { const x = i % W, y = (i / W) | 0; const A = a(x, y), B = b(x, y); s += (Math.abs(A[0] - B[0]) + Math.abs(A[1] - B[1]) + Math.abs(A[2] - B[2])) / 3; } return +(s / idx.length).toFixed(3); };
  const pairs: [string, string][] = [["conc20", "conc50"], ["conc50", "conc90"], ["conc20", "conc90"], ["found30", "found80"], ["input", "conc20"], ["input", "found30"], ["conc20", "found30"]];
  out.pairwiseMAD = {};
  for (const [a, b] of pairs) {
    out.pairwiseMAD[`${a} vs ${b}`] = Object.fromEntries(Object.entries(regions).map(([k, idx]) => [k, mad(imgs[a], imgs[b], idx)]));
    console.log(`${a} vs ${b}`, JSON.stringify(out.pairwiseMAD[`${a} vs ${b}`]));
  }
  // mean RGB of cheek patches, to describe the tone change
  out.meanRGB = {};
  for (const n of names) {
    for (const [rk, idx] of [["cheekPatches", regions.cheekPatches], ["background", regions.backgroundCorner]] as const) {
      let r = 0, g = 0, b = 0; for (const i of idx) { const c = imgs[n](i % W, (i / W) | 0); r += c[0]; g += c[1]; b += c[2]; }
      (out.meanRGB[n] ??= {})[rk] = [r, g, b].map((v) => +(v / idx.length).toFixed(1));
    }
  }
  console.log(JSON.stringify(out.meanRGB));

  // diff heat maps (amplified), written as PNG
  const heat = async (a: string, b: string, gain: number, file: string) => {
    const buf = Buffer.alloc(W * H * 3);
    for (let y = 0; y < H - 2; y++) for (let x = 0; x < W; x++) {
      const A = imgs[a](x, y), B = imgs[b](x, y);
      const d = Math.min(255, gain * (Math.abs(A[0] - B[0]) + Math.abs(A[1] - B[1]) + Math.abs(A[2] - B[2])) / 3);
      const o = (y * W + x) * 3; buf[o] = d; buf[o + 1] = d; buf[o + 2] = d;
    }
    await sharp(buf, { raw: { width: W, height: H, channels: 3 } }).resize({ width: 540 }).png().toFile(p("overlays", file));
  };
  await heat("conc20", "conc90", 12, "p2b_diff_conc20_vs_conc90_x12.png");
  await heat("found30", "found80", 12, "p2b_diff_found30_vs_found80_x12.png");
  await heat("input", "conc20", 6, "p2b_diff_input_vs_conc20_x6.png");
  writeJson("vto_analysis2.json", out);
}
main();
