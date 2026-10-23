"use client";

import { useMemo, type Ref } from "react";
import { Stage } from "./stage/Stage";
import type { StagePhoto } from "./stage/types";
import { PREVIEW_SCENES, previewObserve } from "./previews";

interface TeaserProps {
  photo: StagePhoto;
  onOpen: () => void;
  buttonRef?: Ref<HTMLButtonElement>;
}

/**
 * What the results page shows of "Tomorrow, from their side": three small scenes of this face (a laptop call, a lunch table, a
 * dinner at home), drawn from the model with no agent run, and the one button that opens the real thing.
 */
export function Teaser({ photo, onOpen, buttonRef }: TeaserProps) {
  const scenes = useMemo(() => PREVIEW_SCENES.map((p) => ({ ...p, observe: previewObserve(p.input, `preview-${p.key}`) })), []);

  return (
    <div>
      <div
        role="group"
        aria-label="Three moments from a day"
        tabIndex={0}
        className="-mx-5 flex snap-x snap-mandatory gap-4 overflow-x-auto px-5 pb-2 md:mx-0 md:grid md:grid-cols-3 md:gap-6 md:overflow-visible md:px-0 md:pb-0"
      >
        {scenes.map((s) => (
          <figure key={s.key} className="m-0 w-[78%] shrink-0 snap-center md:w-auto">
            <Stage
              scene={s.observe.input.scene}
              light={s.observe.input.light}
              call={s.observe.input.call}
              observe={s.observe}
              photo={photo}
              label={`${s.label}: your face as the person there sees it`}
            />
            <figcaption className="mt-3 text-[0.9375rem] leading-snug text-ink-soft">{s.label}</figcaption>
          </figure>
        ))}
      </div>

      <div className="mt-10 flex flex-col items-start gap-3">
        <button ref={buttonRef} type="button" onClick={onOpen} aria-haspopup="dialog" className="btn btn-primary" data-testid="rehearse-open">
          Rehearse my day
          <span className="arrow" aria-hidden="true">
            &rarr;
          </span>
        </button>
        <p className="text-[0.875rem] leading-snug text-ink-soft">About 15 seconds. Only measurements are used, not your photo.</p>
      </div>
    </div>
  );
}
