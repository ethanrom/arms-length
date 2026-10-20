/**
 * Server-side loader for the demo bundles in public/demo/<id>/bundle.json (built by scripts/personas/build-bundles.ts).
 * Synchronous reads, so pages that use it stay in the static shell. Node only.
 */
import fs from "node:fs";
import path from "node:path";
import type { ResultsData } from "@/components/results/types";
import { BUNDLE_VERSION, type ReadingBundle } from "./types";
import { buildResultsData } from "./viewModel";

/** Order on the chooser. */
export const DEMO_IDS = ["p2b", "p3a", "p1a", "p5a"] as const;

const cache = new Map<string, ReadingBundle>();

export function loadBundle(id: string): ReadingBundle | null {
  if (!(DEMO_IDS as readonly string[]).includes(id)) return null;
  const cached = cache.get(id);
  if (cached) return cached;
  const file = path.join(process.cwd(), "public", "demo", id, "bundle.json");
  if (!fs.existsSync(file)) return null;
  const bundle = JSON.parse(fs.readFileSync(file, "utf8")) as ReadingBundle;
  if (bundle.version !== BUNDLE_VERSION) throw new Error(`public/demo/${id}/bundle.json is version ${bundle.version}; rebuild it with scripts/personas/build-bundles.ts`);
  cache.set(id, bundle);
  return bundle;
}

export function loadDemoResults(id: string): ResultsData | null {
  const bundle = loadBundle(id);
  return bundle ? buildResultsData(bundle) : null;
}
