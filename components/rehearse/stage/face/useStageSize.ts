"use client";

import { useEffect, useState, type RefObject } from "react";

export interface StageSize {
  /** CSS pixels. */
  w: number;
  h: number;
  dpr: number;
}

/** The size of the element in CSS pixels (null until measured), following resizes. */
export function useStageSize(ref: RefObject<HTMLElement | null>): StageSize | null {
  const [size, setSize] = useState<StageSize | null>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const observer = new ResizeObserver((entries) => {
      const box = entries[0]?.contentRect;
      if (!box || box.width === 0 || box.height === 0) return;
      const dpr = window.devicePixelRatio || 1;
      setSize((prev) => (prev && prev.w === box.width && prev.h === box.height && prev.dpr === dpr ? prev : { w: box.width, h: box.height, dpr }));
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, [ref]);

  return size;
}
