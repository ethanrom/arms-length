// Q6 (cont.): does coverage change the *colour* contrast (CIELAB dE76) of the dark-circle region vs the band below it?
import { load, p, lab, components, writeJson } from "./lib";

async function main() {
  const W = 1080, H = 1341;
  const dcM = await load(p("sa_hd_p2b/hd_dark_circle.png"), true);
  const dc = new Uint8Array(W * H);
  for (let i = 0; i < dc.length; i++) dc[i] = dcM.data[i * 4 + 3];
  const cc = components(W, H, (i) => dc[i] > 0);
  const big = cc.comps.map((c, k) => ({ c, id: k + 1 })).sort((a, b) => b.c.area - a.c.area).slice(0, 2);
  const files: [string, string, number][] = [
    ["input", "inputs/p2b_hd.jpg", 0], ["conc20", "mu_conc20_p2b/result.jpg", 1], ["conc50", "mu_conc50_p2b/result.jpg", 1],
    ["conc90", "mu_conc90_p2b/result.jpg", 1], ["found30", "mu_found30_p2b/result.jpg", 1], ["found80", "mu_found80_p2b/result.jpg", 1],
  ];
  const out: any = {};
  for (const [name, f, dy] of files) {
    const im = await load(p(f));
    const at = (i: number) => { const x = i % W, y = ((i / W) | 0) + dy; const o = (y * im.w + x) * im.ch; return lab(im.data[o], im.data[o + 1], im.data[o + 2]); };
    for (const b of big) {
      const side = b.c.cx < W / 2 ? "left" : "right";
      const core: number[] = [];
      for (let i = 0; i < W * H; i++) if (cc.label[i] === b.id && dc[i] >= 64) core.push(i);
      const bw = b.c.x1 - b.c.x0;
      const band: number[] = [];
      for (let y = b.c.y1 + 25; y < b.c.y1 + 95; y++) for (let x = Math.round(b.c.x0 + 0.2 * bw); x < Math.round(b.c.x1 - 0.2 * bw); x++) { const i = y * W + x; if (dc[i] === 0) band.push(i); }
      const m = (idx: number[]) => { let L = 0, a = 0, bb = 0; for (const i of idx) { const l = at(i); L += l[0]; a += l[1]; bb += l[2]; } return [L / idx.length, a / idx.length, bb / idx.length]; };
      const c = m(core), r = m(band);
      const dE = Math.hypot(c[0] - r[0], c[1] - r[1], c[2] - r[2]);
      (out[name] ??= {})[side] = { core_Lab: c.map((v) => +v.toFixed(2)), band_Lab: r.map((v) => +v.toFixed(2)), dL: +(c[0] - r[0]).toFixed(2), da: +(c[1] - r[1]).toFixed(2), db: +(c[2] - r[2]).toFixed(2), dE76: +dE.toFixed(2) };
    }
  }
  for (const [k, v] of Object.entries<any>(out)) console.log(k.padEnd(8), "left dE", v.left.dE76, `(dL ${v.left.dL}, da ${v.left.da}, db ${v.left.db})`, " right dE", v.right.dE76, `(dL ${v.right.dL}, da ${v.right.da}, db ${v.right.db})`);
  writeJson("vto_colour.json", out);
}
main();
