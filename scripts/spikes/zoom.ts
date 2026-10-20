import sharp from "sharp";
import fs from "node:fs";
import { p } from "./lib";
async function tile(photo: string, masks: string[], box: { left: number; top: number; width: number; height: number }, z: number) {
  let base = sharp(photo);
  const comps = masks.map((m) => ({ input: fs.readFileSync(p(m)), blend: "over" as const }));
  const full = await base.composite(comps).png().toBuffer();
  return sharp(full).extract(box).resize({ width: box.width * z, kernel: "nearest" }).png().toBuffer();
}
async function main() {
  const box = { left: 560, top: 640, width: 300, height: 260 }; // p2b right cheek (viewer right): dark spots + age-spot contours
  const z = 3;
  const photo = p("inputs/p2b_hd.jpg");
  const plain = await sharp(photo).extract(box).resize({ width: box.width * z, kernel: "nearest" }).png().toBuffer();
  const hd = await tile(photo, ["sa_hd_p2b/hd_age_spot.png", "sa_hd_p2b/hd_acne_whole.png"], box, z);
  const sd = await tile(photo, ["sa_sd_p2b/age_spot.png", "sa_sd_p2b/acne.png"], box, z);
  const W = box.width * z, H = box.height * z;
  await sharp({ create: { width: W * 3 + 20, height: H, channels: 3, background: "#fff" } })
    .composite([{ input: plain, left: 0, top: 0 }, { input: hd, left: W + 10, top: 0 }, { input: sd, left: 2 * W + 20, top: 0 }])
    .png().toFile(p("overlays/zoom_p2b_cheek_plain_HD_SD.png"));
  // pores + acne on forehead, HD vs SD
  const box2 = { left: 380, top: 330, width: 300, height: 220 };
  const plain2 = await sharp(photo).extract(box2).resize({ width: box2.width * z, kernel: "nearest" }).png().toBuffer();
  const hd2 = await tile(photo, ["sa_hd_p2b/hd_pore_whole.png", "sa_hd_p2b/hd_acne_whole.png"], box2, z);
  const sd2 = await tile(photo, ["sa_sd_p2b/pore.png", "sa_sd_p2b/acne.png"], box2, z);
  const W2 = box2.width * z, H2 = box2.height * z;
  await sharp({ create: { width: W2 * 3 + 20, height: H2, channels: 3, background: "#fff" } })
    .composite([{ input: plain2, left: 0, top: 0 }, { input: hd2, left: W2 + 10, top: 0 }, { input: sd2, left: 2 * W2 + 20, top: 0 }])
    .png().toFile(p("overlays/zoom_p2b_forehead_pores_plain_HD_SD.png"));
}
main();
