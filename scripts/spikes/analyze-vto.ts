// Q6 + Q7: makeup-VTO coverage response (p2b) and skin-simulation response (p3a).
// Renders are sampled with the measured alignment: VTO out(x, y+1) == in(x, y). Simulation: no shift.
import sharp from "sharp";
import { load, p, lumY, lab, components, stats, writeJson, Img } from "./lib";

const SHIFT_VTO = 1; // out row = in row + 1 (measured by register.ts: dy = 0.99 +/- 0.05 px)

const alphaPlane = async (file: string) => {
  const m = await load(p(file), true);
  const A = new Uint8Array(m.w * m.h);
  for (let i = 0; i < A.length; i++) A[i] = m.data[i * 4 + 3];
  return { A, w: m.w, h: m.h };
};
type Sampler = (x: number, y: number) => readonly [number, number, number] | null;
/** returns RGB of the render at input coordinates (x,y) after applying the vertical shift; null if out of range */
const sampler = (im: Img, dy: number): Sampler => (x, y) => {
  const yy = y + dy;
  if (x < 0 || yy < 0 || x >= im.w || yy >= im.h) return null;
  const o = (yy * im.w + x) * im.ch;
  return [im.data[o], im.data[o + 1], im.data[o + 2]] as const;
};
function meanLum(S: Sampler, idx: number[], w: number, weights?: number[]) {
  let s = 0, ws = 0;
  for (let k = 0; k < idx.length; k++) {
    const i = idx[k];
    const c = S(i % w, (i / w) | 0);
    if (!c) continue;
    const wt = weights ? weights[k] : 1;
    s += wt * lumY(c[0], c[1], c[2]);
    ws += wt;
  }
  return ws ? s / ws : NaN;
}
const med = (a: number[]) => (stats(a) as any).median as number;
const mean = (a: number[]) => (stats(a) as any).mean as number;

async function main() {
  const out: any = {};
  // ---------------- Q6 ----------------
  const inp = await load(p("inputs/p2b_hd.jpg"));
  const W = inp.w, H = inp.h;
  const dc = await alphaPlane("sa_hd_p2b/hd_dark_circle.png");
  const eb = await alphaPlane("sa_hd_p2b/hd_eye_bag.png");
  const pore = await alphaPlane("sa_hd_p2b/hd_pore_whole.png");
  const spot = await alphaPlane("sa_hd_p2b/hd_age_spot.png");
  const acne = await alphaPlane("sa_hd_p2b/hd_acne_whole.png");

  // dark-circle region: two largest components of alpha>0
  const dcc = components(W, H, (i) => dc.A[i] > 0);
  const bigIds = dcc.comps.map((c, k) => ({ c, id: k + 1 })).sort((a, b) => b.c.area - a.c.area).slice(0, 2).map((x) => x.id);
  const regionAll: number[] = [], regionAllW: number[] = [], regionCore: number[] = [];
  for (let i = 0; i < W * H; i++) {
    if (bigIds.includes(dcc.label[i])) {
      regionAll.push(i);
      regionAllW.push(dc.A[i] / 255);
      if (dc.A[i] >= 64) regionCore.push(i);
    }
  }

  // exclusion map for reference patches and rings: any mark of spot/acne/pore/eyebag/dark circle, dilated by 4 px
  const excl = new Uint8Array(W * H);
  const mark = (i: number) => dc.A[i] > 0 || eb.A[i] > 0 || spot.A[i] !== 51 || acne.A[i] !== 92 || pore.A[i] !== 102;
  for (let y = 0; y < H; y++)
    for (let x = 0; x < W; x++)
      if (mark(y * W + x))
        for (let dy = -4; dy <= 4; dy++)
          for (let dx = -4; dx <= 4; dx++) {
            const xx = x + dx, yy = y + dy;
            if (xx >= 0 && yy >= 0 && xx < W && yy < H) excl[yy * W + xx] = 1;
          }
  const patch = (x0: number, y0: number, x1: number, y1: number) => {
    const a: number[] = [];
    for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) if (!excl[y * W + x]) a.push(y * W + x);
    return a;
  };
  const refs: Record<string, number[]> = {
    cheekL_270_800_370_880: patch(270, 800, 370, 880),
    cheekR_760_790_860_870: patch(760, 790, 860, 870),
    shadePatch_300_820_340_860: Array.from({ length: 40 * 40 }, (_, k) => (820 + ((k / 40) | 0)) * W + 300 + (k % 40)),
  };
  refs.cheeks_both = [...refs.cheekL_270_800_370_880, ...refs.cheekR_760_790_860_870];
  out.q6 = {
    regionPx: { all: regionAll.length, core_alpha_ge_64: regionCore.length },
    refPx: Object.fromEntries(Object.entries(refs).map(([k, v]) => [k, v.length])),
    renders: {},
  };

  // ROI visualisation
  {
    const img = Buffer.alloc(W * H * 3);
    for (let i = 0; i < W * H; i++) {
      img[i * 3] = inp.data[i * 3] * 0.6;
      img[i * 3 + 1] = inp.data[i * 3 + 1] * 0.6;
      img[i * 3 + 2] = inp.data[i * 3 + 2] * 0.6;
    }
    for (const i of regionCore) { img[i * 3] = 0; img[i * 3 + 1] = 200; img[i * 3 + 2] = 255; }
    for (const i of refs.cheeks_both) { img[i * 3] = 255; img[i * 3 + 1] = 200; img[i * 3 + 2] = 0; }
    await sharp(img, { raw: { width: W, height: H, channels: 3 } }).png().toFile(p("overlays/p2b_vto_rois.png"));
  }

  const renders: [string, string, number][] = [
    ["input", "inputs/p2b_hd.jpg", 0],
    ["concealer cov20", "mu_conc20_p2b/result.jpg", SHIFT_VTO],
    ["concealer cov50", "mu_conc50_p2b/result.jpg", SHIFT_VTO],
    ["concealer cov90", "mu_conc90_p2b/result.jpg", SHIFT_VTO],
    ["foundation cov30", "mu_found30_p2b/result.jpg", SHIFT_VTO],
    ["foundation cov80", "mu_found80_p2b/result.jpg", SHIFT_VTO],
  ];

  // feature families with local rings
  const spotC = components(W, H, (i) => spot.A[i] !== 51);
  const acneC = components(W, H, (i) => acne.A[i] !== 92);
  const poreC = components(W, H, (i) => pore.A[i] > 128);
  type Cmp = { area: number; x0: number; y0: number; x1: number; y1: number };
  const ringFor = (lab_: Int32Array, id: number, c: Cmp, w: number, h: number, exclusion: Uint8Array) => {
    const r: number[] = [], f: number[] = [];
    const x0 = Math.max(0, c.x0 - 10), x1 = Math.min(w - 1, c.x1 + 10), y0 = Math.max(0, c.y0 - 10), y1 = Math.min(h - 1, c.y1 + 10);
    for (let y = y0; y <= y1; y++)
      for (let x = x0; x <= x1; x++) {
        const i = y * w + x;
        if (lab_[i] === id) { f.push(i); continue; }
        if (exclusion[i]) continue;
        const near = Math.max(c.x0 - x, 0, x - c.x1, c.y0 - y, 0, y - c.y1);
        if (near >= 3 && near <= 10) r.push(i);
      }
    return { f, r };
  };
  const fam: Record<string, { f: number[]; r: number[] }[]> = { age_spot: [], acne: [], pore: [] };
  const add = (key: string, cc: ReturnType<typeof components>, maxF = 1e9) =>
    cc.comps.forEach((c, k) => {
      const { f, r } = ringFor(cc.label, k + 1, c, W, H, excl);
      if (f.length >= 20 && r.length >= 30 && f.length < maxF) fam[key].push({ f, r });
    });
  add("age_spot", spotC);
  add("acne", acneC);
  add("pore", poreC, 150);
  out.q6.families = Object.fromEntries(Object.entries(fam).map(([k, v]) => [k, v.length]));

  const weberPerComp: Record<string, number[]> = {};
  for (const [name, file, dy] of renders) {
    const im = name === "input" ? inp : await load(p(file));
    const S = sampler(im, dy);
    const Lall = meanLum(S, regionAll, W, regionAllW);
    const Lcore = meanLum(S, regionCore, W);
    const row: any = { size: `${im.w}x${im.h}`, L_region_alphaWeighted: +Lall.toFixed(5), L_region_core: +Lcore.toFixed(5), ref: {} };
    for (const [rk, idx] of Object.entries(refs)) {
      const Lref = meanLum(S, idx, W);
      row.ref[rk] = { L_ref: +Lref.toFixed(5), weber_core: +((Lcore - Lref) / Lref).toFixed(4), weber_alphaWeighted: +((Lall - Lref) / Lref).toFixed(4) };
    }
    if (dy) {
      const S0 = sampler(im, 0);
      const Lc0 = meanLum(S0, regionCore, W), Lr0 = meanLum(S0, refs.cheeks_both, W);
      row.weber_core_cheeksBoth_noShiftCorrection = +((Lc0 - Lr0) / Lr0).toFixed(4);
    }
    row.families = {};
    for (const [fk, comps] of Object.entries(fam)) {
      const wv: number[] = [];
      for (const { f, r } of comps) {
        const Lf = meanLum(S, f, W), Lr = meanLum(S, r, W);
        wv.push((Lf - Lr) / Lr);
      }
      weberPerComp[`${fk}|${name}`] = wv;
      const ab = wv.map(Math.abs);
      row.families[fk] = { n: wv.length, median_weber: +med(wv).toFixed(4), median_abs_weber: +med(ab).toFixed(4), mean_abs_weber: +mean(ab).toFixed(4) };
    }
    const bgIdx = Array.from({ length: 100 * 100 }, (_, k) => (20 + ((k / 100) | 0)) * W + 20 + (k % 100));
    row.L_background_topleft = +meanLum(S, bgIdx, W).toFixed(5);
    out.q6.renders[name] = row;
  }
  for (const fk of Object.keys(fam)) {
    const base = weberPerComp[`${fk}|input`];
    const order = base.map((v, i) => [Math.abs(v), i] as const).sort((a, b) => b[0] - a[0]).slice(0, 10).map((x) => x[1]);
    out.q6[`strongest10_${fk}_meanAbsWeber`] = Object.fromEntries(
      renders.map(([name]) => [name, +(order.reduce((s, i) => s + Math.abs(weberPerComp[`${fk}|${name}`][i]), 0) / order.length).toFixed(4)]),
    );
  }

  // ---------------- Q7 ----------------
  const inp3 = await load(p("inputs/p3a_hd.jpg"));
  const sim = await load(p("sim_p3a/result.png"));
  const W3 = inp3.w, H3 = inp3.h;
  const spot3 = await alphaPlane("sa_hd_p3a/hd_age_spot.png");
  const red3 = await alphaPlane("sa_hd_p3a/hd_redness.png");
  const tex3 = await alphaPlane("sa_hd_p3a/hd_texture_whole.png");
  const eb3 = await alphaPlane("sa_hd_p3a/hd_eye_bag.png");
  const spotC3 = components(W3, H3, (i) => spot3.A[i] !== 51);
  const Sin = sampler(inp3, 0), Ssim = sampler(sim, 0);
  const meanLab = (S: Sampler, idx: number[], w: number) => {
    let L = 0, a = 0, b = 0, n = 0;
    for (const i of idx) {
      const c = S(i % w, (i / w) | 0);
      if (!c) continue;
      const l = lab(c[0], c[1], c[2]);
      L += l[0]; a += l[1]; b += l[2]; n++;
    }
    return { L: +(L / n).toFixed(3), a: +(a / n).toFixed(3), b: +(b / n).toFixed(3), n };
  };
  // redness zone: pixels with alpha < 51 (cut-outs in the dark overlay); core = alpha <= 25
  const zone: number[] = [], zoneCore: number[] = [];
  for (let i = 0; i < W3 * H3; i++) if (red3.A[i] < 51) { zone.push(i); if (red3.A[i] <= 25) zoneCore.push(i); }
  const skinOther: number[] = [], skinWin: number[] = [];
  for (let i = 0; i < W3 * H3; i++) if (tex3.A[i] === 0) { skinWin.push(i); if (red3.A[i] >= 51 && spot3.A[i] === 51) skinOther.push(i); }
  const q7: any = { size_in: `${W3}x${H3}`, size_sim: `${sim.w}x${sim.h}`, zonePx: zone.length, zoneCorePx: zoneCore.length, skinOtherPx: skinOther.length };
  q7.redness_zone_Lab = { input: meanLab(Sin, zone, W3), sim: meanLab(Ssim, zone, W3) };
  q7.redness_zone_core_Lab = { input: meanLab(Sin, zoneCore, W3), sim: meanLab(Ssim, zoneCore, W3) };
  q7.skinOutsideZone_Lab = { input: meanLab(Sin, skinOther, W3), sim: meanLab(Ssim, skinOther, W3) };
  {
    let n = 0, sx = 0, sy = 0, sxx = 0, syy = 0, sxy = 0;
    for (let k = 0; k < skinWin.length; k += 3) {
      const i = skinWin[k];
      const c = Sin(i % W3, (i / W3) | 0)!;
      const a = lab(c[0], c[1], c[2])[1];
      const x = 51 - red3.A[i];
      n++; sx += x; sy += a; sxx += x * x; syy += a * a; sxy += x * a;
    }
    q7.corr_maskDepth_vs_inputAstar_inTextureWindow = +((n * sxy - sx * sy) / Math.sqrt((n * sxx - sx * sx) * (n * syy - sy * sy))).toFixed(3);
  }
  const inExcl = new Uint8Array(W3 * H3);
  for (let i = 0; i < W3 * H3; i++) if (spot3.A[i] !== 51 || eb3.A[i] > 0) inExcl[i] = 1;
  const spotRes: { wi: number; ws: number; area: number; dL: number; da: number }[] = [];
  spotC3.comps.forEach((c, k) => {
    const { f, r } = ringFor(spotC3.label, k + 1, c, W3, H3, inExcl);
    if (f.length < 20 || r.length < 30) return;
    const Lfi = meanLum(Sin, f, W3), Lri = meanLum(Sin, r, W3), Lfs = meanLum(Ssim, f, W3), Lrs = meanLum(Ssim, r, W3);
    const li = meanLab(Sin, f, W3), ls = meanLab(Ssim, f, W3);
    spotRes.push({ wi: (Lfi - Lri) / Lri, ws: (Lfs - Lrs) / Lrs, area: f.length, dL: ls.L - li.L, da: ls.a - li.a });
  });
  const summarise = (rows: typeof spotRes) => ({
    n: rows.length,
    median_abs_weber_input: +med(rows.map((r) => Math.abs(r.wi))).toFixed(4),
    median_abs_weber_sim: +med(rows.map((r) => Math.abs(r.ws))).toFixed(4),
    mean_abs_weber_input: +mean(rows.map((r) => Math.abs(r.wi))).toFixed(4),
    mean_abs_weber_sim: +mean(rows.map((r) => Math.abs(r.ws))).toFixed(4),
    median_ratio_sim_over_input: +med(rows.map((r) => Math.abs(r.ws) / Math.max(1e-6, Math.abs(r.wi)))).toFixed(3),
    median_dL_star_inside: +med(rows.map((r) => r.dL)).toFixed(3),
  });
  q7.spots_all = summarise(spotRes);
  q7.spots_strongest20 = summarise([...spotRes].sort((a, b) => Math.abs(b.wi) - Math.abs(a.wi)).slice(0, 20));
  q7.spots_largest30 = summarise([...spotRes].sort((a, b) => b.area - a.area).slice(0, 30));
  const madIn = (idx: number[]) => {
    let s = 0, n = 0;
    for (const i of idx) {
      const a = Sin(i % W3, (i / W3) | 0)!, b = Ssim(i % W3, (i / W3) | 0)!;
      s += (Math.abs(a[0] - b[0]) + Math.abs(a[1] - b[1]) + Math.abs(a[2] - b[2])) / 3;
      n++;
    }
    return +(s / n).toFixed(3);
  };
  const spotPx: number[] = [];
  for (let i = 0; i < W3 * H3; i++) if (spotC3.label[i]) spotPx.push(i);
  const bgPx = Array.from({ length: 100 * 100 }, (_, k) => (20 + ((k / 100) | 0)) * W3 + 20 + (k % 100));
  q7.meanAbsDiff_rgb = { inside_spot_components: madIn(spotPx), inside_redness_zone: madIn(zone), skin_outside_zone_and_spots: madIn(skinOther), background_corner: madIn(bgPx) };
  out.q7 = q7;
  writeJson("vto_sim_analysis.json", out);
  console.log(JSON.stringify(out.q6, null, 1));
  console.log(JSON.stringify(out.q7, null, 1));
}
main();
