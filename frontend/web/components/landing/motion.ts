import type { Transition } from "motion/react";

/**
 * The landing page's motion, in one place. Springs are critically damped
 * (bounce 0), like the app's count-up: nothing overshoots, because nothing on
 * this page was thrown by the visitor. `duration` is the spring's response, not
 * a fixed length. Motion is kept to the moments that show the product working
 * (the app window, the demos, the goal rings); sections don't fade in.
 */
export const SPRING: Transition = { type: "spring", bounce: 0, duration: 0.6 };
export const SPRING_SLOW: Transition = { type: "spring", bounce: 0, duration: 0.9 };
