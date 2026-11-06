import AsyncStorage from '@react-native-async-storage/async-storage';
import * as React from 'react';

import { MAX_WIDGET_GOALS } from '@/widgets/goals-data';
import { ALL_ACCOUNTS, DEFAULT_SUMMARY_CONFIG, type SummaryConfig } from '@/widgets/summary-data';

// What each widget shows, chosen when it is added. Android keeps one set of data per widget type,
// so the choice applies to every copy. Stored on this device, where widgets live.
export type WidgetSettings = {
  WeeklySummary: SummaryConfig;
  MonthlySummary: SummaryConfig;
  Goals: { goalIds: string[] };
  /** Show dots instead of amounts in every widget. */
  hideAmounts: boolean;
};

const KEY = 'mofin-widget-settings';
export const DEFAULT_WIDGET_SETTINGS: WidgetSettings = {
  WeeklySummary: DEFAULT_SUMMARY_CONFIG,
  MonthlySummary: DEFAULT_SUMMARY_CONFIG,
  Goals: { goalIds: [] },
  hideAmounts: false,
};

function accountIdOf(value: unknown, fallback: string): string {
  const id = (value as { accountId?: unknown } | undefined)?.accountId;
  return typeof id === 'string' && id ? id : fallback;
}

/**
 * Reads what was stored, keeping defaults for anything missing or malformed. A choice saved by the
 * first version (one Summary widget) carries over to both summaries.
 */
export function parseWidgetSettings(raw: string | null): WidgetSettings {
  try {
    const stored = raw ? (JSON.parse(raw) as Record<string, unknown>) : {};
    const legacy = accountIdOf(stored.summary, ALL_ACCOUNTS);
    const goalIds = (stored.Goals as { goalIds?: unknown } | undefined)?.goalIds;
    return {
      WeeklySummary: { accountId: accountIdOf(stored.WeeklySummary, legacy) },
      MonthlySummary: { accountId: accountIdOf(stored.MonthlySummary, legacy) },
      Goals: {
        goalIds: Array.isArray(goalIds)
          ? goalIds.filter((id): id is string => typeof id === 'string').slice(0, MAX_WIDGET_GOALS)
          : [],
      },
      hideAmounts: stored.hideAmounts === true,
    };
  } catch {
    return DEFAULT_WIDGET_SETTINGS;
  }
}

let value: WidgetSettings = DEFAULT_WIDGET_SETTINGS;
let loading: Promise<WidgetSettings> | undefined;
const listeners = new Set<() => void>();

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
  AsyncStorage.setItem(KEY, JSON.stringify(next)).catch(() => {});
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
