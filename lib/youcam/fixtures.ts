// Loader for the recorded YouCam responses in fixtures/youcam (see the README there).
// Dependency-free so tests, scripts and the replay mock can share it. Node only (reads the disk).
import fs from "node:fs";
import path from "node:path";

export type FixtureQuality = "hd" | "sd";

export interface FixtureOutputItem {
  type: string;
  /** Present for concerns with regions (e.g. "whole", "forehead"). */
  region?: string;
  raw_score?: number;
  ui_score?: number;
  /** Used by the `all` and `skin_age` items instead of raw_score/ui_score. */
  score?: number;
  /** Paths relative to the persona folder (e.g. "masks/hd/hd_pore_whole.png"), not URLs. */
  mask_urls?: string[];
  url: string | null;
}

/** The `data` object of a finished skin-analysis task. */
export interface FixtureAnalysis {
  error: unknown;
  task_status: string;
  results: { output: FixtureOutputItem[] };
}

const SCORE_KEYS = ["raw_score", "ui_score", "score"] as const;

const fixturesRoot = () => path.join(process.cwd(), "fixtures", "youcam");

/** Persona folder names under fixtures/youcam, sorted. */
export function listFixturePersonas(): string[] {
  return fs
    .readdirSync(fixturesRoot(), { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .sort();
}

/** Absolute path of a file inside a persona folder. Throws if it would escape the folder. */
export function fixturePath(persona: string, relPath: string): string {
  const personaDir = path.resolve(fixturesRoot(), persona);
  if (path.dirname(personaDir) !== fixturesRoot()) {
    throw new Error(`Invalid fixture persona: ${persona}`);
  }
  const resolved = path.resolve(personaDir, relPath);
  if (resolved !== personaDir && !resolved.startsWith(personaDir + path.sep)) {
    throw new Error(`Fixture path escapes the persona folder: ${relPath}`);
  }
  return resolved;
}

// The recordings were parsed with json-bigint (storeAsString), which turns long float literals into
// strings, so a score can be a number or a numeric string.
function toScore(value: unknown, where: string): number {
  const n = typeof value === "string" ? Number(value) : value;
  if (typeof n !== "number" || !Number.isFinite(n)) {
    throw new Error(`Fixture score is not numeric (${where}): ${String(value)}`);
  }
  return n;
}

/** Parsed `analysis.<quality>.json` with every score coerced to a number. */
export function loadFixtureAnalysis(persona: string, quality: FixtureQuality): FixtureAnalysis {
  const file = fixturePath(persona, `analysis.${quality}.json`);
  const analysis = JSON.parse(fs.readFileSync(file, "utf8")) as FixtureAnalysis;
  for (const item of analysis.results.output) {
    const scores = item as unknown as Record<string, unknown>;
    for (const key of SCORE_KEYS) {
      if (key in scores) scores[key] = toScore(scores[key], `${persona}/${quality}/${item.type}.${key}`);
    }
  }
  return analysis;
}
