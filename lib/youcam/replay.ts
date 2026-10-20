// Replay mode: serves the recorded fixture personas with no network and no units.
// Analysis comes from fixtures/youcam/<persona>/analysis.<hd|sd>.json, masks as data URLs. Makeup and
// simulation requests get the closest recorded render for the persona (category, then nearest parameter).
// Only honest renders are served: makeup recorded with skin_smooth at 0 (the default smoothing brightens and blurs the
// whole picture), and a simulation only when it changed every concern asked for. Each render carries the offset measured
// against the persona's input (renders/offsets.json), since the service's offset is not constant.
import fs from "node:fs";
import path from "node:path";
import type { AnalysisResponse, MakeupEffect, RenderResult, SimulationStrengths, Size2 } from "@/lib/contracts";
import { fixturePath, listFixturePersonas, loadFixtureAnalysis } from "./fixtures";
import { sniffImage, toDataUrl } from "./imageinfo";
import { YouCamError } from "./errors";
import { normalizeAnalysis } from "./normalize";
import { buildRender, type RenderKind } from "./render";
import type { Engine } from "./costs";

export const PERSONA_PREFIX = "persona:";

const PERSONA_ID = /^[a-z0-9_-]{1,32}$/i;

export function personaFileRef(id: string): string {
  return `${PERSONA_PREFIX}${id}`;
}

function unknownPersona(id: string): YouCamError {
  return new YouCamError("unknown_persona", `We don't have a demo face called "${id.slice(0, 32)}".`, 404);
}

function assertPersona(id: string): void {
  if (!PERSONA_ID.test(id) || !listFixturePersonas().includes(id)) throw unknownPersona(id);
}

/** Size of the persona's input photo, which is the frame of its recorded masks and renders. */
export function personaFrame(id: string): Size2 {
  assertPersona(id);
  const info = sniffImage(fs.readFileSync(fixturePath(id, "input.jpg")));
  if (!info) throw new YouCamError("fixture_invalid", "That demo face is unavailable.", 500);
  return { width: info.width, height: info.height };
}

async function readImage(persona: string, rel: string) {
  const bytes = new Uint8Array(await fs.promises.readFile(fixturePath(persona, rel)));
  const info = sniffImage(bytes);
  if (!info) throw new YouCamError("fixture_invalid", "That demo face is unavailable.", 500);
  return { dataUrl: toDataUrl(bytes, info.mime), width: info.width, height: info.height };
}

export async function replayAnalysis(persona: string, engine: Engine = "hd"): Promise<AnalysisResponse> {
  assertPersona(persona);
  // SD was recorded for p2b only; any other persona answers with its HD recording.
  const quality: Engine = engine === "sd" && fs.existsSync(fixturePath(persona, "analysis.sd.json")) ? "sd" : "hd";
  const recorded = loadFixtureAnalysis(persona, quality);
  const { analysis, maskSources } = normalizeAnalysis(recorded.results.output, quality, personaFrame(persona));

  const masks: Record<string, string> = {};
  await Promise.all(
    Object.entries(maskSources).map(async ([ref, rel]) => {
      masks[ref] = (await readImage(persona, rel)).dataUrl;
    }),
  );
  return { fileRef: personaFileRef(persona), analysis, masks, unitsCharged: 0, source: "replay" };
}

// ---------- recorded renders ----------

interface Recorded {
  file: string; // persona-relative PNG
  kind: RenderKind;
  /** Makeup: the primary effect's category. Simulation: "simulation". */
  category: string;
  /** Makeup: numeric fields of the primary effect's first palette. Simulation: the strengths. */
  params: Record<string, number>;
}

/** The field each category is driven by (spike.md section 9: foundation coverageIntensity is the lever). */
const LEVER_FIELD: Record<string, string> = { foundation: "coverageIntensity", concealer: "coverageLevel" };

const isRecord = (v: unknown): v is Record<string, unknown> => !!v && typeof v === "object" && !Array.isArray(v);

function numericFields(record: unknown): Record<string, number> {
  const out: Record<string, number> = {};
  if (isRecord(record)) {
    for (const [key, value] of Object.entries(record)) if (typeof value === "number") out[key] = value;
  }
  return out;
}

/** True when the request turns smoothing off. Without it the service smooths and brightens everything (spike.md section 9). */
function smoothingOff(effects: MakeupEffect[]): boolean {
  return effects.some(
    (effect) =>
      effect.category === "skin_smooth" && effect.skinSmoothStrength === 0 && (effect.skinSmoothColorIntensity ?? 0) === 0,
  );
}

/** Skin smoothing is not the product's lever, so it is ignored when picking the primary effect. */
export function primaryEffect(effects: MakeupEffect[]): MakeupEffect | undefined {
  return effects.find((effect) => effect.category !== "skin_smooth");
}

function effectParams(effect: MakeupEffect): Record<string, number> {
  const palettes = effect.palettes;
  return numericFields(Array.isArray(palettes) ? palettes[0] : undefined);
}

const recordedCache = new Map<string, Recorded[]>();

function listRecorded(persona: string): Recorded[] {
  assertPersona(persona);
  const cached = recordedCache.get(persona);
  if (cached) return cached;
  const dir = fixturePath(persona, "renders");
  const out: Recorded[] = [];
  if (fs.existsSync(dir)) {
    for (const name of fs.readdirSync(dir).filter((f) => f.endsWith(".request.json")).sort()) {
      const request: unknown = JSON.parse(fs.readFileSync(path.join(dir, name), "utf8"));
      const file = `renders/${name.replace(/\.request\.json$/, ".png")}`;
      if (!fs.existsSync(fixturePath(persona, file)) || !isRecord(request)) continue;
      if (Array.isArray(request.effects)) {
        const effects = request.effects as MakeupEffect[];
        const primary = primaryEffect(effects);
        if (primary && smoothingOff(effects)) out.push({ file, kind: "makeup", category: primary.category, params: effectParams(primary) });
      } else {
        out.push({ file, kind: "simulation", category: "simulation", params: numericFields(request) });
      }
    }
  }
  recordedCache.set(persona, out);
  return out;
}

/** Distance between a request and a recording: the lever field first, then every shared numeric field. */
function distance(category: string, wanted: Record<string, number>, have: Record<string, number>): number {
  const lever = LEVER_FIELD[category];
  const leverGap = lever && lever in wanted && lever in have ? Math.abs(wanted[lever] - have[lever]) : 0;
  let shared = 0;
  for (const key of Object.keys(have)) if (key in wanted) shared += Math.abs(wanted[key] - have[key]);
  return leverGap * 1000 + shared;
}

function closest(candidates: Recorded[], wanted: Record<string, number>): Recorded | undefined {
  let best: Recorded | undefined;
  let bestDistance = Infinity;
  for (const candidate of candidates) {
    const d = distance(candidate.category, wanted, candidate.params);
    if (d < bestDistance) {
      best = candidate;
      bestDistance = d;
    }
  }
  return best;
}

interface MeasuredOffset {
  dx: number;
  dy: number;
}

const offsetsCache = new Map<string, Record<string, MeasuredOffset>>();

/** renders/offsets.json: the alignment of each recorded render to the persona's input, if it was measured. */
function measuredOffsets(persona: string): Record<string, MeasuredOffset> {
  const cached = offsetsCache.get(persona);
  if (cached) return cached;
  const out: Record<string, MeasuredOffset> = {};
  const file = fixturePath(persona, "renders/offsets.json");
  if (fs.existsSync(file)) {
    const parsed: unknown = JSON.parse(fs.readFileSync(file, "utf8"));
    const renders = isRecord(parsed) && isRecord(parsed.renders) ? parsed.renders : {};
    for (const [name, entry] of Object.entries(renders)) {
      if (isRecord(entry) && Number.isInteger(entry.dx) && Number.isInteger(entry.dy)) {
        out[name] = { dx: entry.dx as number, dy: entry.dy as number };
      }
    }
  }
  offsetsCache.set(persona, out);
  return out;
}

async function toRender(persona: string, recorded: Recorded): Promise<RenderResult> {
  const image = await readImage(persona, recorded.file);
  const render = buildRender(recorded.kind, image, personaFrame(persona), 0, "replay");
  const measured = measuredOffsets(persona)[path.basename(recorded.file)];
  return measured ? { ...render, offset: measured } : render;
}

const noRecording = () =>
  new YouCamError("no_replay_render", "That demo face has no recorded preview for this change. Try another face or change.", 404);

export async function replayMakeup(persona: string, effects: MakeupEffect[]): Promise<RenderResult> {
  const primary = primaryEffect(effects);
  if (!primary) throw new YouCamError("invalid_request", "Choose a makeup effect to preview.", 400);
  const candidates = listRecorded(persona).filter((r) => r.kind === "makeup" && r.category === primary.category);
  const match = closest(candidates, effectParams(primary));
  if (!match) throw noRecording();
  return toRender(persona, match);
}

export async function replaySimulation(persona: string, strengths: SimulationStrengths): Promise<RenderResult> {
  const wanted = numericFields(strengths);
  // A recording must have changed every concern asked for: a request for spots never gets the acne render.
  const candidates = listRecorded(persona).filter(
    (r) => r.kind === "simulation" && Object.entries(wanted).every(([key, value]) => !(value > 0) || (r.params[key] ?? 0) > 0),
  );
  // Missing strengths count as 0 so a recording that changes extra concerns ranks lower.
  let best: Recorded | undefined;
  let bestDistance = Infinity;
  for (const candidate of candidates) {
    const keys = new Set([...Object.keys(wanted), ...Object.keys(candidate.params)]);
    let d = 0;
    for (const key of keys) d += Math.abs((wanted[key] ?? 0) - (candidate.params[key] ?? 0));
    if (d < bestDistance) {
      best = candidate;
      bestDistance = d;
    }
  }
  if (!best) throw noRecording();
  return toRender(persona, best);
}
