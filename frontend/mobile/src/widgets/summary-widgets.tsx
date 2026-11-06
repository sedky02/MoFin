import type { Widget } from 'expo-widgets';

import type { SummaryWidgetProps } from '@/widgets/summary-data';

// Home screen widgets ship on Android only for now (summary-widgets.android.tsx). Elsewhere (web,
// iOS, tests) there is no widget to update.
export const WeeklySummaryWidget: Widget<SummaryWidgetProps> | null = null;
export const MonthlySummaryWidget: Widget<SummaryWidgetProps> | null = null;
