"use client";

import dynamic from "next/dynamic";

/**
 * The widgets, each in its own chunk. The page mounts one only when the reader scrolls near it (LazyMount), and only then does
 * the browser fetch its code, so the first load carries none of lib/vision, the lookup tables or the ModelFest stimuli.
 */
function Loading() {
  return (
    <div className="sci-plate sci-hatch grid min-h-[30rem] place-items-center text-[0.875rem] text-muted" role="status">
      <p>Loading the widget.</p>
    </div>
  );
}

export const FollowFeature = dynamic(() => import("./FollowFeature").then((m) => m.FollowFeature), { ssr: false, loading: Loading });
export const AngleExplorer = dynamic(() => import("./AngleExplorer").then((m) => m.AngleExplorer), { ssr: false, loading: Loading });
export const CsfExplorer = dynamic(() => import("./CsfExplorer").then((m) => m.CsfExplorer), { ssr: false, loading: Loading });
export const ModelFestWidget = dynamic(() => import("./ModelFestWidget").then((m) => m.ModelFestWidget), { ssr: false, loading: Loading });
export const TwoEyes = dynamic(() => import("./TwoEyes").then((m) => m.TwoEyes), { ssr: false, loading: Loading });
export const PoreSurvival = dynamic(() => import("./PoreSurvival").then((m) => m.PoreSurvival), { ssr: false, loading: Loading });
export const WorthItDiff = dynamic(() => import("./WorthItDiff").then((m) => m.WorthItDiff), { ssr: false, loading: Loading });
