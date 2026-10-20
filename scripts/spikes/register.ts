// Q3 (cont.): patch-wise sub-pixel registration of VTO / simulation output vs input.
// For each textured patch in the input, find the shift (dx,dy) such that out(x+dx, y+dy) ~ in(x,y), via normalised
// cross-correlation on blurred luminance + parabolic sub-pixel refinement.
import sharp from "sharp";
import { p, lumY, writeJson } from "./lib";

async function grayBlur(file: string, sigma: number) {
  const { data, info } = await sharp(file).removeAlpha().blur(sigma).raw().toBuffer({ resolveWithObject: true });
  const g = new Float64Array(info.width * info.height);
  for (let i = 0; i < g.length; i++) g[i] = 255 * lumY(data[i * 3], data[i * 3 + 1], data[i * 3 + 2]);
  return { g, w: info.width, h: info.height };
}
function ncc(A: ReturnType<typeof Object>, a: any, b: any, cx: number, cy: number, half: number, dx: number, dy: number) {
  let sa = 0, sb = 0, saa = 0, sbb = 0, sab = 0, n = 0;
  for (let y = cy - half; y < cy + half; y++)
    for (let x = cx - half; x < cx + half; x++) {
      const va = a.g[y * a.w + x];
      const xb = x + dx, yb = y + dy;
      const vb = b.g[yb * b.w + xb];
      sa += va; sb += vb; saa += va * va; sbb += vb * vb; sab += va * vb; n++;
    }
  const ma = sa / n, mb = sb / n;
  const cov = sab / n - ma * mb, va = saa / n - ma * ma, vb = sbb / n - mb * mb;
  return cov / Math.sqrt(va * vb + 1e-9);
}
function sub(m1: number, m0: number, p1: number) {
  const d = m1 - 2 * m0 + p1;
  return d === 0 ? 0 : (0.5 * (m1 - p1)) / d;
}
export async function registerPair(inFile: string, outFile: string, label: string) {
  const a = await grayBlur(inFile, 1.2);
  const b = await grayBlur(outFile, 1.2);
  const half = 48, R = 6;
  const rows: any[] = [];
  const cols = [180, 330, 540, 750, 900];
  const rowsY = [60, 200, 330, 460, 600, 740, 880, 1020, 1160, 1280].filter((y) => y + half + R < Math.min(a.h, b.h));
  for (const cy of rowsY)
    for (const cx of cols) {
      // textureness
      let s = 0, ss = 0, n = 0;
      for (let y = cy - half; y < cy + half; y += 2) for (let x = cx - half; x < cx + half; x += 2) { const v = a.g[y * a.w + x]; s += v; ss += v * v; n++; }
      const sd = Math.sqrt(ss / n - (s / n) ** 2);
      if (sd < 12) continue;
      const sc: Record<string, number> = {};
      let best = { dx: 0, dy: 0, v: -2 };
      for (let dy = -R; dy <= R; dy++)
        for (let dx = -R; dx <= R; dx++) {
          const v = ncc(null as any, a, b, cx, cy, half, dx, dy);
          sc[`${dx},${dy}`] = v;
          if (v > best.v) best = { dx, dy, v };
        }
      const fx = best.dx > -R && best.dx < R ? sub(sc[`${best.dx - 1},${best.dy}`], best.v, sc[`${best.dx + 1},${best.dy}`]) : 0;
      const fy = best.dy > -R && best.dy < R ? sub(sc[`${best.dx},${best.dy - 1}`], best.v, sc[`${best.dx},${best.dy + 1}`]) : 0;
      rows.push({ cx, cy, sd: +sd.toFixed(1), dx: +(best.dx + fx).toFixed(2), dy: +(best.dy + fy).toFixed(2), ncc: +best.v.toFixed(3) });
    }
  // linear fit dy = a + b*y over patches with ncc>0.8
  const good = rows.filter((r) => r.ncc > 0.8);
  const n = good.length;
  const sx = good.reduce((s, r) => s + r.cy, 0), sy = good.reduce((s, r) => s + r.dy, 0);
  const sxx = good.reduce((s, r) => s + r.cy * r.cy, 0), sxy = good.reduce((s, r) => s + r.cy * r.dy, 0);
  const slope = (n * sxy - sx * sy) / (n * sxx - sx * sx);
  const icpt = (sy - slope * sx) / n;
  const mean = (k: string) => +(good.reduce((s, r) => s + r[k], 0) / n).toFixed(3);
  const sdv = (k: string) => { const m = good.reduce((s, r) => s + r[k], 0) / n; return +Math.sqrt(good.reduce((s, r) => s + (r[k] - m) ** 2, 0) / n).toFixed(3); };
  const summary = { label, patches: rows.length, goodPatches: n, dx_mean: mean("dx"), dx_sd: sdv("dx"), dy_mean: mean("dy"), dy_sd: sdv("dy"), dy_fit_intercept: +icpt.toFixed(3), dy_fit_slope_per_px: +slope.toExponential(3), dy_at_top: +(icpt + slope * 60).toFixed(2), dy_at_bottom: +(icpt + slope * 1280).toFixed(2), minNcc: Math.min(...good.map((r) => r.ncc)), medNcc: good.map((r) => r.ncc).sort()[Math.floor(n / 2)] };
  return { summary, rows };
}
async function main() {
  const res: any = {};
  for (const [label, f] of [
    ["conc20", "mu_conc20_p2b/result.jpg"], ["conc50", "mu_conc50_p2b/result.jpg"], ["conc90", "mu_conc90_p2b/result.jpg"],
    ["found30", "mu_found30_p2b/result.jpg"], ["found80", "mu_found80_p2b/result.jpg"],
  ]) {
    const r = await registerPair(p("inputs/p2b_hd.jpg"), p(f), label);
    res[label] = r;
    console.log(JSON.stringify(r.summary));
  }
  const s = await registerPair(p("inputs/p3a_hd.jpg"), p("sim_p3a/result.png"), "sim_p3a");
  res.sim_p3a = s;
  console.log(JSON.stringify(s.summary));
  console.log("conc90 detail:"); for (const r of res.conc90.rows) console.log(JSON.stringify(r));
  writeJson("registration.json", res);
}
if (require.main === module) main();
