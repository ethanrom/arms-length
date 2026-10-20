/**
 * Dev check: compare the analytic stimuli with the original ModelFest images, if you have them locally.
 * The image file is NOT in the repo (no licence stated). Get `modelfest-stimuli` from the JOV supplement
 * (jovi-5-9-6_s01.zip on the J. Vision article page, doi 10.1167/5.9.6) and run:
 *   npx tsx scripts/eval/check-stimuli.ts path/to/modelfest-stimuli
 * 43 images x 256 x 256 raw 8-bit, g = 128 + 127 c (clipped to 1..255).
 */
import { readFileSync } from "node:fs";
import { ANALYTIC_STIMULI, MODELFEST_SIZE } from "../../eval/modelfest/stimuli";

const file = process.argv[2];
if (!file) {
  console.error("usage: tsx scripts/eval/check-stimuli.ts <modelfest-stimuli>");
  process.exit(1);
}
const raw = readFileSync(file);
const n = MODELFEST_SIZE * MODELFEST_SIZE;
if (raw.length !== 43 * n) throw new Error(`expected ${43 * n} bytes, got ${raw.length}`);

console.log("id  max|diff|  rms diff  (quantisation step = 0.0079)");
for (const s of ANALYTIC_STIMULI) {
  const ours = s.build!();
  let max = 0;
  let sq = 0;
  for (let i = 0; i < n; i++) {
    const c = (raw[(s.id - 1) * n + i] - 128) / 127;
    const d = ours[i] - c;
    max = Math.max(max, Math.abs(d));
    sq += d * d;
  }
  console.log(`${String(s.id).padStart(2)}  ${max.toFixed(4)}    ${Math.sqrt(sq / n).toFixed(5)}   ${s.name}`);
}
