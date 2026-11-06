import * as React from "react";
import AsyncStorage from "@react-native-async-storage/async-storage";

// A per-device convenience (like a remembered tab): a flag set on one device isn't set on
// another, and losing it just shows the thing again.
const listeners = new Set<() => void>();
const cache = new Map<string, boolean>();
const loading = new Map<string, Promise<void>>();

function subscribe(cb: () => void) {
  listeners.add(cb);
  return () => {
    listeners.delete(cb);
  };
}

function notify() {
  listeners.forEach((l) => l());
}

function load(key: string): void {
  if (cache.has(key) || loading.has(key)) return;
  const p = AsyncStorage.getItem(key)
    .then((v) => {
      // A set() made while the read was in flight wins over what was on disk.
      if (!cache.has(key)) cache.set(key, v === "1");
    })
    .catch(() => {
      if (!cache.has(key)) cache.set(key, false);
    })
    .finally(() => {
      loading.delete(key);
      notify();
    });
  loading.set(key, p);
}

/**
 * A yes/no remembered on this device under `key`, and a way to set it. It reads as SET until
 * the stored value has loaded, so something hidden by default never flashes in.
 */
export function useStoredFlag(key: string): [set: boolean, set: () => void] {
  React.useEffect(() => {
    load(key);
  }, [key]);
  const value = React.useSyncExternalStore(
    subscribe,
    () => cache.get(key) ?? true,
    () => true,
  );
  const set = React.useCallback(() => {
    cache.set(key, true);
    notify();
    AsyncStorage.setItem(key, "1").catch(() => {
      /* storage unavailable: it comes back next launch */
    });
  }, [key]);
  return [value, set];
}

export function resetStoredFlagCache(): void {
  cache.clear();
  loading.clear();
}
