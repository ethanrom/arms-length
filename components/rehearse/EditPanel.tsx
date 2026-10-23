"use client";

import { useId } from "react";
import { formatDistance, spokenDistance } from "@/app/_lib/axis";
import type { SceneId } from "@/lib/contracts/rehearse";
import { distanceRange, type MomentEdit } from "./edit";
import { LIGHT_OPTIONS, VIEWER_OPTIONS } from "./labels";

const SEGMENT =
  "flex min-h-11 items-center justify-center border-l border-ink px-3.5 text-center text-[0.875rem] leading-tight transition-colors first:border-l-0 hover:bg-ink/5 peer-checked:bg-ink peer-checked:text-paper peer-checked:hover:bg-ink peer-focus-visible:outline peer-focus-visible:outline-2 peer-focus-visible:outline-offset-4 peer-focus-visible:outline-ink forced-colors:peer-checked:font-semibold forced-colors:peer-checked:underline";

interface EditPanelProps {
  scene: SceneId;
  edit: MomentEdit;
  onChange: (edit: MomentEdit) => void;
  onReset: () => void;
  changed: boolean;
}

/** Three things that change what other people see: the light, who is looking, and (in person) how far away they are. */
export function EditPanel({ scene, edit, onChange, onReset, changed }: EditPanelProps) {
  const lightName = useId();
  const viewerName = useId();
  const rangeId = useId();
  const range = distanceRange(scene);

  return (
    <div className="space-y-6">
      <fieldset>
        <legend className="eyebrow !text-[0.875rem]">Light</legend>
        <div className="mt-2 inline-flex flex-wrap border border-ink">
          {LIGHT_OPTIONS.map((o) => (
            <label key={o.id} className="relative cursor-pointer">
              <input type="radio" name={lightName} className="peer sr-only" checked={edit.light === o.id} onChange={() => onChange({ ...edit, light: o.id })} />
              <span className={SEGMENT}>{o.label}</span>
            </label>
          ))}
        </div>
      </fieldset>

      <fieldset>
        <legend className="eyebrow !text-[0.875rem]">Who is looking</legend>
        <div className="mt-2 inline-flex flex-wrap border border-ink">
          {VIEWER_OPTIONS.map((o) => (
            <label key={o.id} className="relative cursor-pointer">
              <input type="radio" name={viewerName} className="peer sr-only" checked={edit.viewer === o.id} onChange={() => onChange({ ...edit, viewer: o.id })} />
              <span className={SEGMENT}>{o.label}</span>
            </label>
          ))}
        </div>
      </fieldset>

      {range ? (
        <div>
          <label htmlFor={rangeId} className="eyebrow !text-[0.875rem]">
            Distance
          </label>
          <div className="mt-2 flex max-w-md items-center gap-4">
            <input
              id={rangeId}
              type="range"
              min={range[0]}
              max={range[1]}
              step={0.05}
              value={edit.distanceM}
              aria-valuetext={spokenDistance(edit.distanceM)}
              onChange={(e) => onChange({ ...edit, distanceM: Number(e.target.value) })}
              className="h-11 min-w-0 flex-1 cursor-pointer accent-ink"
            />
            <output htmlFor={rangeId} className="num w-16 shrink-0 text-right font-mono text-[0.9375rem]">
              {formatDistance(edit.distanceM)}
            </output>
          </div>
          <p className="mt-1 text-[0.875rem] text-ink-soft">
            {formatDistance(range[0])} to {formatDistance(range[1])}, the range for this kind of moment.
          </p>
        </div>
      ) : (
        <p className="max-w-md text-[0.875rem] leading-relaxed text-ink-soft">On a video call the distance comes from the camera and the screen, so it is not set by hand.</p>
      )}

      {changed && (
        <button type="button" className="btn btn-ghost btn-sm" onClick={onReset}>
          Reset these choices
        </button>
      )}
    </div>
  );
}
