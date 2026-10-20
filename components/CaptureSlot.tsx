import type { ReactNode } from "react";

/**
 * INTEGRATION SLOT for the camera capture component (components/capture/**, owned by Capture).
 * Pass the capture UI as `children`; with none, this renders a clearly marked placeholder.
 */
export function CaptureSlot({ children }: { children?: ReactNode }) {
  if (children) {
    return <div id="camera">{children}</div>;
  }
  return (
    <div
      id="camera"
      data-slot="capture"
      className="relative grid min-h-[16rem] place-items-center border border-dashed border-rule-strong bg-paper-deep/60 p-8 text-center"
    >
      <div className="max-w-md">
        <p className="eyebrow">Placeholder slot</p>
        <p className="serif mt-3 text-[1.75rem] leading-tight" style={{ fontWeight: 380 }}>
          Use my camera
        </p>
        <p className="mt-3 text-[0.9375rem] leading-relaxed text-muted">
          Live capture lands here: front-facing, even light, beauty mode off. Until then, the demo faces show everything it does.
        </p>
        <button type="button" disabled aria-disabled="true" className="btn btn-ghost mt-6">
          Camera not connected yet
        </button>
      </div>
    </div>
  );
}
