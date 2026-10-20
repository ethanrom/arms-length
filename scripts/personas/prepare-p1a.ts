/**
 * Free, local: builds fixtures/youcam/p1a/input.jpg from the raw persona photo.
 *   npx tsx scripts/personas/prepare-p1a.ts "E:/hackathons/youcam-api/internal/personas/raw/p1-a.jpg"
 * Same recipe as the p2b input in scripts/spikes/youcam-spike.ts: Lanczos3 to a 1080 px short side (1.27x here,
 * inside the 2x rule for HD), JPEG q95. The face already fills about 68% of the width, so no crop.
 */
import path from "node:path";
import sharp from "sharp";

const src = process.argv[2];
if (!src) throw new Error("usage: prepare-p1a.ts <raw p1-a.jpg>");
const dest = path.join(process.cwd(), "fixtures", "youcam", "p1a", "input.jpg");

async function main() {
  const meta = await sharp(src).metadata();
  const short = Math.min(meta.width!, meta.height!);
  const scale = 1080 / short;
  if (scale > 2) throw new Error(`upscale ${scale.toFixed(2)}x exceeds the 2x rule`);
  await sharp(src)
    .resize({ width: 1080, kernel: "lanczos3" })
    .jpeg({ quality: 95 })
    .toFile(dest);
  const out = await sharp(dest).metadata();
  console.log(`${meta.width}x${meta.height} -> ${out.width}x${out.height} (${scale.toFixed(3)}x) -> ${dest}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
