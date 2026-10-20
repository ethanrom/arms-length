// Builds a POST /api/visibility body from a recorded fixture persona (no network). Shared by example.ts and the route test.
import fs from "node:fs";
import type { VisibilityRequest } from "../../lib/contracts";
import { fixturePath, loadFixtureAnalysis } from "../../lib/youcam/fixtures";

const dataUrl = (file: string, mime: "image/jpeg" | "image/png") => `data:${mime};base64,${fs.readFileSync(file).toString("base64")}`;

/**
 * `output` is the recorded `data.results.output`; its `mask_urls` are persona-relative paths, so the masks travel inline in
 * `masks`, keyed by that path. Only masks without a region or with region "whole" are sent: the regional ones merely label
 * features and would push the body over the 4 MB limit.
 */
export function fixtureVisibilityRequest(persona: string, quality: "hd" | "sd" = "hd"): VisibilityRequest {
  const analysis = loadFixtureAnalysis(persona, quality);
  const masks: Record<string, string> = {};
  for (const item of analysis.results.output) {
    const rel = item.mask_urls?.[0];
    if (!rel || item.type === "resize_image") continue;
    if (item.region && item.region !== "whole") continue;
    masks[rel] = dataUrl(fixturePath(persona, rel), "image/png");
  }
  return { output: analysis.results.output, image: dataUrl(fixturePath(persona, "input.jpg"), "image/jpeg"), masks };
}
