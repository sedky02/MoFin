import * as React from 'react';
import { Pressable, View } from 'react-native';
import Svg, { Line, Rect } from 'react-native-svg';

import { MoneyAmount } from '@/components/common/money-amount';
import { useChartColors } from '@/components/dashboard/use-chart-colors';
import { Text } from '@/components/ui/text';
import { tryParse } from '@/core/decimal';
import { formatMoney } from '@/core/format';
import type { HeroMetric } from '@/core/hero-headline';
import type { DailySeriesPoint } from '@/core/types';
import { dayLong, dayShort, scaleY, weekScale } from '@/core/week';
import { haptics } from '@/lib/haptics';
import { cn } from '@/lib/utils';

export const WEEK_CHART_HEIGHT = 170;
const AXIS_WIDTH = 56;
const TOP_ROOM = 26;
const BUBBLE_HEIGHT = 22;
const BUBBLE_WIDTH = 120;

export function dayLabel(p: DailySeriesPoint, currency: string): string {
  return `${dayLong(p.date)}: income ${formatMoney(p.income, currency)}, expenses ${formatMoney(p.expenses, currency)}, balance ${formatMoney(p.balance, currency)}`;
}

/**
 * Seven bars Monday to Sunday over gridlines, y-axis on the right; bars grow from zero (down when
 * negative). Tap a bar for its exact amount, tap again to hide it; days ahead have no bar.
 */
export function WeekChart({
  points,
  metric,
  currency,
  today,
}: {
  points: DailySeriesPoint[];
  metric: HeroMetric;
  currency: string;
  today: string;
}) {
  const c = useChartColors();
  const [width, setWidth] = React.useState(0);
  const [picked, setPicked] = React.useState<string | null>(null);

  const values = points.map((p) => (p.date > today ? 0 : (tryParse(p[metric])?.toNumber() ?? 0)));
  const scale = weekScale(values);
  const plotH = WEEK_CHART_HEIGHT - TOP_ROOM;
  const y = (v: number) => TOP_ROOM + scaleY(v, scale) * plotH;
  const zeroY = y(0);
  const n = points.length;
  const slot = n > 0 ? width / n : 0;
  const barW = Math.max(Math.min(slot - 14, 34), 4);
  const pickedIndex = points.findIndex((p) => p.date === picked && p.date <= today);

  return (
    <View>
      <View className="flex-row">
        <View
          className="flex-1"
          accessible={false}
          accessibilityLabel={`Week chart. ${points.filter((p) => p.date <= today).map((p) => dayLabel(p, currency)).join('. ')}`}
          onLayout={(e) => setWidth(e.nativeEvent.layout.width)}
          style={{ height: WEEK_CHART_HEIGHT }}>
          {width > 0 ? (
            <>
              <Svg width={width} height={WEEK_CHART_HEIGHT} aria-hidden>
                {scale.ticks.map((t) => (
                  <Line
                    key={t}
                    x1={0}
                    x2={width}
                    y1={y(t)}
                    y2={y(t)}
                    stroke={c.border}
                    strokeWidth={1}
                    strokeDasharray={t === 0 ? undefined : '3 4'}
                  />
                ))}
                {points.map((p, i) => {
                  if (p.date > today) return null;
                  const v = values[i];
                  const top = Math.min(y(v), zeroY);
                  const h = Math.max(Math.abs(y(v) - zeroY), v === 0 ? 0 : 2);
                  const strong = v < 0 || metric === 'expenses' ? c.destructive : c.primary;
                  const lit = p.date === today || i === pickedIndex;
                  return (
                    <Rect
                      key={p.date}
                      x={i * slot + (slot - barW) / 2}
                      y={top}
                      width={barW}
                      height={h}
                      rx={5}
                      fill={lit ? strong : c.bar}
                      opacity={lit ? 1 : 0.75}
                    />
                  );
                })}
              </Svg>
              {/* Tap targets, one column per day. */}
              <View className="absolute inset-0 flex-row">
                {points.map((p, i) => (
                  <Pressable
                    key={p.date}
                    role="button"
                    disabled={p.date > today}
                    accessibilityLabel={p.date > today ? `${dayLong(p.date)}: not yet` : dayLabel(p, currency)}
                    accessibilityState={{ selected: i === pickedIndex, disabled: p.date > today }}
                    onPress={() => {
                      haptics.tap();
                      setPicked(picked === p.date ? null : p.date);
                    }}
                    style={{ width: slot }}
                  />
                ))}
              </View>
              {/* The chosen bar's exact amount, just above it (below a negative bar). */}
              {pickedIndex >= 0 ? (
                <View
                  pointerEvents="none"
                  accessibilityLiveRegion="polite"
                  className="absolute items-center"
                  style={{
                    // Centred on the bar, kept inside the chart at the edges.
                    left: Math.min(Math.max(pickedIndex * slot + slot / 2 - BUBBLE_WIDTH / 2, 0), width - BUBBLE_WIDTH),
                    width: BUBBLE_WIDTH,
                    top:
                      values[pickedIndex] < 0
                        ? Math.min(y(values[pickedIndex]) + 4, WEEK_CHART_HEIGHT - BUBBLE_HEIGHT)
                        : Math.max(y(values[pickedIndex]) - BUBBLE_HEIGHT - 4, 0),
                  }}>
                  <View className="rounded-full bg-popover px-2 py-0.5 shadow-sm shadow-black/20" style={{ height: BUBBLE_HEIGHT, justifyContent: 'center' }}>
                    <MoneyAmount amount={points[pickedIndex][metric]} currency={currency} className="text-[11px] font-semibold text-foreground" numberOfLines={1} />
                  </View>
                </View>
              ) : null}
            </>
          ) : null}
        </View>
        {/* Y axis: the amount at each gridline. */}
        <View aria-hidden style={{ width: AXIS_WIDTH, height: WEEK_CHART_HEIGHT }}>
          {scale.ticks.map((t) => (
            <View key={t} className="absolute right-0" style={{ top: y(t) - 8 }}>
              <MoneyAmount amount={String(t)} currency={currency} compact className="text-[10px] text-muted-foreground" />
            </View>
          ))}
        </View>
      </View>
      <View className="mt-1.5 flex-row" aria-hidden style={{ paddingRight: AXIS_WIDTH }}>
        {points.map((p, i) => (
          <Text
            key={p.date}
            style={{ width: slot || undefined, flex: slot ? undefined : 1 }}
            className={cn(
              'text-center text-xs',
              p.date === today || i === pickedIndex ? 'font-semibold text-primary-text' : p.date > today ? 'text-muted-foreground/50' : 'text-muted-foreground',
            )}>
            {dayShort(p.date)}
          </Text>
        ))}
      </View>
    </View>
  );
}
