import { p } from "./lib";
const a = require(p("mask_analysis.json"));
const d: Record<string, any> = { "HD p2b": require(p("sa_hd_p2b_describe.json")), "SD p2b": require(p("sa_sd_p2b_describe.json")), "HD p3a": require(p("sa_hd_p3a_describe.json")) };
const names: Record<string, string[]> = {
  "HD p2b": ["hd_acne_whole", "hd_age_spot", "hd_pore_whole", "hd_wrinkle_whole", "hd_dark_circle", "hd_eye_bag", "hd_redness", "hd_texture_whole"],
  "SD p2b": ["acne", "age_spot", "pore", "wrinkle", "dark_circle_v2", "eye_bag", "redness", "texture"],
  "HD p3a": ["hd_acne_whole", "hd_age_spot", "hd_pore_whole", "hd_wrinkle_whole", "hd_dark_circle", "hd_eye_bag", "hd_redness", "hd_texture_whole"],
};
console.log("| set | mask | px nonzero | mean alpha (nonzero) | max | modal alpha | distinct values | alpha==0 | alpha==255 |");
console.log("|---|---|---|---|---|---|---|---|---|");
for (const s of Object.keys(names)) for (const n of names[s]) {
  const r = a[s][n], x = d[s][n + ".png"].alpha;
  console.log(`| ${s} | ${n} | ${(100 * x.fraction).toFixed(2)}% | ${x.meanNonzero} | ${x.max} | ${r.modalAlpha} | ${r.distinctAlpha} | ${(100 * r.frac_a0).toFixed(2)}% | ${(100 * r.frac_a255).toFixed(2)}% |`);
}
