import fs from "node:fs";
import path from "node:path";
import { loadPersona } from "@/lib/skin/fixtures-io";
import { measureAnalysis } from "@/lib/skin/measure";
import { buildVisibilityReport } from "@/lib/vision/report";
import { DEFAULT_VIEWING } from "@/lib/contracts";

const q = (a: number[], p: number) => { const s = [...a].sort((x, y) => x - y); return s[Math.min(s.length - 1, Math.floor(p * (s.length - 1)))]; };
async function main() {
  const persona = process.argv[2] ?? "p2b";
  const p = await loadPersona(persona, "hd");
  const scale = JSON.parse(fs.readFileSync(path.join("fixtures/youcam", persona, "scale.json"), "utf8"));
  const m = measureAnalysis(p.analysis, p.masks, p.photo, scale);
  const r = buildVisibilityReport(m, DEFAULT_VIEWING);
  const byId = new Map(r.targets.map((t) => [t.targetId, t]));
  for (const concern of ["pore", "acne", "age_spot", "wrinkle"]) {
    const fs_ = m.features.filter((f) => f.concern === concern);
    const d = fs_.map((f) => byId.get(f.id)!.distanceM), n = fs_.map((f) => byId.get(f.id)!.nominalM ?? NaN);
    const size = fs_.map((f) => f.diameterMm ?? f.widthMm ?? 0), c = fs_.map((f) => Math.abs(f.contrast.lum));
    console.log(`${concern}: n=${fs_.length}  bound p10/50/90=${[0.1,0.5,0.9].map(x=>q(d,x).toFixed(2)).join("/")}  nominal p50/90=${q(n,0.5).toFixed(2)}/${q(n,0.9).toFixed(2)}  size p50=${q(size,0.5).toFixed(2)}mm  |c| p50/90=${q(c,0.5).toFixed(3)}/${q(c,0.9).toFixed(3)}`);
    const top = fs_.map((f) => ({ f, t: byId.get(f.id)! })).sort((a, b) => b.t.distanceM - a.t.distanceM).slice(0, 3);
    for (const { f, t } of top) console.log(`   top ${f.id} d=${t.distanceM.toFixed(2)} nom=${(t.nominalM??0).toFixed(2)} size=${(f.diameterMm ?? f.widthMm ?? 0).toFixed(2)}mm len=${(f.lengthMm??0).toFixed(1)} c=${f.contrast.lum.toFixed(3)} src=${f.sizeSource} at ${Math.round(f.centroid.x)},${Math.round(f.centroid.y)}`);
  }
  for (const g of m.regions) { const t = byId.get(g.id)!; console.log(`${g.id}: ${g.widthMm.toFixed(1)}x${g.heightMm.toFixed(1)}mm c=${g.contrast.lum.toFixed(3)} rg=${g.contrast.rg.toFixed(3)} d=${t.distanceM.toFixed(2)} nom=${(t.nominalM??0).toFixed(2)}`); }
}
main();
