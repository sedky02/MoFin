import { Redirect, useLocalSearchParams } from 'expo-router';

import { WidgetSetup } from '@/components/widgets/widget-setup';
import { isWidgetName } from '@/widgets/summary-data';

/**
 * Opened by the launcher when a MoFin widget is added (mofin://widget-setup?widget=…, through
 * plugins/with-widget-configure.js). Inside the signed-in group: a signed-out user signs in first.
 */
export default function WidgetSetupScreen() {
  const { widget } = useLocalSearchParams<{ widget?: string }>();
  if (!isWidgetName(widget)) return <Redirect href="/dashboard" />;
  return <WidgetSetup widget={widget} />;
}
