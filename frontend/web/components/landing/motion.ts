import type { Transition } from "motion/react";

/**
 * The landing page's motion in one place. Springs are critically damped (bounce 0) like the app's
 * count-up: nothing here was thrown by the visitor. `duration` is the spring's response.
 */
export const SPRING: Transition = { type: "spring", bounce: 0, duration: 0.6 };
export const SPRING_SLOW: Transition = { type: "spring", bounce: 0, duration: 0.9 };
