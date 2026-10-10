"use client";

import * as React from "react";

interface CountUpOpts {
  // Skip the animation (e.g. respects prefers-reduced-motion).
  enabled?: boolean;
}

// Natural frequency (rad/s) of the critically damped spring: ~95% of the way in 0.3s,
// visually done in about a second. Critically damped means it never overshoots, so a
// balance never shows a number larger than the real one.
const OMEGA = 16;
// Stop once the remaining gap is below a cent, or after this long, whichever comes first.
const EPSILON = 0.005;
const MAX_MS = 1600;

/**
 * Spring-eased count-up. Counts 0 → target on first mount, and afterwards glides from
 * the value currently on screen (carrying its velocity) to each new target — account or
 * currency switch, optimistic update — instead of restarting from 0. Returns the live value.
 *
 * Uses the closed-form solution of a critically damped spring rather than stepping a
 * simulation, so it is exact at any frame rate and lands precisely on the target.
 */
export function useCountUp(target: number, opts: CountUpOpts = {}): number {
  const { enabled = true } = opts;

  const prefersReduced =
    typeof window !== "undefined" &&
    window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;

  const animate = enabled && !prefersReduced && Number.isFinite(target);
  // Start at the real value so server-rendered HTML (and no-JS / reduced-motion
  // clients) never show "$0.00"; the layout effect below rewinds to 0 before
  // the first client paint when we are actually going to animate.
  const [value, setValue] = React.useState(target);
  // The on-screen value and its velocity survive re-targets, so an interrupted
  // animation continues from where it is rather than jumping back to 0.
  const position = React.useRef(target);
  const velocity = React.useRef(0);
  const mounted = React.useRef(false);
  React.useLayoutEffect(() => {
    if (mounted.current) return;
    mounted.current = true;
    if (animate) {
      position.current = 0;
      setValue(0);
    }
  }, [animate]);

  React.useEffect(() => {
    if (!animate) {
      position.current = target;
      velocity.current = 0;
      setValue(target);
      return;
    }

    const a = position.current - target; // distance still to cover
    const b = velocity.current + OMEGA * a;
    let raf = 0;
    const start = performance.now();

    const tick = (now: number) => {
      const t = (now - start) / 1000;
      const decay = Math.exp(-OMEGA * t);
      const offset = (a + b * t) * decay; // position - target
      position.current = target + offset;
      velocity.current = (b - OMEGA * (a + b * t)) * decay;

      if (Math.abs(offset) < EPSILON || now - start > MAX_MS) {
        position.current = target;
        velocity.current = 0;
        setValue(target);
        return;
      }
      setValue(position.current);
      raf = requestAnimationFrame(tick);
    };

    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [target, animate]);

  return value;
}
