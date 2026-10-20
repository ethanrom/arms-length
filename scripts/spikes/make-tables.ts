// Prints markdown tables from mask_analysis.json for pasting into spike.md.
import { p } from "./lib";
const a = require(p("mask_analysis.json"));
const f = (v: any) => (v === undefined || v === null || Number.isNaN(v) ? "-" : String(v));
const rows: [string, string, string, string][] = [
  ["HD p2b", "hd_acne_whole", "acne", "bg-aware"], ["SD p2b", "acne", "acne", "alpha>0"], ["HD p3a", "hd_acne_whole", "acne", "bg-aware"],
  ["HD p2b", "hd_age_spot", "age_spot", "bg-aware"], ["SD p2b", "age_spot", "age_spot", "alpha>0"], ["HD p3a", "hd_age_spot", "age_spot", "bg-aware"],
  ["HD p2b", "hd_pore_whole", "pore", "marks"], ["SD p2b", "pore", "pore", "alpha>0"], ["HD p3a", "hd_pore_whole", "pore", "marks"],
  ["HD p2b", "hd_wrinkle_whole", "wrinkle", "alpha>0"], ["SD p2b", "wrinkle", "wrinkle", "alpha>0"], ["HD p3a", "hd_wrinkle_whole", "wrinkle", "alpha>0"],
];
console.log("| concern | set | mask | modal alpha (share) | distinct alpha | CC alpha>0 | CC alpha>128 | CC primary | primary area px: median / p90 / max | primary eq. diameter px (median) |");
console.log("|---|---|---|---|---|---|---|---|---|---|");
for (const [set, name, concern, prim] of rows) {
  const r = a[set][name];
  const key = prim === "bg-aware" ? "differsFromBg" : prim === "marks" ? "drawnMarks(a>bg+8 | a>0)" : "alpha>0";
  const c = r[key];
  console.log(`| ${concern} | ${set} | ${name} | ${r.modalAlpha} (${(100 * r.modalFrac).toFixed(1)}%) | ${r.distinctAlpha} | ${r["alpha>0"].n} | ${r["alpha>128"].n} | ${c.n} (${prim}) | ${f(c.area.median)} / ${f(c.area.p90)} / ${f(c.area.max)} | ${f(c.eqDiamPx.median)} |`);
}
