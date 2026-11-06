import type { Widget } from 'expo-widgets';

import type { SummaryWidgetProps } from '@/widgets/summary-data';

// Home screen widgets ship on Android only for now (summary-widget.android.tsx). Elsewhere (web,
// iOS, tests) there is no widget to update.
const SummaryWidget: Widget<SummaryWidgetProps> | null = null;
export default SummaryWidget;
