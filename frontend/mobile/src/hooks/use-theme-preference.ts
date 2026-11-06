import AsyncStorage from '@react-native-async-storage/async-storage';
import { colorScheme } from 'nativewind';
import * as React from 'react';

export type ThemePreference = 'system' | 'light' | 'dark';

export const THEME_LABELS: Record<ThemePreference, string> = {
  system: 'System',
  light: 'Light',
  dark: 'Dark',
};

// A per-device convenience (like the remembered account): losing it means "follow the system".
const STORAGE_KEY = 'mofin-theme';
const listeners = new Set<() => void>();
let current: ThemePreference = 'system';

function isPreference(v: unknown): v is ThemePreference {
  return v === 'system' || v === 'light' || v === 'dark';
}

function subscribe(cb: () => void) {
  listeners.add(cb);
  return () => {
    listeners.delete(cb);
  };
}

/** Applies a stored preference. Call it behind the splash so the first frame already has the right scheme. */
export async function loadThemePreference(): Promise<void> {
  try {
    const stored = await AsyncStorage.getItem(STORAGE_KEY);
    if (isPreference(stored)) apply(stored);
  } catch {
    /* storage unavailable: follow the system */
  }
}

function apply(next: ThemePreference) {
  current = next;
  colorScheme.set(next);
  listeners.forEach((l) => l());
}

export function setThemePreference(next: ThemePreference): void {
  apply(next);
  AsyncStorage.setItem(STORAGE_KEY, next).catch(() => {
    /* it just won't persist */
  });
}

export function useThemePreference(): { preference: ThemePreference; setPreference: (p: ThemePreference) => void } {
  const preference = React.useSyncExternalStore(
    subscribe,
    () => current,
    () => 'system' as const,
  );
  return { preference, setPreference: setThemePreference };
}
