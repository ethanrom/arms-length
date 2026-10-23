import { concernTitle } from "@/lib/copy/concerns";
import { SCENES, type LightId, type ObserveResult, type PlannedMoment, type SceneId, type SceneInput, type ViewerId } from "@/lib/contracts/rehearse";

/** What a visitor can change on a moment: the light, the viewer, and (in person) the distance. */
export interface MomentEdit {
  light: LightId;
  viewer: ViewerId;
  distanceM: number;
}

/** The range a scene allows (SCENES, with its source); a video call has none, its distance comes from the geometry. */
export function distanceRange(scene: SceneId): [number, number] | null {
  return SCENES.find((s) => s.id === scene)?.rangeM ?? null;
}

const clamp = (v: number, [lo, hi]: [number, number]) => Math.min(hi, Math.max(lo, v));
const round2 = (v: number) => Math.round(v * 100) / 100;

/** The edit that reproduces the plan's own result. */
export function startingEdit(observe: ObserveResult): MomentEdit {
  const range = distanceRange(observe.input.scene);
  return {
    light: observe.input.light,
    viewer: observe.input.viewer,
    distanceM: range ? clamp(round2(observe.distanceM), range) : observe.distanceM,
  };
}

/** The tool input for an edit: the moment's own scene (and call geometry) with the three changes applied. */
export function editedScene(moment: PlannedMoment, edit: MomentEdit): SceneInput {
  const range = distanceRange(moment.scene.scene);
  return {
    scene: moment.scene.scene,
    light: edit.light,
    viewer: edit.viewer,
    ...(range ? { distanceM: clamp(round2(edit.distanceM), range) } : {}),
    ...(moment.scene.call ? { call: moment.scene.call } : {}),
  };
}

export const sameEdit = (a: MomentEdit, b: MomentEdit) => a.light === b.light && a.viewer === b.viewer && Math.abs(a.distanceM - b.distanceM) < 1e-6;

/** "31%", "under 1%" for a share that is not zero but rounds to it. */
export function percentOf(share: number): string {
  const p = Math.round(share * 100);
  return share > 0 && p === 0 ? "under 1%" : `${p}%`;
}

export interface EditedSentences {
  notice: string[];
  outOfSight: string[];
}

/**
 * The words for an edited moment. The numbers are the tool result's; the sentences are fixed templates, because the
 * planner's wording belongs to the numbers it was written for.
 */
export function editedSentences(observe: ObserveResult): EditedSentences {
  const notice: string[] = [];
  const outOfSight: string[] = [];
  const concerns = [...observe.concerns].filter((c) => c.targetCount > 0).sort((a, b) => b.typicalShare - a.typicalShare);
  for (const c of concerns) {
    const name = concernTitle(c.concern);
    if (c.typicalShare > 0) {
      notice.push(
        c.soft
          ? `${name}: a larger, soft area that a typical viewer can see.`
          : `${name}: about ${percentOf(c.typicalShare)} (${c.typicalCount} of ${c.targetCount}) could be picked out by a typical viewer.`,
      );
      continue;
    }
    const sharp = c.boundShare > 0 ? (c.soft ? " The sharpest eyes could still see it." : ` The sharpest eyes could still pick out about ${percentOf(c.boundShare)}.`) : "";
    const camera = c.belowCameraCount ? ` ${c.belowCameraCount} of ${c.targetCount} are finer than the call can carry.` : "";
    outOfSight.push(`${name}: out of sight for a typical viewer.${sharp}${camera}`);
  }
  return { notice, outOfSight };
}
