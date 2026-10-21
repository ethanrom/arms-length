import type { NextConfig } from "next";

// Replay routes read recordings with dynamic fs paths (lib/youcam/fixtures.ts, replay.ts), which file tracing cannot
// follow. Tracing therefore pulls in all of fixtures/youcam (about 65 MB) for every route that imports the service.
// Trim each function to what it reads, so the serverless bundles stay small (Vercel allows 250 MB uncompressed):
//   analysis      analysis.<hd|sd>.json, masks/**, input.jpg
//   makeup/simulate  renders/**, input.jpg
//   status/cleanup/visibility  nothing (they never replay a recording)
// public/demo is served by the CDN and by the pages that read bundle.json, not by these functions.
const PERSONAS = "./fixtures/youcam/*";
const NO_FIXTURES = ["./fixtures/**"];

// Pages may only connect to this origin. MediaPipe Tasks Vision 1.1.1 starts a usage logger with every task and posts
// timing stats to odml.pa.googleapis.com, with no option to turn it off. It sends no image, but the privacy promise is
// that nothing leaves the browser except the photo sent to our own server, so the policy blocks it. The MediaPipe wasm
// and model are self-hosted under /mediapipe. No script-src: Next's inline scripts and the wasm need no allowance this way.
const CSP = [
  "connect-src 'self' blob: data:",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "frame-ancestors 'none'",
].join("; ");

const nextConfig: NextConfig = {
  poweredByHeader: false,
  async headers() {
    return [{ source: "/(.*)", headers: [{ key: "Content-Security-Policy", value: CSP }] }];
  },
  cacheComponents: true,
  partialPrefetching: true,
  outputFileTracingExcludes: {
    "/api/youcam/analysis": [`${PERSONAS}/renders/**`, `${PERSONAS}/scale.json`],
    "/api/youcam/makeup": [`${PERSONAS}/masks/**`, `${PERSONAS}/analysis.*.json`, `${PERSONAS}/scale.json`],
    "/api/youcam/simulate": [`${PERSONAS}/masks/**`, `${PERSONAS}/analysis.*.json`, `${PERSONAS}/scale.json`],
    "/api/youcam/status": NO_FIXTURES,
    "/api/youcam/cleanup": NO_FIXTURES,
    "/api/visibility": NO_FIXTURES,
  },
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;
