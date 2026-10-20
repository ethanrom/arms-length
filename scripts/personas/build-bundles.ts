/**
 * Builds the demo bundles the app opens with: for each persona, the real pipeline run offline on the recorded YouCam
 * fixtures (no network, no units), written to public/demo/<id>/.
 *
 *   npx tsx scripts/personas/build-bundles.ts [p2b p3a ...]
 *
 * Per persona it measures (surround basis), builds the visibility report with the default viewing conditions, runs
 * "Worth it?" on the two half-strength simulation groups, searches the least foundation coverage for dark spots, pores
 * and breakouts at 1.5 m on the recorded renders (registered to the photo, as the live path does), and writes:
 *
 *   bundle.json            the ReadingBundle (lib/integration/types.ts): report, sentences, receipts, plans
 *   photo.jpg              the analysed photo, byte for byte
 *   masks/<concern>.png    transparent overlays of the "whole" masks
 *   sim-a.jpg, sim-b.jpg   the half-strength simulations, aligned to the photo (display only, JPEG)
 *   coverage-<concern>.jpg the kept coverage render, aligned to the photo (display only, JPEG)
 *
 * Display images are for looking at; every number was measured on the original PNGs.
 */
import fs from "node:fs";
import path from "node:path";
import sharp from "sharp";
import { DEFAULT_VIEWING, type RgbaImage, type ScaleEstimate } from "../../lib/contracts";
import { replayMakeupRender } from "../../lib/coverage/replayRender";
import { computeCoverage, computeReading, computeWorthIt, slimPlan, wholeMask, type ReadingInputs } from "../../lib/integration/compute";
import { backdropGrey, maskOverlay } from "../../lib/integration/images";
import { receiptSnapshots } from "../../lib/integration/receiptSnapshots";
import { buildSentences } from "../../lib/integration/sentences";
import { BUNDLE_VERSION, COVERAGE_CONCERNS, type CoverageEntry, type ReadingBundle, type WorthItEntry } from "../../lib/integration/types";
import { alignCounterfactual } from "../../lib/skin/counterfactual";
import { decodeImage, loadPersona } from "../../lib/skin/fixtures-io";
import { fixturePath } from "../../lib/youcam/fixtures";

interface PersonaSpec {
  id: string;
  label: string;
  description: string;
  alt: string;
}

// Always "synthetic face" in the label or the description; nobody real is shown.
const PERSONAS: PersonaSpec[] = [
  {
    id: "p2b",
    label: "Synthetic face A",
    description: "Deep brown skin, about 42. Scattered dark spots on the cheeks, soft shadows under the eyes.",
    alt: "Synthetic portrait of a man in his forties with deep brown skin, looking straight at the camera.",
  },
  {
    id: "p3a",
    label: "Synthetic face B",
    description: "Fair skin, about 55. Freckled dark spots, rosy cheeks, fine lines around the eyes.",
    alt: "Synthetic portrait of a woman in her fifties with fair, freckled skin, looking straight at the camera.",
  },
  {
    id: "p1a",
    label: "Synthetic face C",
    description: "Light olive skin, about 30. A few breakouts on the cheeks and chin, a shiny forehead.",
    alt: "Synthetic portrait of a woman in her thirties with light olive skin and a few breakouts, looking straight at the camera.",
  },
  {
    id: "p5a",
    label: "Synthetic face D",
    description: "Light skin, about 40. Very subtle freckling: the fine-skin example.",
    alt: "Synthetic portrait of a woman in her forties with light skin and very faint freckles, looking straight at the camera.",
  },
];

const OUT_ROOT = path.join(process.cwd(), "public", "demo");
const JPEG_QUALITY = 90;

const jpeg = (image: RgbaImage) =>
  sharp(Buffer.from(image.data.buffer, image.data.byteOffset, image.data.byteLength), {
    raw: { width: image.width, height: image.height, channels: 4 },
  })
    .removeAlpha()
    .jpeg({ quality: JPEG_QUALITY, mozjpeg: true })
    .toBuffer();

const png = (image: RgbaImage) =>
  sharp(Buffer.from(image.data.buffer, image.data.byteOffset, image.data.byteLength), {
    raw: { width: image.width, height: image.height, channels: 4 },
  })
    .png({ palette: true, compressionLevel: 9 })
    .toBuffer();

/** Numbers to 5 decimals: the bundle is for the page, not for archiving float noise. */
const round = (_key: string, value: unknown) => (typeof value === "number" && Number.isFinite(value) ? Math.round(value * 1e5) / 1e5 : value);

async function build(spec: PersonaSpec): Promise<void> {
  const started = Date.now();
  const { id } = spec;
  const url = (file: string) => `/demo/${id}/${file}`;
  const dir = path.join(OUT_ROOT, id);
  fs.rmSync(dir, { recursive: true, force: true });
  fs.mkdirSync(path.join(dir, "masks"), { recursive: true });

  const { analysis, masks, photo } = await loadPersona(id, "hd");
  const recorded = JSON.parse(fs.readFileSync(fixturePath(id, "scale.json"), "utf8"));
  const scale: ScaleEstimate = { mmPerPx: recorded.mmPerPx, relSd: recorded.relSd, source: "iris", irisPx: recorded.irisPx };
  const inputs: ReadingInputs = { analysis, masks, photo, scale, viewing: DEFAULT_VIEWING };

  fs.copyFileSync(fixturePath(id, "input.jpg"), path.join(dir, "photo.jpg"));

  const reading = computeReading(inputs);

  // Overlays of the "whole" masks, for the "What YouCam detected" strip.
  const overlays: ReadingBundle["overlays"] = {};
  const maskPaths: Record<string, string> = {};
  for (const r of analysis.results) {
    if (r.region !== "whole" || !r.maskRef) continue;
    const mask = wholeMask(analysis, masks, r.concern);
    if (!mask) continue;
    fs.writeFileSync(path.join(dir, "masks", `${r.concern}.png`), await png(maskOverlay(mask, r.concern)));
    overlays[r.concern] = url(`masks/${r.concern}.png`);
    maskPaths[r.maskRef] = url(`masks/${r.concern}.png`);
  }

  // "Worth it?": the two half-strength simulation groups.
  const worth: WorthItEntry[] = [];
  for (const group of ["a", "b"] as const) {
    const sim = await decodeImage(fixturePath(id, `renders/sim_improve_${group}05.png`));
    fs.writeFileSync(path.join(dir, `sim-${group}.jpg`), await jpeg(alignCounterfactual(photo, sim)));
    worth.push(...computeWorthIt(inputs, reading, group, sim, url(`sim-${group}.jpg`), "replay"));
  }

  // Least coverage at 1.5 m for the concerns with a makeup lever, on the recorded foundation grid.
  // (p5a has no recorded makeup renders, so it has no coverage section.)
  const coverageEntries: CoverageEntry[] = [];
  const hasGrid = fs.existsSync(fixturePath(id, "renders/foundation_cov50.png"));
  for (const concern of COVERAGE_CONCERNS) {
    if (!hasGrid || !reading.report.concerns.some((c) => c.concern === concern)) continue;
    const run = await computeCoverage(inputs, reading, concern, replayMakeupRender(id));
    let afterImage: string | null = null;
    if (run.image) {
      const file = `coverage-${concern}.jpg`;
      fs.writeFileSync(path.join(dir, file), await jpeg(run.image));
      afterImage = url(file);
    }
    coverageEntries.push({ plan: slimPlan(run.entry.plan, afterImage), afterImage });
  }

  const bundle: ReadingBundle = {
    version: BUNDLE_VERSION,
    source: "demo",
    id,
    label: spec.label,
    description: spec.description,
    image: url("photo.jpg"),
    alt: spec.alt,
    stageGrey: backdropGrey(photo),
    frame: analysis.frame,
    analysis: { ...analysis, results: analysis.results.map((r) => ({ ...r, maskRef: r.region === "whole" ? r.maskRef : null })) },
    masks: maskPaths,
    scale,
    viewing: DEFAULT_VIEWING,
    measurements: reading.measurements,
    report: reading.report,
    sentences: buildSentences(reading.report, worth),
    outlines: reading.outlines,
    receipts: receiptSnapshots(reading.measurements, reading.report),
    worthIt: worth,
    coverageEntries,
    coverage: coverageEntries.map((e) => e.plan),
    whatIfs: worth.map((w) => w.whatIf),
    overlays,
  };
  // The report's per-target list is large and the page never reads it; the concern summaries carry what it shows.
  // Skip reasons come from lib/skin in its own words ("age spots"); the page does not show them, and the repo's copy rules read this file.
  const skipped = bundle.measurements.skipped.map((entry) => ({ ...entry, reason: entry.reason.replace(/age spots/g, "dark spots") }));
  const slim = { ...bundle, measurements: { ...bundle.measurements, skipped }, report: { ...bundle.report, targets: [] } };
  fs.writeFileSync(path.join(dir, "bundle.json"), JSON.stringify(slim, round));

  const bytes = (rel: string) => fs.statSync(path.join(dir, rel)).size;
  const total = fs
    .readdirSync(dir, { recursive: true, withFileTypes: true })
    .filter((e) => e.isFile())
    .reduce((n, e) => n + fs.statSync(path.join(e.parentPath, e.name)).size, 0);
  console.log(
    `${id}: ${((Date.now() - started) / 1000).toFixed(1)} s  bundle.json ${(bytes("bundle.json") / 1024).toFixed(0)} KB  total ${(total / 1024 / 1024).toFixed(2)} MB  ` +
      `concerns ${reading.report.concerns.map((c) => c.concern).join(",")}  coverage ${coverageEntries.map((e) => `${e.plan.concern}:${e.plan.status}${e.plan.chosen ? `@${e.plan.chosen.lever.value}` : ""}`).join(" ")}`,
  );
}

async function main() {
  const wanted = process.argv.slice(2);
  const list = wanted.length ? PERSONAS.filter((p) => wanted.includes(p.id)) : PERSONAS;
  for (const spec of list) await build(spec);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
