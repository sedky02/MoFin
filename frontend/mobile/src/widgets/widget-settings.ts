import AsyncStorage from '@react-native-async-storage/async-storage';
import * as React from 'react';

import { DEFAULT_SUMMARY_CONFIG, type SummaryConfig, type WidgetPeriod } from '@/widgets/summary-data';

// What each home screen widget shows, set in Settings → Widgets. Android widgets have no settings
// of their own (and every copy of a widget gets the same data), so there is one choice per widget
// type. Kept on this device: widgets live on this phone's home screen.
export type WidgetSettings = {
  summary: SummaryConfig;
  /** Show dots instead of amounts in every widget. */
  hideAmounts: boolean;
};

const KEY = 'mofin-widget-settings';
export const DEFAULT_WIDGET_SETTINGS: WidgetSettings = { summary: DEFAULT_SUMMARY_CONFIG, hideAmounts: false };

let value: WidgetSettings = DEFAULT_WIDGET_SETTINGS;
let loading: Promise<WidgetSettings> | undefined;
const listeners = new Set<() => void>();
/** Only edits made in Settings → Widgets, not the first load from storage. */
const changeListeners = new Set<() => void>();

/** Reads what was stored, keeping defaults for anything missing or malformed. */
export function parseWidgetSettings(raw: string | null): WidgetSettings {
  try {
    const stored = raw ? (JSON.parse(raw) as Partial<WidgetSettings>) : {};
    const period: WidgetPeriod = stored.summary?.period === 'week' ? 'week' : 'month';
    const accountId =
      typeof stored.summary?.accountId === 'string' && stored.summary.accountId
        ? stored.summary.accountId
        : DEFAULT_SUMMARY_CONFIG.accountId;
    return { summary: { period, accountId }, hideAmounts: stored.hideAmounts === true };
  } catch {
    return DEFAULT_WIDGET_SETTINGS;
  }
}

/** The stored settings, loaded once. */
export function loadWidgetSettings(): Promise<WidgetSettings> {
  loading ??= AsyncStorage.getItem(KEY)
    .then((raw) => {
      value = parseWidgetSettings(raw);
      listeners.forEach((l) => l());
      return value;
    })
    .catch(() => value);
  return loading;
}

export function getWidgetSettings(): WidgetSettings {
  return value;
}

export function setWidgetSettings(next: WidgetSettings): void {
  value = next;
  loading = Promise.resolve(next);
  listeners.forEach((l) => l());
  changeListeners.forEach((l) => l());
  AsyncStorage.setItem(KEY, JSON.stringify(next)).catch(() => {});
}

/** Runs when the user changes a widget setting, so the widgets can be redrawn with it. */
export function onWidgetSettingsChange(listener: () => void): () => void {
  changeListeners.add(listener);
  return () => {
    changeListeners.delete(listener);
  };
}

export function subscribeWidgetSettings(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function useWidgetSettings(): [WidgetSettings, (next: WidgetSettings) => void] {
  React.useEffect(() => {
    void loadWidgetSettings();
  }, []);
  const settings = React.useSyncExternalStore(subscribeWidgetSettings, getWidgetSettings, getWidgetSettings);
  return [settings, setWidgetSettings];
}
