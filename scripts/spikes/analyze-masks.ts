// Q4/Q5: mask granularity. Per mask: alpha structure, connected components under three foreground definitions:
//   A: alpha > 0           (literal threshold from the brief)
//   B: alpha > 128         (literal threshold from the brief)
//   C: "bg-aware" = alpha differs from the mask's modal (background) alpha by >= 1 (captures cut-outs and drawn marks)
//   D: "drawn marks" = alpha > modal alpha + 8 (marks brighter than the dark background) when bg > 0, else alpha > 0
import fs from "node:fs";
import { load, p, components, stats, writeJson } from "./lib";

const sets = [
  { label: "HD p2b", dir: "sa_hd_p2b" },
  { label: "SD p2b", dir: "sa_sd_p2b" },
  { label: "HD p3a", dir: "sa_hd_p3a" },
];
const bins = (areas: number[]) => {
  const edges = [4, 16, 64, 256, 1024, 1e9];
  const names = ["<=4", "5-16", "17-64", "65-256", "257-1024", ">1024"];
  const out: Record<string, number> = {};
  names.forEach((n) => (out[n] = 0));
  for (const a of areas) out[names[edges.findIndex((e) => a <= e)]]++;
  return out;
};
function compSummary(w: number, h: number, pred: (i: number) => boolean, minArea = 1) {
  const { comps } = components(w, h, pred, 8);
  const areas = comps.map((c) => c.area).filter((a) => a >= minArea);
  const diam = areas.map((a) => 2 * Math.sqrt(a / Math.PI));
  return {
    n: areas.length,
    area: stats(areas),
    eqDiamPx: { median: +(stats(diam) as any).median?.toFixed?.(1), p90: +(stats(diam) as any).p90?.toFixed?.(1), max: +(stats(diam) as any).max?.toFixed?.(1) },
    bins: bins(areas),
    comps,
  };
}

async function main() {
  const all: any = {};
  for (const s of sets) {
    all[s.label] = {};
    for (const f of fs.readdirSync(p(s.dir)).filter((x) => x.endsWith(".png"))) {
      const name = f.replace(".png", "");
      const m = await load(p(s.dir, f), true);
      const N = m.w * m.h;
      const A = new Uint8Array(N);
      const hist = new Uint32Array(256);
      for (let i = 0; i < N; i++) { A[i] = m.data[i * 4 + 3]; hist[A[i]]++; }
      let bg = 0;
      for (let a = 0; a < 256; a++) if (hist[a] > hist[bg]) bg = a;
      const distinct = hist.reduce((s, v) => s + (v ? 1 : 0), 0);
      const frac = (pred: (a: number) => boolean) => { let n = 0; for (let a = 0; a < 256; a++) if (pred(a)) n += hist[a]; return +(n / N).toFixed(5); };
      const row: any = {
        size: `${m.w}x${m.h}`, modalAlpha: bg, modalFrac: +(hist[bg] / N).toFixed(4), distinctAlpha: distinct,
        frac_a0: frac((a) => a === 0), frac_a255: frac((a) => a === 255), frac_gt0: frac((a) => a > 0), frac_gt128: frac((a) => a > 128),
        frac_diffFromModal: frac((a) => a !== bg),
      };
      const cA = compSummary(m.w, m.h, (i) => A[i] > 0);
      const cB = compSummary(m.w, m.h, (i) => A[i] > 128);
      const cC = compSummary(m.w, m.h, (i) => A[i] !== bg);
      const cD = compSummary(m.w, m.h, bg > 0 ? (i) => A[i] > bg + 8 : (i) => A[i] > 0);
      for (const [k, c] of [["alpha>0", cA], ["alpha>128", cB], ["differsFromBg", cC], ["drawnMarks(a>bg+8 | a>0)", cD]] as const) {
        const { comps, ...rest } = c;
        row[k] = rest;
      }
      // largest components of the bg-aware mask (for region masks)
      row.topComps_differsFromBg = cC.comps.sort((a, b) => b.area - a.area).slice(0, 4).map((c) => ({ area: c.area, bbox: [c.x0, c.y0, c.x1, c.y1], centroid: [Math.round(c.cx), Math.round(c.cy)] }));
      all[s.label][name] = row;
      console.log(`${s.label} ${name.padEnd(22)} bg=${bg}(${(100 * hist[bg] / N).toFixed(1)}%) distinct=${distinct}  >0:${cA.n}  >128:${cB.n}  diffBg:${cC.n} (med area ${(cC.area as any).median})  marks:${cD.n} (med area ${(cD.area as any).median})`);
    }
  }
  writeJson("mask_analysis.json", all);
}
main();
