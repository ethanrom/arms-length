import sharp from "sharp";
import { p } from "./lib";
async function main() {
  const [a, b] = [p("inputs/p2b_hd.jpg"), p("mu_conc90_p2b/result.jpg")];
  const A = await sharp(a).resize({ width: 540 }).toBuffer();
  const B = await sharp(b).resize({ width: 540 }).toBuffer();
  await sharp({ create: { width: 1080 + 10, height: 680, channels: 3, background: "#fff" } })
    .composite([{ input: A, left: 0, top: 0 }, { input: B, left: 550, top: 0 }])
    .png().toFile(p("overlays/p2b_input_vs_conc90.png"));
}
main();
