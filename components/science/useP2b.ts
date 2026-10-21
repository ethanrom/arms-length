import { useEffect, useState } from "react";
import type { ReadingBundle } from "@/lib/integration/types";

/** The recorded analysis of the demo face p2b (public/demo/p2b/bundle.json), fetched once and shared by every widget. */
export const P2B_URL = "/demo/p2b/bundle.json";

let pending: Promise<ReadingBundle> | null = null;

export function loadP2b(): Promise<ReadingBundle> {
  if (!pending) {
    pending = fetch(P2B_URL).then((r) => {
      if (!r.ok) throw new Error(`could not load ${P2B_URL}: ${r.status}`);
      return r.json() as Promise<ReadingBundle>;
    });
    pending.catch(() => {
      pending = null;
    });
  }
  return pending;
}

export type P2bState = { status: "loading"; bundle: null } | { status: "ready"; bundle: ReadingBundle } | { status: "error"; bundle: null };

export function useP2b(): P2bState {
  const [state, setState] = useState<P2bState>({ status: "loading", bundle: null });
  useEffect(() => {
    let live = true;
    loadP2b().then(
      (bundle) => live && setState({ status: "ready", bundle }),
      () => live && setState({ status: "error", bundle: null }),
    );
    return () => {
      live = false;
    };
  }, []);
  return state;
}
