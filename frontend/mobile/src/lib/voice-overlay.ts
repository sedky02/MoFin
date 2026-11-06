import * as React from 'react';

// Whether the voice overlay is open. One overlay for the whole app, opened by holding the Add button
// (or from the Ask chat's mic), drawn over whatever screen is showing without navigating away.
let open = false;
const listeners = new Set<() => void>();

function set(next: boolean) {
  if (open === next) return;
  open = next;
  listeners.forEach((l) => l());
}

export const voiceOverlay = {
  open: () => set(true),
  close: () => set(false),
};

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function useVoiceOverlayOpen(): boolean {
  return React.useSyncExternalStore(subscribe, () => open, () => false);
}
