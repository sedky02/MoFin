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
  // The on-screen value and its velocity live in a small external store, so they
  // survive re-targets (an interrupted animation continues from where it is rather
  // than jumping back to 0) and animation frames update React through the store's
  // subscription instead of setState-in-effect. A client that is going to animate
  // starts the store at 0; the server snapshot below is always the real value, so
  // server-rendered HTML (and no-JS / reduced-motion clients) never shows "$0.00".
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
