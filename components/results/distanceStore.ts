import { useSyncExternalStore } from "react";

/**
 * The Step back distance, shared with the rows beside the face. A tiny store rather than state in the page, so a slider drag
 * re-renders the rows and nothing else.
 */
export interface DistanceStore {
  get: () => number;
  set: (distanceM: number) => void;
  subscribe: (notify: () => void) => () => void;
}

export function createDistanceStore(initialM: number): DistanceStore {
  let value = initialM;
  const listeners = new Set<() => void>();
  return {
    get: () => value,
    set: (next) => {
      if (next === value) return;
      value = next;
      listeners.forEach((notify) => notify());
    },
    subscribe: (notify) => {
      listeners.add(notify);
      return () => {
        listeners.delete(notify);
      };
    },
  };
}

export function useStoredDistance(store: DistanceStore): number {
  return useSyncExternalStore(store.subscribe, store.get, store.get);
}
