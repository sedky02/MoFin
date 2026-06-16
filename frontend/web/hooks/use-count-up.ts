"use client";

import * as React from "react";

interface SpringOpts {
  // Spring physics — tuned for a confident, slightly-overshooting settle.
  stiffness?: number;
  damping?: number;
  mass?: number;
  // Skip the animation (e.g. respects prefers-reduced-motion).
  enabled?: boolean;
}

/**
 * Spring-eased count-up from 0 → target on first mount. Returns the live value.
 * Used for balance numbers — the one place we spend visual boldness.
 */
export function useCountUp(target: number, opts: SpringOpts = {}): number {
  const {
    stiffness = 120,
    damping = 18,
    mass = 1,
    enabled = true,
  } = opts;

  const prefersReduced =
    typeof window !== "undefined" &&
    window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;

  const animate = enabled && !prefersReduced && Number.isFinite(target);
  const [value, setValue] = React.useState(animate ? 0 : target);

  React.useEffect(() => {
    if (!animate) {
      setValue(target);
      return;
    }

    let raf = 0;
    let position = 0;
    let velocity = 0;
    let last: number | null = null;
    const start = performance.now();

    const tick = (now: number) => {
      if (last === null) last = now;
      // Clamp dt for stability if the tab was backgrounded.
      const dt = Math.min((now - last) / 1000, 1 / 30);
      last = now;

      const force = -stiffness * (position - target);
      const damp = -damping * velocity;
      const acceleration = (force + damp) / mass;
      velocity += acceleration * dt;
      position += velocity * dt;

      const settled =
        Math.abs(target - position) < 0.5 && Math.abs(velocity) < 0.5;
      const elapsed = now - start;

      if (settled || elapsed > 2000) {
        setValue(target);
        return;
      }
      setValue(position);
      raf = requestAnimationFrame(tick);
    };

    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
    // Re-run when the target changes (e.g. after an optimistic balance update).
  }, [target, animate, stiffness, damping, mass]);

  return value;
}
