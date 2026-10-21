"use client";

import { useId, useState } from "react";
import { MaskStripView } from "./MaskStripView";
import type { MaskStrip } from "./types";

/** "What YouCam detected" behind a toggle: the receipt that YouCam did the finding, without the eight faces on the fold. */
export function MaskDisclosure({ strip }: { strip: MaskStrip }) {
  const [open, setOpen] = useState(false);
  const panel = useId();
  return (
    <div>
      <button
        type="button"
        aria-expanded={open}
        aria-controls={panel}
        onClick={() => setOpen((o) => !o)}
        className="group inline-flex min-h-11 items-center gap-3 border border-ink px-4 text-[0.9375rem] transition-colors hover:bg-ink/5"
      >
        <span aria-hidden="true" className="relative block h-3.5 w-3.5">
          <span className="absolute left-0 top-1/2 h-px w-full bg-ink" />
          <span className={`absolute left-1/2 top-0 h-full w-px bg-ink transition-transform duration-300 ${open ? "scale-y-0" : ""}`} />
        </span>
        {open ? "Hide" : "Show"} what YouCam detected
      </button>
      <div id={panel} hidden={!open} className="mt-6">
        {open && <MaskStripView strip={strip} compact />}
      </div>
    </div>
  );
}
