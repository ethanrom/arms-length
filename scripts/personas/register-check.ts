/**
 * Free, local: how does each recorded render sit on its persona's input? Patch-wise NCC registration (the spike's
 * scripts/spikes/register.ts), then a straight-line fit of dx against x and dy against y: a constant dx is a crop or shift,
 * a slope is a rescale.
 *   npx tsx scripts/personas/register-check.ts p3a/renders/foundation_cov50.png ...            # report
 *   npx tsx scripts/personas/register-check.ts --write p3a/renders/foundation_cov50.png ...    # also record in renders/offsets.json
 * Convention (lib/youcam/render.ts): out(x + dx, y + dy) = in(x, y). offsets.json is a measured sidecar; nothing reads it yet.
 */
import fs from "node:fs";
import path from "node:path";
import sharp from "sharp";
import { registerPair } from "../spikes/register";
import { FIXTURES } from "./common";

const fit = (xs: number[], ys: number[]) => {
  const n = xs.length;
  const sx = xs.reduce((a, b) => a + b, 0);
  const sy = ys.reduce((a, b) => a + b, 0);
  const sxx = xs.reduce((a, b) => a + b * b, 0);
  const sxy = xs.reduce((a, x, i) => a + x * ys[i], 0);
  const slope = (n * sxy - sx * sy) / (n * sxx - sx * sx);
  return { intercept: (sy - slope * sx) / n, slope };
};

/** Count of fully black (0,0,0) lines on each edge: the engine pads its output to an even size with black. */
async function blackEdges(file: string) {
  const { data, info } = await sharp(file).removeAlpha().raw().toBuffer({ resolveWithObject: true });
  const { width: W, height: H } = info;
  const rowBlack = (y: number) => { for (let x = 0; x < W * 3; x++) if (data[y * W * 3 + x] !== 0) return false; return true; };
  const colBlack = (x: number) => { for (let y = 0; y < H; y++) for (let c = 0; c < 3; c++) if (data[(y * W + x) * 3 + c] !== 0) return false; return true; };
  const run = (n: number, test: (i: number) => boolean, from: number, step: number) => { let k = 0; while (k < n && test(from + step * k)) k++; return k; };
  return { top: run(H, rowBlack, 0, 1), bottom: run(H, rowBlack, H - 1, -1), left: run(W, colBlack, 0, 1), right: run(W, colBlack, W - 1, -1) };
}

async function main() {
  const write = process.argv.includes("--write");
  const sidecars: Record<string, Record<string, unknown>> = {};
  for (const rel of process.argv.slice(2).filter((a) => !a.startsWith("--"))) {
    const [persona] = rel.split("/");
    const input = path.join(FIXTURES, persona, "input.jpg");
    const render = path.join(FIXTURES, rel);
    const [mi, mr] = [await sharp(input).metadata(), await sharp(render).metadata()];
    const { summary, rows } = await registerPair(input, render, rel);
    const good = rows.filter((r: { ncc: number }) => r.ncc > 0.8);
    const fx = fit(good.map((r: { cx: number }) => r.cx), good.map((r: { dx: number }) => r.dx));
    const fy = fit(good.map((r: { cy: number }) => r.cy), good.map((r: { dy: number }) => r.dy));
    (sidecars[persona] ??= {})[path.basename(rel)] = {
      dx: Math.round(summary.dx_mean),
      dy: Math.round(summary.dy_mean),
      dxMean: summary.dx_mean,
      dyMean: summary.dy_mean,
      dxSd: summary.dx_sd,
      dySd: summary.dy_sd,
      patches: summary.goodPatches,
      minNcc: summary.minNcc,
      blackEdges: await blackEdges(render),
      size: [mr.width, mr.height],
      inputSize: [mi.width, mi.height],
    };
    console.log(
      `${rel.padEnd(40)} in ${mi.width}x${mi.height} out ${mr.width}x${mr.height} patches ${summary.goodPatches} minNcc ${summary.minNcc} ` +
        `dx ${summary.dx_mean} (sd ${summary.dx_sd}) fit ${fx.intercept.toFixed(2)}+${(fx.slope * 1000).toFixed(2)}e-3*x | dy ${summary.dy_mean} (sd ${summary.dy_sd}) fit ${fy.intercept.toFixed(2)}+${(fy.slope * 1000).toFixed(2)}e-3*y`,
    );
  }
  if (write) {
    for (const [persona, renders] of Object.entries(sidecars)) {
      const file = path.join(FIXTURES, persona, "renders", "offsets.json");
      const old = fs.existsSync(file) ? JSON.parse(fs.readFileSync(file, "utf8")).renders : {};
      const out = {
        convention:
          "out(x + dx, y + dy) = in(x, y). dx, dy are the rounded means of patch-wise registration against input.jpg (scripts/personas/register-check.ts)",
        renders: Object.fromEntries(Object.entries({ ...old, ...renders }).sort(([a], [b]) => a.localeCompare(b))),
      };
      fs.writeFileSync(file, JSON.stringify(out, null, 2) + "\n");
      console.log(`wrote ${path.relative(process.cwd(), file)}`);
    }
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
