// Raw Skin Analysis `results.output[]` -> the SkinAnalysis contract. Pure: no I/O, no network.
import { concernFromAction } from "@/lib/contracts";
import type { ConcernResult, Size2, SkinAnalysis } from "@/lib/contracts";
import type { Engine } from "./costs";

export interface NormalizedAnalysis {
  analysis: SkinAnalysis;
  /** ConcernResult.maskRef -> where the mask lives (presigned URL in live mode, persona-relative path in replay). */
  maskSources: Record<string, string>;
}

type Obj = Record<string, unknown>;
const obj = (value: unknown): Obj => (value && typeof value === "object" ? (value as Obj) : {});

/** Scores may arrive as numbers or as numeric strings (json-bigint storeAsString). */
function toNumber(value: unknown): number {
  if (typeof value === "number") return value;
  if (typeof value === "string" && value.trim() !== "") return Number(value);
  return Number.NaN;
}

function firstMask(item: Obj): string | null {
  const urls = item.mask_urls;
  return Array.isArray(urls) && typeof urls[0] === "string" ? urls[0] : null;
}

/** Where the analysed image (`resize_image`) lives; its size is the frame every mask is aligned to. */
export function resizeImageSource(output: unknown[]): string | null {
  for (const raw of output) {
    const item = obj(raw);
    if (item.type === "resize_image") return firstMask(item);
  }
  return null;
}

/**
 * - Each action maps to a ConcernId (`hd_pore` and `pore` -> "pore"); unknown types are ignored.
 * - `region` defaults to "whole". The mask key is `type[_region]`, e.g. `hd_pore_forehead`, `hd_age_spot`.
 * - `all` and `skin_age` become `overall` and `skinAge`; `resize_image` is only used for the frame size.
 */
export function normalizeAnalysis(output: unknown[], engine: Engine, frame: Size2): NormalizedAnalysis {
  const results: ConcernResult[] = [];
  const maskSources: Record<string, string> = {};
  let skinAge: number | null = null;
  let overall: number | null = null;

  for (const raw of output) {
    const item = obj(raw);
    const type = typeof item.type === "string" ? item.type : "";

    if (type === "all" || type === "skin_age") {
      const score = toNumber(item.score);
      if (Number.isFinite(score)) {
        if (type === "all") overall = score;
        else skinAge = score;
      }
      continue;
    }

    const concern = concernFromAction(type);
    if (!concern) continue;

    const ui = toNumber(item.ui_score);
    const rawScore = toNumber(item.raw_score);
    if (!Number.isFinite(ui) && !Number.isFinite(rawScore)) continue;

    const region = typeof item.region === "string" && item.region ? item.region : "whole";
    const source = firstMask(item);
    let maskRef: string | null = null;
    if (source) {
      const base = typeof item.region === "string" && item.region ? `${type}_${item.region}` : type;
      maskRef = base;
      for (let n = 2; Object.hasOwn(maskSources, maskRef); n++) maskRef = `${base}_${n}`;
      maskSources[maskRef] = source;
    }

    results.push({
      concern,
      region,
      rawScore: Number.isFinite(rawScore) ? rawScore : ui,
      uiScore: Number.isFinite(ui) ? ui : rawScore,
      maskRef,
    });
  }

  return { analysis: { engine, frame, results, skinAge, overall }, maskSources };
}
