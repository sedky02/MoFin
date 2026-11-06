"use client";

import { MotionConfig } from "motion/react";
import { SPRING } from "./motion";

/**
 * Every landing animation follows reduced motion: movement is dropped, fades remain (CSS animations
 * are handled in globals.css).
 */
export function LandingMotion({ children }: { children: React.ReactNode }) {
  return (
    <MotionConfig reducedMotion="user" transition={SPRING}>
      {children}
    </MotionConfig>
  );
}
