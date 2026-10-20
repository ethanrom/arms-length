/**
 * Compute the iris scale for the committed fixture personas and write fixtures/youcam/<persona>/scale.json.
 *
 *   npx tsx scripts/scale/fixtures.ts            # every persona folder that has an input.jpg
 *   npx tsx scripts/scale/fixtures.ts p2b        # just one
 *
 * MediaPipe tasks-vision needs a browser, so a throwaway static server hands a headless Chrome the vendored model
 * and wasm from public/mediapipe (the same files the app serves) and the persona photo. The browser returns raw
 * landmarks only; all maths runs here, in the same pure code the app uses (lib/scale, lib/capture).
 */
import fs from "node:fs";
import http from "node:http";
import path from "node:path";
import type { AddressInfo } from "node:net";
import sharp from "sharp";
import { chromium } from "@playwright/test";
import { estimateIrisScale, irisDiametersPx, type Landmark } from "../../lib/scale";
import { assessQuality, faceBoxFromLandmarks } from "../../lib/capture/quality";
import { lumaStats } from "../../lib/capture/light";
import { planResize } from "../../lib/capture/resize";

const ROOT = process.cwd();
const FIXTURES = path.join(ROOT, "fixtures", "youcam");
const MEDIAPIPE = path.join(ROOT, "public", "mediapipe");
const BUNDLE = path.join(ROOT, "node_modules", "@mediapipe", "tasks-vision", "vision_bundle.mjs");

const PAGE = `<!doctype html><meta charset="utf-8"><script type="module">
import { FaceLandmarker, FilesetResolver } from "/vendor/vision_bundle.mjs";
const fileset = await FilesetResolver.forVisionTasks("/mediapipe/wasm");
const landmarker = await FaceLandmarker.createFromOptions(fileset, {
  baseOptions: { modelAssetPath: "/mediapipe/face_landmarker.task", delegate: "CPU" },
  runningMode: "IMAGE",
  numFaces: 1,
  outputFacialTransformationMatrixes: true,
});
window.detect = async (url) => {
  const img = new Image();
  img.src = url;
  await img.decode();
  const r = landmarker.detect(img);
  const lm = r.faceLandmarks[0];
  return {
    width: img.naturalWidth,
    height: img.naturalHeight,
    landmarks: lm ? lm.map((p) => ({ x: p.x, y: p.y, z: p.z })) : null,
    matrix: r.facialTransformationMatrixes[0] ? Array.from(r.facialTransformationMatrixes[0].data) : null,
  };
};
window.ready = true;
</script>`;

const MIME: Record<string, string> = {
  ".html": "text/html",
  ".mjs": "text/javascript",
  ".js": "text/javascript",
  ".wasm": "application/wasm",
  ".task": "application/octet-stream",
  ".jpg": "image/jpeg",
};

function startServer(personas: string[]): Promise<http.Server> {
  const server = http.createServer((req, res) => {
    const url = new URL(req.url ?? "/", "http://localhost");
    let file: string | null = null;
    if (url.pathname === "/") {
      res.setHeader("content-type", MIME[".html"]);
      res.end(PAGE);
      return;
    }
    if (url.pathname === "/vendor/vision_bundle.mjs") file = BUNDLE;
    else if (url.pathname.startsWith("/mediapipe/")) {
      const rel = path.normalize(url.pathname.slice("/mediapipe/".length));
      if (!rel.startsWith("..")) file = path.join(MEDIAPIPE, rel);
    } else if (url.pathname.startsWith("/persona/")) {
      const name = url.pathname.slice("/persona/".length);
      if (personas.includes(name)) file = path.join(FIXTURES, name, "input.jpg");
    }
    if (!file || !fs.existsSync(file)) {
      res.statusCode = 404;
      res.end("not found");
      return;
    }
    res.setHeader("content-type", MIME[path.extname(file)] ?? "application/octet-stream");
    fs.createReadStream(file).pipe(res);
  });
  return new Promise((resolve) => server.listen(0, "127.0.0.1", () => resolve(server)));
}

interface Detection {
  width: number;
  height: number;
  landmarks: Landmark[] | null;
  matrix: number[] | null;
}

const round = (v: number, digits = 6) => Number(v.toFixed(digits));

async function main() {
  const wanted = process.argv.slice(2);
  const all = fs
    .readdirSync(FIXTURES, { withFileTypes: true })
    .filter((d) => d.isDirectory() && fs.existsSync(path.join(FIXTURES, d.name, "input.jpg")))
    .map((d) => d.name)
    .sort();
  const personas = wanted.length ? wanted : all;
  for (const p of personas) if (!all.includes(p)) throw new Error(`Unknown persona: ${p}`);

  const server = await startServer(personas);
  const origin = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  const browser = await chromium.launch({ channel: "chrome", headless: true });
  try {
    const page = await browser.newPage();
    page.on("pageerror", (e) => console.error("page error:", e.message));
    await page.goto(origin);
    await page.waitForFunction(() => (window as unknown as { ready?: boolean }).ready === true, null, {
      timeout: 60_000,
    });

    for (const persona of personas) {
      const det = (await page.evaluate(
        (u) => (window as unknown as { detect: (u: string) => Promise<Detection> }).detect(u),
        `${origin}/persona/${persona}`,
      )) as Detection;
      if (!det.landmarks || !det.matrix) throw new Error(`${persona}: no face found`);

      const size = { width: det.width, height: det.height };
      const est = estimateIrisScale(det.landmarks, size);
      if (!est || est.irisPx === undefined) throw new Error(`${persona}: no iris`);
      const [eyeA, eyeB] = irisDiametersPx(det.landmarks, size);

      const { data, info } = await sharp(path.join(FIXTURES, persona, "input.jpg"))
        .ensureAlpha()
        .raw()
        .toBuffer({ resolveWithObject: true });
      const box = faceBoxFromLandmarks(det.landmarks, size);
      const luma = lumaStats(data, info.width, info.height, box);
      const quality = assessQuality({ landmarks: det.landmarks, size, matrix: det.matrix, luma });
      const plan = planResize(size.width, size.height, box);

      // Sanity ruler: width of the face mesh (landmarks 234 to 454, cheek edge to cheek edge) in mm.
      const a = det.landmarks[234];
      const b = det.landmarks[454];
      const cheekPx = Math.hypot((a.x - b.x) * size.width, (a.y - b.y) * size.height);
      // Second ruler: interpupillary distance (iris centres 468 and 473); adults average about 63 mm.
      const ipdPx = Math.hypot(
        (det.landmarks[468].x - det.landmarks[473].x) * size.width,
        (det.landmarks[468].y - det.landmarks[473].y) * size.height,
      );
      const out = {
        mmPerPx: round(est.mmPerPx, 6),
        relSd: round(est.relSd, 5),
        source: est.source,
        irisPx: round(est.irisPx, 3),
        frame: size,
        eyesIrisPx: [round(eyeA ?? NaN, 3), round(eyeB ?? NaN, 3)],
        faceWidthPx: round(cheekPx, 1),
        faceWidthMm: round(cheekPx * est.mmPerPx, 1),
        interpupillaryMm: round(ipdPx * est.mmPerPx, 1),
        generatedBy:
          "scripts/scale/fixtures.ts: MediaPipe Face Landmarker float16 v1, @mediapipe/tasks-vision 1.1.1, iris 11.71 mm",
      };
      fs.writeFileSync(path.join(FIXTURES, persona, "scale.json"), JSON.stringify(out, null, 2) + "\n");

      console.log(`\n${persona}  ${size.width}x${size.height}`);
      console.log(`  iris px (eye A, eye B): ${eyeA?.toFixed(2)}, ${eyeB?.toFixed(2)}  mean ${est.irisPx.toFixed(2)}`);
      console.log(`  mmPerPx ${est.mmPerPx.toFixed(5)}  relSd ${(est.relSd * 100).toFixed(2)}%`);
      console.log(`  cheek-to-cheek (234-454) ${cheekPx.toFixed(0)} px = ${out.faceWidthMm} mm; mesh box ${box.w.toFixed(0)}x${box.h.toFixed(0)} px = ${(box.w * est.mmPerPx).toFixed(0)}x${(box.h * est.mmPerPx).toFixed(0)} mm`);
      console.log(`  interpupillary ${out.interpupillaryMm} mm (adult mean about 63)`);
      console.log(`  pose yaw ${quality.yawDeg?.toFixed(1)} pitch ${quality.pitchDeg?.toFixed(1)}  eyeOpenness ${quality.eyeOpenness?.toFixed(3)}  irisFraction ${quality.irisFraction?.toFixed(3)}`);
      console.log(`  luma mean ${luma.mean.toFixed(1)} clipped ${(luma.clippedFraction * 100).toFixed(2)}%`);
      console.log(`  quality ok=${quality.ok} usable=${quality.usable} failing=[${quality.checks.filter((c) => !c.ok).map((c) => c.id)}]`);
      console.log(`  plan crop ${JSON.stringify(plan.crop)} -> ${plan.target.width}x${plan.target.height} ${plan.engine} faceFraction ${plan.faceFraction.toFixed(2)}`);
    }
  } finally {
    await browser.close();
    server.close();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
