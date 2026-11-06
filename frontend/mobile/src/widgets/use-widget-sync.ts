import * as React from 'react';
import { AppState } from 'react-native';

import { getQueryClient } from '@/lib/query-client';
import SummaryWidget from '@/widgets/summary-widget';
import { onWidgetSettingsChange } from '@/widgets/widget-settings';
import { requestWidgetSync } from '@/widgets/widget-sync';

/** A burst of changes (a bulk approve, an edit then a save) makes one update. */
const CHANGE_DELAY_MS = 1_500;

/**
 * Keeps the widgets up to date while signed in: on start, on return to the foreground, after any
 * change saved through the app (every write is a React Query mutation), and when the widget settings
 * change. Mounted once, in the signed-in layout.
 */
export function useWidgetSync(): void {
  React.useEffect(() => {
    if (!SummaryWidget) return;
    void requestWidgetSync('start');

    const appState = AppState.addEventListener('change', (status) => {
      if (status === 'active') void requestWidgetSync('foreground');
    });

    let timer: ReturnType<typeof setTimeout> | undefined;
    const mutations = getQueryClient()
      .getMutationCache()
      .subscribe((event) => {
        if (event.type !== 'updated' || event.action.type !== 'success') return;
        clearTimeout(timer);
        timer = setTimeout(() => void requestWidgetSync('change'), CHANGE_DELAY_MS);
      });

    const settings = onWidgetSettingsChange(() => void requestWidgetSync('settings'));

    return () => {
      appState.remove();
      mutations();
      settings();
      clearTimeout(timer);
    };
  }, []);
}
