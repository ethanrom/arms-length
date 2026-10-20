/**
 * Free, local: builds fixtures/youcam/<persona>/input.jpg from a raw persona photo.
 *   npx tsx scripts/personas/prepare-input.ts "<raw.jpg>" p1a                  # no crop
 *   npx tsx scripts/personas/prepare-input.ts "<raw.jpg>" p5a 102,103,732,915  # crop x,y,w,h first
 * Lanczos3 to a 1080 px short side, JPEG q95 (the p2b recipe in scripts/spikes/youcam-spike.ts). HD allows up to 2x upscale.
 * The crop brings the face to about 70% of the width (YouCam needs over 60%): lib/capture/resize.ts planResize gives the box,
 * and scripts/scale/fixtures.ts prints it for a persona folder that holds the raw photo as input.jpg.
 * p1a: 848x1264 -> 1080x1610 (1.274x, face already 72%, no crop). p5a: crop 102,103,732,915 of 928x1152 -> 1080x1350 (1.475x).
 */
import fs from "node:fs";
import path from "node:path";
import sharp from "sharp";

const [src, persona, cropArg] = process.argv.slice(2);
if (!src || !persona) throw new Error("usage: prepare-input.ts <raw.jpg> <persona> [x,y,w,h]");
const dest = path.join(process.cwd(), "fixtures", "youcam", persona, "input.jpg");

async function main() {
  const meta = await sharp(src).metadata();
  let img = sharp(src);
  let w = meta.width!;
  let h = meta.height!;
  if (cropArg) {
    const [left, top, width, height] = cropArg.split(",").map(Number);
    img = img.extract({ left, top, width, height });
    w = width;
    h = height;
  }
  const scale = 1080 / Math.min(w, h);
  if (scale > 2) throw new Error(`upscale ${scale.toFixed(2)}x exceeds the 2x rule`);
  // Encode to a buffer first so the output path may equal the raw copy in the persona folder.
  const buf = await img.resize({ width: Math.round(w * scale), kernel: "lanczos3" }).jpeg({ quality: 95 }).toBuffer();
  fs.writeFileSync(dest, buf);
  const out = await sharp(dest).metadata();
  console.log(`${meta.width}x${meta.height}${cropArg ? ` crop ${cropArg}` : ""} -> ${out.width}x${out.height} (${scale.toFixed(3)}x) -> ${dest}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
