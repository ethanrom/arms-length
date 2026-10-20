"use client";

import { MotionConfig } from "motion/react";
import type { ReactNode } from "react";

/** Honours the OS "reduce motion" setting for every motion component: transforms are skipped, opacity still fades. */
export function Providers({ children }: { children: ReactNode }) {
  return <MotionConfig reducedMotion="user">{children}</MotionConfig>;
}
