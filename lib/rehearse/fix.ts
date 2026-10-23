/**
 * find_free_fix: the smallest free change that puts the listed concerns out of sight for a typical viewer.
 *
 * Goal: typicalShare <= 10% for every listed concern (the same 10% the lightest-touch search aims at; RELIEF_SHARE in
 * lib/copy/describe.ts). For a large soft area the share is 0 or 1, so the goal means out of sight.
 *
 * Levers, in this order; each is monotone (more of it never shows more), so the smallest change is found by bisection over a
 * grid of whole steps with `measureScene` (the same count observe_scene uses) as the oracle:
 *   video call   camera_distance (5 cm steps, up to the device's stated maximum), then call_layout (gallery tile)
 *   in person    distance (5 cm steps under 1 m, 10 cm to 3 m, then 1 m; up to the scene's range maximum), then light (one step
 *                softer from the light table, never brighter)
 * A later lever is tried on its own first; if that is not enough it is combined with the earlier lever, again by the smallest
 * amount. The result names the last lever involved.
 */
import { CONCERNS } from "../contracts/concerns";
import type { ConcernId } from "../contracts/concerns";
import type { CallGeometry, FreeFixInput, FreeFixResult, FreeLever, LightId, ObserveResult, RehearseFace, SceneInput } from "../contracts/rehearse";
import { formatDistance } from "../copy/distance";
import { DEVICES, type Device } from "./call";
import { SceneError, hasOwn } from "./errors";
import { measureScene, observeResolved } from "./observe";
import { cmText } from "./quotes";
import { LIGHTS, lightLuminance, resolveScene, type ResolvedScene } from "./scenes";

/** typicalShare at or under this counts as out of sight. */
export const FREE_FIX_GOAL = 0.1;
const EPS = 1e-9;

/** Real lights a person can step to in person, dimmest first (the video-call light is a screen, not a room). */
const LADDER: LightId[] = (["home", "indoor", "overcast", "daylight"] as LightId[]).sort((a, b) => lightLuminance(a) - lightLuminance(b));

/** One step softer than `light` (dimmer), or null at the bottom. Never brighter. */
export function softerLight(light: LightId): LightId | null {
  const lum = lightLuminance(light);
  const softer = LADDER.filter((l) => lightLuminance(l) < lum - EPS);
  return softer.length ? softer[softer.length - 1] : null;
}

/** First index whose value passes, by bisection on a monotone predicate; null if even the last fails. */
function smallest<T>(candidates: readonly T[], passes: (c: T) => boolean): T | null {
  if (!candidates.length || !passes(candidates[candidates.length - 1])) return null;
  let lo = 0;
  let hi = candidates.length - 1;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (passes(candidates[mid])) hi = mid;
    else lo = mid + 1;
  }
  return candidates[lo];
}

/** Camera distances above `current`, whole 5 cm steps, ending at `max` (nothing if already at or past it). */
function cameraGrid(current: number, max: number): number[] {
  const out: number[] = [];
  for (let cm = (Math.floor(current / 5 + EPS) + 1) * 5; cm < max - EPS; cm += 5) out.push(cm);
  if (current < max - EPS) out.push(max);
  return out;
}

const round3 = (x: number) => Math.round(x * 1000) / 1000;

/** In-person distances above `current`, in the steps formatDistance can say, ending at `max`. */
function distanceGrid(current: number, max: number): number[] {
  const out: number[] = [];
  let x = current;
  for (;;) {
    const step = x < 1 - EPS ? 0.05 : x < 3 - EPS ? 0.1 : 1;
    x = round3((Math.floor(x / step + EPS) + 1) * step);
    if (x >= max - EPS) break;
    out.push(x);
  }
  if (current < max - EPS) out.push(max);
  return out;
}

type Part =
  | { kind: "distance"; deltaM: number }
  | { kind: "light"; light: LightId }
  | { kind: "camera"; device: Device; deltaCm: number }
  | { kind: "gallery" };

function partText(p: Part): string {
  switch (p.kind) {
    case "distance":
      return `sit or stand about ${formatDistance(p.deltaM)} further away`;
    case "light":
      return `choose softer light (${LIGHTS[p.light].label})`;
    case "camera":
      return p.device === "laptop"
        ? `move the laptop about ${cmText(p.deltaCm)} further back`
        : p.device === "phone"
          ? `hold the phone about ${cmText(p.deltaCm)} further away`
          : `sit about ${cmText(p.deltaCm)} further back from the camera`;
    case "gallery":
      return "use gallery view";
  }
}

interface Proposal {
  lever: FreeLever;
  to: SceneInput;
  parts: Part[];
}

export function findFreeFix(face: RehearseFace, input: FreeFixInput, ref: string): FreeFixResult {
  const from = input.moment;
  const base = resolveScene(from);
  const concerns = [...new Set(input.concerns ?? [])];
  for (const c of concerns) {
    if (!hasOwn(CONCERNS, c)) throw new SceneError(`Unknown concern "${String(c)}". Valid concerns: ${Object.keys(CONCERNS).join(", ")}.`);
  }

  const meetsResolved = (r: ResolvedScene) => {
    const seen = measureScene(face, r);
    return concerns.every((c: ConcernId) => {
      const x = seen.find((s) => s.concern === c);
      return !x || x.typicalShare <= FREE_FIX_GOAL + EPS;
    });
  };
  const meets = (si: SceneInput) => meetsResolved(resolveScene(si));

  const finish = (proposal: Proposal | null, tried: string[]): FreeFixResult => {
    const afterInput = proposal ? proposal.to : from;
    const after: ObserveResult = observeResolved(face, resolveScene(afterInput), `${ref}.after`);
    const goalLine = concerns.length
      ? `Goal: a typical viewer picks out at most 1 in 10 of each of these (the same 10% the lightest-touch search aims at), and none of a large soft area.`
      : "Goal: nothing was listed, so there is nothing to put out of sight.";
    const assumptions = [goalLine, ...tried, "A free change is one that costs nothing but where you sit, stand or how you set up the call."];
    if (!proposal) {
      const already = meetsResolved(base);
      return {
        ref,
        quotes: { change: already ? "nothing needs to change here" : "no free change is enough to reach that here" },
        assumptions,
        reachable: already,
        lever: null,
        from,
        to: null,
        after,
      };
    }
    const lightPart = proposal.parts.some((p) => p.kind === "light") ? `, in ${LIGHTS[after.input.light].label}` : "";
    const to = base.scene.id === "video_call" ? `as if you were about ${formatDistance(after.distanceM)} away` : `about ${formatDistance(after.distanceM)} apart${lightPart}`;
    return {
      ref,
      quotes: { change: proposal.parts.map(partText).join(" and "), to },
      assumptions,
      reachable: true,
      lever: proposal.lever,
      from,
      to: proposal.to,
      after,
    };
  };

  if (meetsResolved(base)) return finish(null, []);

  if (base.scene.id === "video_call") {
    const call = base.call!.call;
    const profile = DEVICES[call.device];
    const withCall = (cm: number, layout: CallGeometry["layout"]): SceneInput => ({ ...from, call: { ...call, cameraDistanceCm: cm, layout } });
    const cams = cameraGrid(call.cameraDistanceCm, profile.maxCm);
    const camPart = (cm: number): Part => ({ kind: "camera", device: call.device, deltaCm: cm - call.cameraDistanceCm });
    const tried = [
      `Levers tried, in order: sit farther from the camera (up to ${cmText(profile.maxCm)} for a ${profile.label}), then use gallery view, where you appear in a small tile on the other person's screen.`,
      `Distance to the camera: ${profile.distanceSource}`,
    ];

    const cm = smallest(cams, (c) => meets(withCall(c, call.layout)));
    if (cm !== null) return finish({ lever: "camera_distance", to: withCall(cm, call.layout), parts: [camPart(cm)] }, tried);

    if (call.layout === "speaker") {
      if (meets(withCall(call.cameraDistanceCm, "gallery"))) {
        return finish({ lever: "call_layout", to: withCall(call.cameraDistanceCm, "gallery"), parts: [{ kind: "gallery" }] }, tried);
      }
      const gcm = smallest(cams, (c) => meets(withCall(c, "gallery")));
      if (gcm !== null) {
        return finish({ lever: "call_layout", to: withCall(gcm, "gallery"), parts: [{ kind: "gallery" }, camPart(gcm)] }, tried);
      }
    }
    return finish(null, tried);
  }

  const [, max] = base.scene.rangeM as [number, number];
  const grid = distanceGrid(base.distanceM, max);
  const withDistance = (d: number, light?: LightId): SceneInput => ({ ...from, distanceM: d, ...(light ? { light } : {}) });
  const softer = softerLight(base.light);
  const tried = [
    `Levers tried, in order: sit or stand farther apart (up to ${formatDistance(max)}, the far end of the range for this kind of moment), then softer light (one step: ${softer ? LIGHTS[softer].label : "none is softer than this"}).`,
    `Range for this moment: ${base.scene.source}`,
  ];

  const d = smallest(grid, (x) => meets(withDistance(x)));
  if (d !== null) return finish({ lever: "distance", to: withDistance(d), parts: [{ kind: "distance", deltaM: d - base.distanceM }] }, tried);

  if (softer) {
    if (meets({ ...from, light: softer })) {
      return finish({ lever: "light", to: { ...from, light: softer }, parts: [{ kind: "light", light: softer }] }, tried);
    }
    const sd = smallest(grid, (x) => meets(withDistance(x, softer)));
    if (sd !== null) {
      return finish({ lever: "light", to: withDistance(sd, softer), parts: [{ kind: "light", light: softer }, { kind: "distance", deltaM: sd - base.distanceM }] }, tried);
    }
  }
  return finish(null, tried);
}

