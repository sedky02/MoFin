import type { Widget } from 'expo-widgets';

import type { GoalsWidgetProps } from '@/widgets/goals-data';

// Home screen widgets ship on Android only for now (goals-widget.android.tsx).
export const GoalsHomeWidget: Widget<GoalsWidgetProps> | null = null;
