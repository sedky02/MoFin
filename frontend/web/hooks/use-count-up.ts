"use client";

import * as React from "react";

interface CountUpOpts {
  enabled?: boolean;
}

// Natural frequency of a critically damped spring (~95% in 0.3 s): it never overshoots, so a
// balance never shows more than the real number.
const OMEGA = 16;
// Stop once the remaining gap is below a cent, or after this long, whichever comes first.
const EPSILON = 0.005;
const MAX_MS = 1600;

function createStore(initial: number) {
  const listeners = new Set<() => void>();
  const store = {
    position: initial,
    velocity: 0,
    getValue: () => store.position,
    set(position: number, velocity: number) {
      store.position = position;
      store.velocity = velocity;
      listeners.forEach((l) => l());
    },
    subscribe(listener: () => void) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
  };
  return store;
}

/**
 * Counts 0 → target on first mount, then glides from the value on screen (keeping velocity) to each
 * new target instead of restarting.
 */
export function useCountUp(target: number, opts: CountUpOpts = {}): number {
  const { enabled = true } = opts;

  const prefersReduced =
    typeof window !== "undefined" &&
    window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;

  const animate = enabled && !prefersReduced && Number.isFinite(target);
  // Value and velocity live in an external store so an interrupted animation continues from where
  // it is, and frames update React through the store.
  const [store] = React.useState(() => createStore(animate ? 0 : target));
  const value = React.useSyncExternalStore(
    store.subscribe,
    store.getValue,
    () => target,
  );

  React.useEffect(() => {
    if (!animate) {
      store.set(target, 0);
      return;
    }

    const a = store.position - target; // distance still to cover
    const b = store.velocity + OMEGA * a;
    let raf = 0;
    const start = performance.now();

    const tick = (now: number) => {
      const t = (now - start) / 1000;
      const decay = Math.exp(-OMEGA * t);
      const offset = (a + b * t) * decay; // position - target
      if (Math.abs(offset) < EPSILON || now - start > MAX_MS) {
        store.set(target, 0);
        return;
      }
      store.set(target + offset, (b - OMEGA * (a + b * t)) * decay);
      raf = requestAnimationFrame(tick);
    };

    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [target, animate, store]);

  return value;
}
