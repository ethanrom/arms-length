// Q5/Q8: score tables, response shapes, HD-vs-SD agreement; free GET re-poll of one task to see raw JSON number types.
import fs from "node:fs";
import sharp from "sharp";
import JSONbig from "json-bigint";
import { p, load, components, writeJson } from "./lib";

const JB = JSONbig({ storeAsString: true });
const read = (l: string) => JB.parse(fs.readFileSync(p(`result_${l}.json`), "utf8")).json.data.results.output as any[];
const key = (o: any) => o.type + (o.region ? `:${o.region}` : "");

async function main() {
  const hd2 = read("sa_hd_p2b"), sd2 = read("sa_sd_p2b"), hd3 = read("sa_hd_p3a");
  const num = (v: any) => (v === undefined ? "" : (+v).toFixed(2));
  console.log("| concern | HD p2b raw / ui | SD p2b raw / ui | HD p3a raw / ui |");
  const sdName: Record<string, string> = { hd_dark_circle: "dark_circle_v2" };
  const rows = new Map<string, any>();
  for (const o of hd2) rows.set(key(o), { hd2: o });
  for (const o of hd3) rows.set(key(o), { ...(rows.get(key(o)) ?? {}), hd3: o });
  for (const o of sd2) { const k = o.type === "dark_circle_v2" ? "hd_dark_circle" : o.type.replace(/^/, "hd_"); const kk = [...rows.keys()].find((x) => x === k || x.startsWith(k + ":whole") || x === k); const r = rows.get(kk ?? k) ?? {}; rows.set(kk ?? k, { ...r, sd2: o }); }
  for (const [k, r] of rows) {
    const f = (o: any) => (o ? (o.score !== undefined ? `score ${o.score}` : `${num(o.raw_score)} / ${o.ui_score}`) : "-");
    console.log(`| ${k} | ${f(r.hd2)} | ${f(r.sd2)} | ${f(r.hd3)} |`);
  }
  void sdName;

  // HD-vs-SD agreement on p2b (centroid matching)
  const comp = async (file: string, pred: (a: number) => boolean) => {
    const m = await load(p(file), true);
    const A = new Uint8Array(m.w * m.h);
    for (let i = 0; i < A.length; i++) A[i] = m.data[i * 4 + 3];
    return { c: components(m.w, m.h, (i) => pred(A[i])), A, w: m.w, h: m.h };
  };
  const near = (a: { cx: number; cy: number }[], b: { cx: number; cy: number }[], r: number) => a.filter((x) => b.some((y) => Math.hypot(x.cx - y.cx, x.cy - y.cy) <= r)).length;
  const out: any = {};
  for (const [name, hdF, hdPred, sdF, sdPred] of [
    ["pore", "sa_hd_p2b/hd_pore_whole.png", (a: number) => a > 128, "sa_sd_p2b/pore.png", (a: number) => a > 0],
    ["acne", "sa_hd_p2b/hd_acne_whole.png", (a: number) => a !== 92, "sa_sd_p2b/acne.png", (a: number) => a > 0],
    ["age_spot", "sa_hd_p2b/hd_age_spot.png", (a: number) => a !== 51, "sa_sd_p2b/age_spot.png", (a: number) => a > 16],
  ] as const) {
    const h = await comp(hdF, hdPred), s = await comp(sdF, sdPred);
    const hc = h.c.comps, sc = s.c.comps;
    out[name] = { hd: hc.length, sd: sc.length, hdWithinR8OfSd: near(hc, sc, 8), sdWithinR8OfHd: near(sc, hc, 8), hdWithinR20OfSd: near(hc, sc, 20), sdWithinR20OfHd: near(sc, hc, 20) };
    console.log(name, JSON.stringify(out[name]));
  }
  // pixel overlap for dark circle and eye bag HD vs SD
  for (const [name, hdF, sdF] of [["dark_circle", "sa_hd_p2b/hd_dark_circle.png", "sa_sd_p2b/dark_circle_v2.png"], ["eye_bag", "sa_hd_p2b/hd_eye_bag.png", "sa_sd_p2b/eye_bag.png"]] as const) {
    const h = await comp(hdF, (a) => a > 0), s = await comp(sdF, (a) => a > 0);
    // restrict HD eye_bag to its two big comps
    const keep = new Set(h.c.comps.map((c, k) => [c.area, k + 1] as const).filter(([a]) => a > 1000).map(([, k]) => k));
    let inter = 0, uni = 0, hdPx = 0, sdPx = 0, absDiffAlpha = 0;
    for (let i = 0; i < h.A.length; i++) {
      const hv = keep.has(h.c.label[i]) ? h.A[i] : 0, sv = s.A[i];
      if (hv > 0) hdPx++;
      if (sv > 0) sdPx++;
      if (hv > 0 && sv > 0) inter++;
      if (hv > 0 || sv > 0) uni++;
      absDiffAlpha += Math.abs(hv - sv);
    }
    out[name + "_hd_vs_sd"] = { hdPx, sdPx, IoU: +(inter / uni).toFixed(3), meanAbsAlphaDiffOverUnion: +(absDiffAlpha / uni).toFixed(2) };
    console.log(name, JSON.stringify(out[name + "_hd_vs_sd"]));
  }
  // identical resize images?
  out.resize_identical_hd_sd = fs.readFileSync(p("sa_hd_p2b/resize_image.jpg")).equals(fs.readFileSync(p("sa_sd_p2b/resize_image.jpg")));
  // image container formats of renders
  for (const f of ["mu_conc20_p2b/result.jpg", "sim_p3a/result.png", "sa_hd_p2b/resize_image.jpg", "sa_hd_p2b/hd_pore_whole.png"]) {
    const m = await sharp(p(f)).metadata();
    out["format:" + f] = { format: m.format, channels: m.channels, hasAlpha: m.hasAlpha, density: m.density, space: m.space, hasProfile: m.hasProfile };
    console.log(f, JSON.stringify(out["format:" + f]), "bytes", fs.statSync(p(f)).size);
  }
  writeJson("scores_shapes.json", out);

  // free GET on a recorded task: inspect raw number literals (never prints the key)
  const t = JSON.parse(fs.readFileSync(p("state.json"), "utf8")).tasks["sa_hd_p2b"];
  const res = await fetch(`https://yce-api-01.makeupar.com/s2s/${t.slug}/${t.id}`, { headers: { Authorization: `Bearer ${process.env.YOUCAM_API_KEY}` } });
  const txt = await res.text();
  console.log("free re-poll status", res.status, "ct", res.headers.get("content-type"), "len", txt.length);
  const literals = [...txt.matchAll(/"(raw_score|ui_score|score)":\s*([^,}\s]+)/g)].slice(0, 8).map((m) => `${m[1]}=${m[2]}`);
  console.log("raw literals:", literals.join("  "));
  console.log("task_status literal:", txt.match(/"task_status":\s*"[a-z]+"/)?.[0], "| top-level keys:", Object.keys(JSON.parse(txt)).join(","), "| error:", txt.match(/"error":\s*[^,}]+/)?.[0]);
  console.log("response headers of interest:", ["x-ratelimit-remaining", "x-ratelimit-limit", "retry-after", "x-request-id"].map((h) => `${h}=${res.headers.get(h)}`).join(" "));
}
main();
