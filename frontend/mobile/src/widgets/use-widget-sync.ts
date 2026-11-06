import * as React from 'react';
import { AppState } from 'react-native';

import { getQueryClient } from '@/lib/query-client';
import { requestWidgetSync } from '@/widgets/widget-sync';

const CHANGE_DELAY_MS = 1_500;

/**
 * Keeps the widgets up to date while signed in: on start, on return to the foreground and after any
 * app mutation. The setup screen updates them itself. Mounted once, in the signed-in layout.
 */
export function useWidgetSync(): void {
  React.useEffect(() => {
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

    return () => {
      appState.remove();
      mutations();
      clearTimeout(timer);
    };
  }, []);
}
