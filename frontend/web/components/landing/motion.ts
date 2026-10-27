import type { Transition, Variants } from "motion/react";

/**
 * The landing page's motion, in one place. Springs are critically damped
 * (bounce 0), like the app's count-up: nothing overshoots, because nothing on
 * this page was thrown by the visitor. `duration` is the spring's response, not
 * a fixed length.
 */
export const SPRING: Transition = { type: "spring", bounce: 0, duration: 0.6 };
export const SPRING_SLOW: Transition = { type: "spring", bounce: 0, duration: 0.9 };
/** Pointer-driven tilt: quick to follow, still no overshoot. */
export const TILT_SPRING = { stiffness: 220, damping: 30 };

/** Rise into place from slightly below; children follow one after another. */
export const fadeUp: Variants = {
  hidden: { opacity: 0, y: 24 },
  show: { opacity: 1, y: 0, transition: SPRING },
};

export const stagger = (gap = 0.08, delay = 0): Variants => ({
  hidden: {},
  show: { transition: { staggerChildren: gap, delayChildren: delay } },
});

/** Reveal once, when about a third of the element is on screen. */
export const VIEWPORT = { once: true, amount: 0.3 } as const;
