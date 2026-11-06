"use client";

import * as React from "react";

const KEY = "chat";
const listeners = new Set<() => void>();

function read(): string | null {
  return new URLSearchParams(window.location.search).get(KEY);
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  window.addEventListener("popstate", listener);
  return () => {
    listeners.delete(listener);
    window.removeEventListener("popstate", listener);
  };
}

/**
 * The open chat lives in `?chat=<id>` to be linkable and Back/Forward-able; read from
 * window.location because useSearchParams would need a Suspense boundary under cacheComponents.
 */
export function useChatParam(): [string | null, (id: string | null) => void] {
  const value = React.useSyncExternalStore(subscribe, read, () => null);
  const set = React.useCallback((id: string | null) => {
    const url = new URL(window.location.href);
    if (id) url.searchParams.set(KEY, id);
    else url.searchParams.delete(KEY);
    if (url.href === window.location.href) return;
    window.history.pushState(window.history.state, "", url);
    for (const listener of listeners) listener();
  }, []);
  return [value, set];
}
