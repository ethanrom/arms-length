/**
 * observe_scene: what a viewer picks out of this face in one moment. Runs lib/vision's report on the face's own
 * measurements at the moment's light and viewer, then counts targets at the moment's distance.
 *
 * The report depends on light and viewer, not on distance, so it is memoised per face (the Measurements object) and viewing;
 * every further moment on the same face costs a count over the targets.
 *
 * Shares are exact counts over the concern's targets (lib/vision `report.targets`):
 *   typical  nominalM  >= distance   a typical sharp-eyed viewer looking right at it (average observer, no margin)
 *   bound    distanceM >= distance   even perfect eyes (6 dB margin): the one-sided bound; "at most"
 * Large soft areas (isSoftArea, lib/copy/describe.ts) are one area: their share is 0 or 1 (any zone visible).
 * Video calls: a target smaller than the received video's resolution floor counts as not visible, and is reported in
 * `belowCameraCount`.
 */
import type { ConcernId } from "../contracts/concerns";
import { CONCERNS } from "../contracts/concerns";
import type { Feature, Measurements, RegionMeasure } from "../contracts/measure";
import type { CallGeometry, ConcernAtScene, ObserveResult, RehearseFace, SceneInput } from "../contracts/rehearse";
import type { TargetVisibility, ViewingConditions } from "../contracts/vision";
import { isSoftArea } from "../copy/describe";
import { formatDistance } from "../copy/distance";
import { BOUND_TO_NOMINAL_RATIO } from "../copy/profile";
import { buildVisibilityReport, type VisibilityReportExt } from "../vision/report";
import { specFromTarget } from "../vision/visibility";
import { LIGHTS, VIEWER_LABEL, lightLuminance, resolveScene, viewingFor, type ResolvedScene } from "./scenes";
import { boundCountText, boundPhrase, boundSoft, countText, mmText, typicalPhrase, typicalSoft } from "./quotes";

const CONCERN_ORDER = Object.keys(CONCERNS) as ConcernId[];

// ---------------------------------------------------------------------------------------------------------------
// Memo: one report per face and viewing; one index per face.
// ---------------------------------------------------------------------------------------------------------------

interface PreparedReport {
  report: VisibilityReportExt;
  byConcern: Map<ConcernId, TargetVisibility[]>;
}

const reports = new WeakMap<Measurements, Map<string, PreparedReport>>();

/** The report for a face at a viewing (luminance and acuity; the margin is the default 6 dB), built once. */
export function preparedReport(measurements: Measurements, viewing: ViewingConditions): PreparedReport {
  let byViewing = reports.get(measurements);
  if (!byViewing) reports.set(measurements, (byViewing = new Map()));
  const key = `${viewing.luminanceCdM2}|${viewing.acuityScale}|${viewing.marginDb ?? 6}`;
  let found = byViewing.get(key);
  if (!found) {
    const report = buildVisibilityReport(measurements, viewing);
    const byConcern = new Map<ConcernId, TargetVisibility[]>();
    for (const t of report.targets) {
      const list = byConcern.get(t.concern);
      if (list) list.push(t);
      else byConcern.set(t.concern, [t]);
    }
    byViewing.set(key, (found = { report, byConcern }));
  }
  return found;
}

interface FaceIndex {
  byId: Map<string, Feature | RegionMeasure>;
  /** The size a viewer would measure, mm: a spot's diameter, a line's width, an area's equal-area diameter. */
  sizeMm: Map<string, number>;
  /** Concerns that read as one large soft area on this face (judged at the site's own default light and a typical viewer). */
  soft?: Set<ConcernId>;
}

const indexes = new WeakMap<Measurements, FaceIndex>();

export function faceIndex(m: Measurements): FaceIndex {
  let index = indexes.get(m);
  if (index) return index;
  const byId = new Map<string, Feature | RegionMeasure>();
  const sizeMm = new Map<string, number>();
  for (const t of [...m.features, ...m.regions]) {
    byId.set(t.id, t);
    const spec = specFromTarget(t, m.scale);
    if (!spec) continue;
    const isFeature = "shape" in t;
    sizeMm.set(t.id, isFeature ? (t.shape === "line" ? (t.widthMm ?? spec.sizeMm) : (t.diameterMm ?? spec.sizeMm)) : spec.sizeMm);
  }
  index = { byId, sizeMm };
  indexes.set(m, index);
  return index;
}

/**
 * Soft areas are a property of the face, not of the moment, so they are read once at the site's default light (indoor, a
 * typical viewer), as the results page does. Under-eye shadows and puffiness are always soft; redness only when it spans a
 * broad area (isSoftArea). Only redness needs the report.
 */
export function softConcerns(face: RehearseFace): Set<ConcernId> {
  const index = faceIndex(face.measurements);
  if (index.soft) return index.soft;
  const soft = new Set<ConcernId>(["dark_circle", "eye_bag"]);
  if (face.measurements.regions.some((r) => r.concern === "redness") || face.measurements.features.some((f) => f.concern === "redness")) {
    const reference = preparedReport(face.measurements, viewingFor("indoor", "typical")).report;
    const redness = reference.concerns.find((c) => c.concern === "redness");
    if (redness && isSoftArea(redness)) soft.add("redness");
  }
  index.soft = soft;
  return soft;
}

// ---------------------------------------------------------------------------------------------------------------
// The count.
// ---------------------------------------------------------------------------------------------------------------

/** The oracle: every concern's numbers at a resolved scene, without any wording. */
export function measureScene(face: RehearseFace, resolved: ResolvedScene): ConcernAtScene[] {
  const { byConcern } = preparedReport(face.measurements, resolved.viewing);
  const sizes = faceIndex(face.measurements).sizeMm;
  const soft = softConcerns(face);
  const d = resolved.distanceM;
  const floor = resolved.call?.resolutionFloorMm;
  const out: ConcernAtScene[] = [];
  for (const concern of CONCERN_ORDER) {
    const list = byConcern.get(concern);
    if (!list?.length) continue;
    let typicalCount = 0;
    let boundCount = 0;
    let below = 0;
    for (const t of list) {
      if (floor !== undefined && (sizes.get(t.targetId) ?? 0) < floor) {
        below++;
        continue;
      }
      if (t.distanceM >= d) boundCount++;
      if ((t.nominalM ?? t.distanceM / BOUND_TO_NOMINAL_RATIO) >= d) typicalCount++;
    }
    const total = list.length;
    const isSoft = soft.has(concern);
    out.push({
      concern,
      targetCount: total,
      typicalShare: isSoft ? (typicalCount > 0 ? 1 : 0) : typicalCount / total,
      typicalCount,
      boundShare: isSoft ? (boundCount > 0 ? 1 : 0) : boundCount / total,
      boundCount,
      soft: isSoft,
      ...(floor !== undefined ? { belowCameraCount: below } : {}),
    });
  }
  return out;
}

// ---------------------------------------------------------------------------------------------------------------
// The result.
// ---------------------------------------------------------------------------------------------------------------

/** The plain-words assumptions behind a result at a resolved scene. */
export function sceneAssumptions(face: RehearseFace, resolved: ResolvedScene): string[] {
  const { scene, light, viewer } = resolved;
  const scale = face.measurements.scale;
  const out: string[] = [];
  out.push(
    scene.id === "video_call"
      ? "Distance: the other person sees you on a screen tile, so the moment is judged at the in-person distance your face would look the same size from (see the video call numbers)."
      : `Distance: ${scene.label}. ${scene.source}`,
  );
  out.push(`Light: ${LIGHTS[light].label}. ${LIGHTS[light].source}`);
  out.push(
    viewer === "typical"
      ? "Viewer: a typical person with 20/20 sight, looking right at the mark, with nothing else competing for their attention."
      : "Viewer: someone with 20/40 sight, such as a person without their glasses, looking right at the mark.",
  );
  out.push(
    "'About' numbers are for an average observer. 'At most' numbers are for even perfect eyes (a 6 dB margin on top of the average observer), so a real viewer sees the same or less.",
  );
  out.push(
    scale.source === "iris"
      ? `Sizes in millimetres use your iris as the ruler (about ${Math.round(scale.relSd * 100)}% uncertainty), so they carry that uncertainty too.`
      : scale.source === "card"
        ? "Sizes in millimetres come from a card of known size held in the photo."
        : "No iris or card was found to set the scale, so sizes are estimated and could be well off.",
  );
  out.push("Masks and contrasts come from one photo; hair, glasses, make-up, movement and a different angle will change what is seen.");
  if (resolved.call) {
    out.push(...resolved.call.assumptions);
    out.push("Marks smaller than the video's smallest detail are counted as lost in the video, whatever the other person's eyes.");
  }
  return out;
}

function quotesFor(resolved: ResolvedScene, concerns: ConcernAtScene[]): Record<string, string> {
  const q: Record<string, string> = {
    distance: formatDistance(resolved.distanceM),
    light: LIGHTS[resolved.light].label,
    viewer: VIEWER_LABEL[resolved.viewer],
  };
  if (resolved.call) q.floor = `${mmText(resolved.call.resolutionFloorMm)} mm`;
  for (const c of concerns) {
    q[`${c.concern}.typical`] = c.soft ? typicalSoft(c.typicalCount > 0) : typicalPhrase(c.typicalShare);
    q[`${c.concern}.typicalCount`] = countText(c.typicalCount, c.targetCount);
    q[`${c.concern}.bound`] = c.soft ? boundSoft(c.boundCount > 0) : boundPhrase(c.boundShare);
    q[`${c.concern}.boundCount`] = boundCountText(c.boundCount, c.targetCount);
    if (c.belowCameraCount !== undefined) q[`${c.concern}.belowCamera`] = countText(c.belowCameraCount, c.targetCount);
  }
  return q;
}

export function observeResolved(face: RehearseFace, resolved: ResolvedScene, ref: string): ObserveResult {
  const concerns = measureScene(face, resolved);
  const call: CallGeometry | undefined = resolved.call?.call;
  return {
    ref,
    quotes: quotesFor(resolved, concerns),
    assumptions: sceneAssumptions(face, resolved),
    input: { scene: resolved.scene.id, light: resolved.light, viewer: resolved.viewer, ...(call ? { call } : {}) },
    distanceM: resolved.distanceM,
    luminanceCdM2: lightLuminance(resolved.light),
    acuityScale: resolved.viewing.acuityScale,
    concerns,
  };
}

/** Throws SceneError for a scene that cannot be resolved (see resolveScene). */
export function observeScene(face: RehearseFace, input: SceneInput, ref: string): ObserveResult {
  return observeResolved(face, resolveScene(input), ref);
}

