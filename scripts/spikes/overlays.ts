// Composite every mask over its input image and save under overlays/. Also saves "foreground-only" views where
// pixels that differ from the mask's background alpha are shown bright on black.
import sharp from "sharp";
import fs from "node:fs";
import { p, load } from "./lib";

const sets: { label: string; dir: string; input: string }[] = [
  { label: "hdp2b", dir: "sa_hd_p2b", input: "inputs/p2b_hd.jpg" },
  { label: "sdp2b", dir: "sa_sd_p2b", input: "inputs/p2b_hd.jpg" },
  { label: "hdp3a", dir: "sa_hd_p3a", input: "inputs/p3a_hd.jpg" },
];
async function main() {
  fs.mkdirSync(p("overlays"), { recursive: true });
  for (const s of sets) {
    for (const f of fs.readdirSync(p(s.dir)).filter((x) => x.endsWith(".png"))) {
      const name = f.replace(".png", "");
      const maskBuf = fs.readFileSync(p(s.dir, f));
      await sharp(p(s.input)).composite([{ input: maskBuf, blend: "over" }]).png().toFile(p("overlays", `${s.label}__${name}.png`));
      // foreground-only: modal alpha = background
      const m = await load(p(s.dir, f), true);
      const hist = new Uint32Array(256);
      for (let i = 3; i < m.data.length; i += 4) hist[m.data[i]]++;
      let bg = 0;
      for (let a = 0; a < 256; a++) if (hist[a] > hist[bg]) bg = a;
      const out = Buffer.alloc(m.w * m.h * 3);
      for (let i = 0; i < m.w * m.h; i++) {
        const a = m.data[i * 4 + 3];
        const d = Math.abs(a - bg);
        const v = d < 3 ? 0 : Math.min(255, 80 + d);
        out[i * 3] = v; out[i * 3 + 1] = v; out[i * 3 + 2] = v;
      }
      await sharp(out, { raw: { width: m.w, height: m.h, channels: 3 } }).png().toFile(p("overlays", `${s.label}__${name}__fg.png`));
    }
  }
}
main();
