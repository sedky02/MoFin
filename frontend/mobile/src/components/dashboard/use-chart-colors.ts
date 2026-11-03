import { useColorScheme } from 'nativewind';

import { COLORS } from '@/theme/colors';

/** The palette for SVG fills (which cannot read CSS variables). */
export function useChartColors() {
  const { colorScheme } = useColorScheme();
  return COLORS[colorScheme === 'dark' ? 'dark' : 'light'];
}

export const CHART_RAMP = ['chart-1', 'chart-2', 'chart-3', 'chart-4', 'chart-5', 'chart-6'] as const;
