import AsyncStorage from '@react-native-async-storage/async-storage';
import { getLocales } from 'expo-localization';
import * as React from 'react';

// The language speech is recognized in. Empty means the device's own language. Stored per device:
// it is about the phone's recognizer, not the account.
const KEY = 'mofin-voice-locale';
let value: string | null = null;
let loaded = false;
const listeners = new Set<() => void>();

export function deviceLocale(): string {
  try {
    return getLocales()[0]?.languageTag || 'en-US';
  } catch {
    return 'en-US';
  }
}

export const VOICE_LOCALES: { value: string; label: string }[] = [
  { value: 'en-US', label: 'English (US)' },
  { value: 'en-GB', label: 'English (UK)' },
  { value: 'fr-FR', label: 'Français' },
  { value: 'ar-TN', label: 'العربية (تونس)' },
  { value: 'ar-SA', label: 'العربية' },
  { value: 'es-ES', label: 'Español' },
  { value: 'de-DE', label: 'Deutsch' },
  { value: 'it-IT', label: 'Italiano' },
];

function notify() {
  listeners.forEach((l) => l());
}

function load() {
  if (loaded) return;
  loaded = true;
  AsyncStorage.getItem(KEY)
    .then((v) => {
      if (value === null) value = v ?? '';
      notify();
    })
    .catch(() => {});
}

export function useVoiceLocalePreference(): [string, (next: string) => void] {
  React.useEffect(load, []);
  const current = React.useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => {
        listeners.delete(l);
      };
    },
    () => value ?? '',
    () => '',
  );
  const set = React.useCallback((next: string) => {
    value = next;
    notify();
    AsyncStorage.setItem(KEY, next).catch(() => {});
  }, []);
  return [current, set];
}

export function useVoiceLocale(): string {
  const [chosen] = useVoiceLocalePreference();
  return chosen || deviceLocale();
}
