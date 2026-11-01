"use client";

import * as React from "react";

// Per-browser conveniences (like a remembered tab): a flag set on one device isn't set on
// another, and losing it just shows the thing again.
const listeners = new Set<() => void>();

function subscribe(cb: () => void) {
  listeners.add(cb);
  window.addEventListener("storage", cb); // other tabs
  return () => {
    listeners.delete(cb);
    window.removeEventListener("storage", cb);
  };
}

/**
 * A yes/no remembered in this browser under `key`, and a way to set it. Reads as set on the
 * server, so something hidden by default can never differ from the HTML.
 */
export function useStoredFlag(key: string): [set: boolean, set: () => void] {
  const read = React.useCallback(() => {
    try {
      return localStorage.getItem(key) === "1";
    } catch {
      return false;
    }
  }, [key]);
  const value = React.useSyncExternalStore(subscribe, read, () => true);
  const set = React.useCallback(() => {
    try {
      localStorage.setItem(key, "1");
    } catch {
      /* storage unavailable (private mode): it comes back next visit */
    }
    listeners.forEach((l) => l());
  }, [key]);
  return [value, set];
}
