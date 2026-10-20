// Quick structural probe of mask PNGs: alpha histogram + RGB stats per alpha class.
import sharp from "sharp";
import path from "node:path";
const OUT = path.resolve(__dirname, "../../internal/research/spike-data");
async function main() {
  for (const f of process.argv.slice(2)) {
    const { data, info } = await sharp(path.join(OUT, f)).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
    const hist = new Map<number, number>();
    const rgbByAlpha = new Map<number, { n: number; r: number; g: number; b: number; minr: number; maxr: number }>();
    for (let i = 0; i < data.length; i += 4) {
      const a = data[i + 3];
      hist.set(a, (hist.get(a) ?? 0) + 1);
      let e = rgbByAlpha.get(a);
      if (!e) rgbByAlpha.set(a, (e = { n: 0, r: 0, g: 0, b: 0, minr: 255, maxr: 0 }));
      e.n++; e.r += data[i]; e.g += data[i + 1]; e.b += data[i + 2];
      if (data[i] < e.minr) e.minr = data[i];
      if (data[i] > e.maxr) e.maxr = data[i];
    }
    const top = [...hist.entries()].sort((a, b) => b[1] - a[1]).slice(0, 8);
    console.log(`== ${f} ${info.width}x${info.height} distinct alpha=${hist.size}`);
    for (const [a, n] of top) {
      const e = rgbByAlpha.get(a)!;
      console.log(`  alpha=${a} n=${n} (${((100 * n) / (info.width * info.height)).toFixed(2)}%) meanRGB=(${(e.r / e.n).toFixed(0)},${(e.g / e.n).toFixed(0)},${(e.b / e.n).toFixed(0)}) R range ${e.minr}-${e.maxr}`);
    }
  }
}
main();
