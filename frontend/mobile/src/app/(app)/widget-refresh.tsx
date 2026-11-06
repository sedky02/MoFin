import { router, useLocalSearchParams } from 'expo-router';
import * as React from 'react';

import { WIDGET_SCREENS, widgetScreen } from '@/lib/deep-links';
import { requestWidgetSync } from '@/widgets/widget-sync';

/**
 * A widget's ↻ lands here (mofin://refresh?to=…): refetch the widget data, then go to its screen.
 * Inside the signed-in group, so an expired session signs in first.
 */
export default function WidgetRefreshScreen() {
  const { to } = useLocalSearchParams<{ to?: string }>();
  React.useEffect(() => {
    void requestWidgetSync('refresh');
    router.replace(WIDGET_SCREENS[widgetScreen(to)]);
  }, [to]);
  return null;
}
