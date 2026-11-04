import * as React from 'react';
import { Pressable, View } from 'react-native';
import Svg, { Line, Rect } from 'react-native-svg';

import { chartBars, seriesMonthLong, seriesMonthShort } from '@/components/dashboard/dashboard-logic';
import { useChartColors } from '@/components/dashboard/use-chart-colors';
import { MoneyAmount } from '@/components/common/money-amount';
import { Text } from '@/components/ui/text';
import { barLabel, chartTableRows, type ChartMetric } from '@/core/hero-chart-a11y';
import type { MonthlySeriesPoint } from '@/core/types';
import { cn } from '@/lib/utils';

export const HERO_CHART_HEIGHT = 150;

/** Height of the stub drawn for a month with nothing in it, so every month has a mark on the axis. */
const EMPTY_BAR_HEIGHT = 3;

/**
 * The six-month bar chart, drawn in SVG. Each month is a button that names its figures for screen
 * readers; the panel under the chart shows the current month's income, expenses and balance, or the
 * month that was tapped. A summary label on the whole chart carries the same table the web gives
 * screen readers.
 */
export function HeroChart({
  points,
  metric,
  currency,
}: {
  points: MonthlySeriesPoint[];
  metric: ChartMetric;
  currency: string;
}) {
  const c = useChartColors();
  const [width, setWidth] = React.useState(0);
  const [picked, setPicked] = React.useState<number | null>(null);
  const { bars } = chartBars(points, metric);
  const n = bars.length;
  const slot = n > 0 ? width / n : 0;
  const barW = Math.max(slot - 10, 4);
  // The current month until another one is tapped; tapping it again (or the current month) goes back.
  const selectedIndex = picked !== null && picked < n ? picked : n > 0 ? n - 1 : null;
  const selected = selectedIndex !== null ? points[selectedIndex] : undefined;

  const summary = chartTableRows(points, currency, (m) => seriesMonthLong(m))
    .map((r) => `${r[0]}: income ${r[1]}, expenses ${r[2]}, balance ${r[3]}`)
    .join('. ');

  return (
    <View>
      <View
        accessible={false}
        accessibilityLabel={`Six-month chart. ${summary}`}
        onLayout={(e) => setWidth(e.nativeEvent.layout.width)}
        style={{ height: HERO_CHART_HEIGHT }}>
        {width > 0 ? (
          <>
            <Svg width={width} height={HERO_CHART_HEIGHT} aria-hidden>
              <Line x1={0} x2={width} y1={HERO_CHART_HEIGHT - 0.5} y2={HERO_CHART_HEIGHT - 0.5} stroke={c.border} strokeWidth={1} />
              {bars.map((b, i) => {
                const empty = b.pct === 0;
                const h = empty ? EMPTY_BAR_HEIGHT : (b.pct / 100) * (HERO_CHART_HEIGHT - 6);
                const fill = empty ? c.bar : b.isNow ? (b.value < 0 || metric === 'expenses' ? c.destructive : c.primary) : c.bar;
                const dimmed = picked !== null && picked !== i;
                return (
                  <Rect
                    key={b.month}
                    x={i * slot + (slot - barW) / 2}
                    y={HERO_CHART_HEIGHT - h}
                    width={barW}
                    height={h}
                    rx={empty ? 1.5 : 4}
                    fill={fill}
                    opacity={(empty ? 0.45 : 1) * (dimmed ? 0.55 : 1)}
                  />
                );
              })}
            </Svg>
            <View className="absolute inset-0 flex-row">
              {bars.map((b, i) => (
                <Pressable
                  key={b.month}
                  role="button"
                  accessibilityLabel={barLabel(seriesMonthLong(b.month), metric, points[i], currency)}
                  accessibilityHint="Shows income, expenses and balance for this month"
                  accessibilityState={{ selected: selectedIndex === i }}
                  onPress={() => setPicked(picked === i || i === n - 1 ? null : i)}
                  style={{ width: slot }}
                />
              ))}
            </View>
          </>
        ) : null}
      </View>
      <View className="mt-1.5 flex-row" aria-hidden>
        {bars.map((b) => (
          <Text
            key={b.month}
            style={{ width: slot || undefined, flex: slot ? undefined : 1 }}
            className={cn('text-center text-xs', b.isNow ? 'font-semibold text-primary-text' : 'text-muted-foreground')}>
            {seriesMonthShort(b.month)}
          </Text>
        ))}
      </View>
      {/* Reserved height so choosing a month never moves what is below. */}
      <View className="mt-3 min-h-[92px] justify-center rounded-xl bg-muted/35 px-4 py-3 dark:bg-muted" accessibilityLiveRegion="polite">
        {selected ? (
          <>
            <View className="mb-1 flex-row items-baseline justify-between gap-2">
              <Text className="text-xs font-semibold">{seriesMonthLong(selected.month)}</Text>
              {picked === null && n > 1 ? <Text className="text-xs text-muted-foreground">Tap a bar for another month</Text> : null}
            </View>
            {(
              [
                ['Income', selected.income, 'text-success'],
                ['Expenses', selected.expenses, 'text-destructive'],
                ['Balance', selected.balance, 'text-foreground'],
              ] as const
            ).map(([label, value, tone]) => (
              <View key={label} className="flex-row items-center justify-between py-0.5">
                <Text className="text-xs text-muted-foreground">{label}</Text>
                <MoneyAmount amount={value} currency={currency} className={cn('text-xs font-medium', tone)} />
              </View>
            ))}
          </>
        ) : (
          <Text className="text-center text-xs text-muted-foreground">No months to show yet.</Text>
        )}
      </View>
    </View>
  );
}
