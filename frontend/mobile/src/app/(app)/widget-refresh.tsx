import { router, useLocalSearchParams } from 'expo-router';
import * as React from 'react';

import { WIDGET_SCREENS, widgetScreen } from '@/lib/deep-links';
import { requestWidgetSync } from '@/widgets/widget-sync';

/**
 * Where a widget's ↻ lands (mofin://refresh?to=…). It is inside the signed-in group, so an expired
 * session goes to the sign-in screen first. It refetches the widget data (the widget shows
 * "Updating…" meanwhile) and goes straight on to the widget's screen.
 */
export default function WidgetRefreshScreen() {
  const { to } = useLocalSearchParams<{ to?: string }>();
  React.useEffect(() => {
    void requestWidgetSync('refresh');
    router.replace(WIDGET_SCREENS[widgetScreen(to)]);
  }, [to]);
  return null;
}
