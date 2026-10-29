"use client";

import * as React from "react";

/** Whether a CSS media query currently matches. False on the server and where matchMedia doesn't exist. */
export function useMediaQuery(query: string): boolean {
  const subscribe = React.useCallback(
    (onChange: () => void) => {
      if (typeof window === "undefined" || typeof window.matchMedia !== "function") return () => {};
      const list = window.matchMedia(query);
      list.addEventListener("change", onChange);
      return () => list.removeEventListener("change", onChange);
    },
    [query],
  );
  return React.useSyncExternalStore(
    subscribe,
    () => typeof window.matchMedia === "function" && window.matchMedia(query).matches,
    () => false,
  );
}
