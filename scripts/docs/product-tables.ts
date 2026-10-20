/**
 * The two generated tables of docs/EVAL.md that need the recorded images, so they are slower (about a minute) than the
 * tables of eval-tables.ts and are not part of the drift test (lib/vision/params.doc.test.ts):
 *
 *   worthit        "Worth it?": how far the change a half-strength Skin Simulation would make stays detectable
 *                  (lib/vision/worthIt.ts), per face and concern, from the recorded sim_improve_a05 / sim_improve_b05 renders
 *   least-makeup   the least-coverage search (lib/coverage/plan.ts) on the recorded foundation grid, at 1.5 m
 *
 *   npx tsx scripts/docs/product-tables.ts            print the markdown
 *   npx tsx scripts/docs/product-tables.ts --write    rewrite the blocks in docs/EVAL.md
 *   npx tsx scripts/docs/product-tables.ts --check    exit 1 when docs/EVAL.md differs from a fresh generation
 *
 * Run from the repository root (the fixtures are read relative to it). No network, no YouCam units.
 */
import fs from "node:fs";
import path from "node:path";
import type { ConcernId, ScaleEstimate } from "../../lib/contracts";
import { DEFAULT_VIEWING, MAX_DISTANCE_M } from "../../lib/contracts/vision";
import { concernNoun } from "../../lib/copy/concerns";
import { planCoverage } from "../../lib/coverage/plan";
import { replayMakeupRender } from "../../lib/coverage/replayRender";
import { decodeImage, loadPersona } from "../../lib/skin/fixtures-io";
import { measureAnalysis } from "../../lib/skin/measure";
import { fixturePath } from "../../lib/youcam/fixtures";
import { worthIt, type WorthIt } from "../../lib/vision/worthIt";
import { extractBlock, isMain, ROOT, syncFile, table } from "./blocks";

const PERSONAS = ["p1a", "p2b", "p3a", "p5a"] as const;

/** The recorded half-strength groups (scripts/personas/common.ts) and the concerns each one changes. */
const GROUPS: { stem: string; concerns: ConcernId[] }[] = [
  { stem: "sim_improve_b05", concerns: ["pore", "age_spot", "acne"] },
  { stem: "sim_improve_a05", concerns: ["wrinkle", "dark_circle", "eye_bag", "redness"] },
];

const WORTH_AT_M = [1, 1.5, 2.5, 4] as const;

const capitalise = (s: string): string => s.charAt(0).toUpperCase() + s.slice(1);

function scaleOf(persona: string): ScaleEstimate {
  const s = JSON.parse(fs.readFileSync(fixturePath(persona, "scale.json"), "utf8"));
  return { mmPerPx: s.mmPerPx, relSd: s.relSd, source: "iris", irisPx: s.irisPx };
}

/** Distances for reading: two decimals under 1 m, one above, "10+" at the contract cap. */
function metres(x: number): string {
  if (x >= MAX_DISTANCE_M) return `${MAX_DISTANCE_M}+`;
  return x < 1 ? x.toFixed(2) : x.toFixed(1);
}

const pct = (part: number, whole: number): string => `${Math.round((100 * part) / whole)}%`;

export async function worthItTable(): Promise<string> {
  const rows: string[][] = [];
  for (const persona of PERSONAS) {
    const { analysis, masks, photo } = await loadPersona(persona, "hd");
    const base = measureAnalysis(analysis, masks, photo, scaleOf(persona));
    const found = new Map<ConcernId, WorthIt>();
    for (const group of GROUPS) {
      const sim = await decodeImage(path.join("fixtures/youcam", persona, "renders", `${group.stem}.png`));
      for (const w of worthIt(base, { analysis, masks }, photo, sim, group.concerns)) found.set(w.concern, w);
    }
    for (const concern of GROUPS.flatMap((g) => g.concerns)) {
      const w = found.get(concern)!;
      if (w.targetCount === 0) continue; // nothing found: the table has no row for it (see the note under the table)
      const at = WORTH_AT_M.map((d) => w.differenceProfile.find((p) => p.distanceM === d)!.count);
      rows.push([
        persona,
        capitalise(concernNoun(concern)),
        String(w.targetCount),
        metres(w.differenceMaxDistanceM),
        ...at.map((n) => `${n} (${pct(n, w.targetCount)})`),
      ]);
    }
  }
  return table(
    ["Face", "Concern", "Found", "Farthest change (m)", "At most, at 1 m", "at 1.5 m", "at 2.5 m", "at 4 m"],
    rows,
  );
}

export async function leastMakeupTable(): Promise<string> {
  const rows: string[][] = [];
  for (const persona of ["p1a", "p2b", "p3a"] as const) {
    const scale = scaleOf(persona);
    const { analysis, masks, photo } = await loadPersona(persona, "hd");
    const base = measureAnalysis(analysis, masks, photo, scale);
    const render = replayMakeupRender(persona);
    for (const concern of ["age_spot", "pore", "acne"] as const) {
      const plan = await planCoverage({ concern, base, scale, viewing: DEFAULT_VIEWING, photo, render, geometry: { analysis, masks } });
      const total = base.features.filter((f) => f.concern === concern).length;
      const share = (x: number | undefined): string => (x === undefined ? "not rendered" : `${Math.round(100 * x)}%`);
      const at = (coverage: number) => plan.steps.find((s) => s.lever.value === coverage)?.fractionAtTarget;
      const chosen = plan.chosen ? `${plan.chosen.lever.value}` : "none";
      rows.push([
        persona,
        capitalise(concernNoun(concern)),
        String(total),
        share(plan.baselineFraction),
        share(at(50)),
        share(at(75)),
        share(at(100)),
        plan.status === "met" ? `${chosen} (reaches 10% or less)` : `${chosen} (knee)`,
      ]);
    }
  }
  return table(
    ["Face", "Concern", "Found", "No makeup", "Coverage 50", "75", "100", "Least coverage"],
    rows,
  );
}

/** Every slow generated block of docs/EVAL.md by name. */
export async function allProductBlocks(): Promise<Record<string, string>> {
  return { worthit: await worthItTable(), "least-makeup": await leastMakeupTable() };
}

async function main() {
  const blocks = await allProductBlocks();
  const file = `${ROOT}docs/EVAL.md`;
  if (process.argv.includes("--write")) {
    const changed = syncFile(file, blocks);
    console.log(changed.length ? `docs/EVAL.md: updated ${changed.join(", ")}` : "docs/EVAL.md: already up to date");
  } else if (process.argv.includes("--check")) {
    const doc = fs.readFileSync(file, "utf8");
    const stale = Object.entries(blocks).filter(([name, body]) => extractBlock(doc, name) !== body.trim()).map(([name]) => name);
    if (stale.length) {
      console.error(`docs/EVAL.md is stale: ${stale.join(", ")}. Run: npx tsx scripts/docs/product-tables.ts --write`);
      process.exit(1);
    }
    console.log("docs/EVAL.md: the worth-it and least-makeup tables are current");
  } else {
    console.log(Object.values(blocks).join("\n\n"));
  }
}

if (isMain(import.meta.url)) void main();
