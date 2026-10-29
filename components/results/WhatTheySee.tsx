"use client";

import { formatDistance } from "@/app/_lib/axis";
import { ConcernRows } from "@/components/concerns/ConcernRows";
import { engineBadge } from "@/lib/integration/copy";
import { groupViews, type ConcernView } from "./derive";
import { useStoredDistance, type DistanceStore } from "./distanceStore";
import { EngineStrip } from "./EngineStrip";
import { MaskDisclosure } from "./MaskDisclosure";
import type { ResultsData } from "./types";

interface WhatTheySeeProps {
  data: ResultsData;
  views: ConcernView[];
  distance: DistanceStore;
  selectedId: string | null;
  onSelect: (id: string | null) => void;
  onDetails: (id: string) => void;
  /** Live sessions: YouCam units this session has used so far, for the engine strip. */
  unitsCharged?: number;
}

/**
 * The first tab. The one-line summary and how "out of sight" is decided, then one compact row per concern that follows the
 * Step back slider, then the credit and the receipts of where the numbers came from.
 */
export function WhatTheySee({ data, views, distance, selectedId, onSelect, onDetails, unitsCharged }: WhatTheySeeProps) {
  const distanceM = useStoredDistance(distance);
  const groups = groupViews(views);
  const hasSafety = views.some((v) => v.copy.safety);

  return (
    <div>
      <p className="serif text-[clamp(1.125rem,1.05rem+0.45vw,1.375rem)] leading-snug" style={{ fontWeight: 380 }}>
        {data.summary}
      </p>
      {data.notices.length > 0 && (
        <ul className="mt-3 space-y-1 border-l-2 border-ink pl-4 text-[0.9375rem] leading-relaxed text-ink-soft" aria-label="Notes about this reading">
          {data.notices.map((n) => (
            <li key={n}>{n}</li>
          ))}
        </ul>
      )}
      <p className="mt-2 max-w-[34rem] text-[0.875rem] leading-relaxed text-ink-soft">{data.reliefNote}</p>

      <div className="mt-5 flex items-baseline justify-between gap-4">
        <h2 className="eyebrow !text-[0.875rem] !text-ink">At this distance</h2>
        <p className="num text-[0.875rem] text-ink-soft">
          <span className="sr-only">From </span>
          {formatDistance(distanceM)}
        </p>
      </div>
      <p className="mt-0.5 max-w-[34rem] text-[0.875rem] leading-snug text-ink-soft">
        Press a concern to mark where it sits on the face. The bar is the share a typical sharp-eyed person looking right at it could still pick out.
      </p>
      <div className="mt-2">
        <ConcernRows groups={groups} distanceM={distanceM} selectedId={selectedId} onSelect={onSelect} onDetails={onDetails} />
      </div>
      {hasSafety && <p className="mt-4 max-w-[34rem] border-l-2 border-ink pl-3 text-[0.875rem] leading-relaxed text-ink-soft">{data.disclaimers.mark}</p>}

      {data.outOfScope.length > 0 && (
        <details className="mt-6 border-t border-rule">
          <summary className="flex min-h-11 cursor-pointer items-center justify-between gap-4 text-[0.9375rem]">
            <span>Not about visibility</span>
            <span aria-hidden="true" className="text-ink-soft">
              +
            </span>
          </summary>
          <p className="max-w-[30rem] text-[0.875rem] leading-relaxed text-ink-soft">
            These describe shape, feel or light rather than a mark someone can see, so we give them no distance.
          </p>
          <ul className="mt-3 grid gap-x-8 gap-y-2 pb-3 text-[0.9375rem] sm:grid-cols-2">
            {data.outOfScope.map((o) => (
              <li key={o.label} className="flex flex-col py-1">
                <span className="text-ink">{o.label}</span>
                <span className="text-[0.875rem] text-ink-soft">{o.reason}</span>
              </li>
            ))}
          </ul>
        </details>
      )}

      <div className="mt-5">
        <EngineStrip engine={data.engine} badge={engineBadge(data.source, unitsCharged)} live={data.source === "live"} />
      </div>
      <div className="mt-3">
        <MaskDisclosure strip={data.maskStrip} />
      </div>

      <div className="mt-5 max-w-[34rem] space-y-2 border-t border-rule pt-3 text-[0.875rem] leading-relaxed text-ink-soft">
        {data.persona.description && <p>{data.persona.description}</p>}
        <p>
          {data.provenance} {data.rendererNote}
        </p>
      </div>
    </div>
  );
}
