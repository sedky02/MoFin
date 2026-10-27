"use client";

import { MotionConfig } from "motion/react";
import { SPRING } from "./motion";

/**
 * Every motion animation on the landing page follows the visitor's
 * reduced-motion setting: movement is dropped and only fades remain
 * (CSS animations are already handled in globals.css).
 */
export function LandingMotion({ children }: { children: React.ReactNode }) {
  return (
    <MotionConfig reducedMotion="user" transition={SPRING}>
      {children}
    </MotionConfig>
  );
}
