"use client";

import { motion } from "motion/react";
import { SPRING_SLOW } from "../motion";

export function GoalRing({ progress, play, size = 88 }: { progress: number; play: boolean; size?: number }) {
  const stroke = 8;
  const r = (size - stroke) / 2;
  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} aria-hidden className="-rotate-90">
      <circle cx={size / 2} cy={size / 2} r={r} fill="none" strokeWidth={stroke} className="stroke-muted" />
      <motion.circle
        cx={size / 2}
        cy={size / 2}
        r={r}
        fill="none"
        strokeWidth={stroke}
        strokeLinecap="round"
        className="stroke-primary"
        initial={{ pathLength: 0 }}
        animate={play ? { pathLength: progress } : undefined}
        transition={SPRING_SLOW}
      />
    </svg>
  );
}
