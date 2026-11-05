import * as React from 'react';
import { Pressable, View } from 'react-native';
import Svg, { Defs, Line, LinearGradient, Path, Polyline, Rect, Stop } from 'react-native-svg';

import { MoneyAmount } from '@/components/common/money-amount';
import { Donut } from '@/components/dashboard/donut';
import { useChartColors } from '@/components/dashboard/use-chart-colors';
import { Text } from '@/components/ui/text';
import { tryParse } from '@/core/decimal';
import { formatMoney } from '@/core/format';
import type { AiChart } from '@/core/types';
import { scaleY, weekScale } from '@/core/week';
import { haptics } from '@/lib/haptics';

const HEIGHT = 170;
const AXIS_WIDTH = 52;
/** Room above the top gridline for the value bubble. */
const TOP_ROOM = 8;
const BUBBLE_WIDTH = 132;

type Tone = AiChart['series'][number]['tone'];
type Palette = ReturnType<typeof useChartColors>;

// Lime for money in, blue for money out: they differ in lightness as well as hue, so the pair
// still reads with red-green colour blindness. The legend names them too. Same as the web.
function toneColor(c: Palette, tone: Tone): string {
  return tone === 'income' ? c['chart-1'] : tone === 'neutral' ? c.bar : c['chart-2'];
}
const DONUT_KEYS = ['chart-1', 'chart-2', 'chart-3', 'chart-4', 'chart-5', 'chart-6'] as const;

const num = (value: string | undefined) => tryParse(value ?? '0')?.toNumber() ?? 0;

/** "2026-10" -> "Oct" (with the year when the range crosses one), "2026-11-03" -> "Nov 3". */
export function axisLabel(label: string, axis: AiChart['axis'], withYear = false): string {
  if (axis === 'month' && /^\d{4}-\d{2}$/.test(label)) {
    return new Date(`${label}-01T00:00:00Z`).toLocaleDateString(undefined, {
      month: 'short',
      ...(withYear ? { year: '2-digit' } : {}),
      timeZone: 'UTC',
    });
  }
  if (axis === 'day' && /^\d{4}-\d{2}-\d{2}$/.test(label)) {
    return new Date(`${label}T00:00:00Z`).toLocaleDateString(undefined, { month: 'short', day: 'numeric', timeZone: 'UTC' });
  }
  return label;
}

/** Everything a screen reader says about the chart, label by label. */
export function chartSummary(chart: AiChart): string {
  const rows = chart.labels.map((label, i) => {
    const values = chart.series.map((s) => `${chart.series.length > 1 ? `${s.name} ` : ''}${formatMoney(s.values[i] ?? '0', chart.currency)}`);
    return `${axisLabel(label, chart.axis, true)}: ${values.join(', ')}`;
  });
  return `${chart.title}. ${rows.join('. ')}`;
}

function showLabelAt(i: number, count: number): boolean {
  const every = Math.ceil(count / 6);
  return every <= 1 || i % every === 0 || i === count - 1;
}

/**
 * A chart the assistant attached to an answer. Every number came from the ledger on the server.
 * Drawn with react-native-svg like the dashboard's week chart: tap a column for its amounts.
 */
export function AskChart({ chart }: { chart: AiChart }) {
  return (
    <View className="rounded-2xl border border-border bg-background/60 p-4">
      <View className="mb-3 flex-row items-baseline justify-between gap-3">
        <Text className="shrink text-sm font-semibold">{chart.title}</Text>
        <Text className="text-xs text-muted-foreground">{chart.currency}</Text>
      </View>
      {chart.kind === 'donut' ? <DonutChart chart={chart} /> : <SeriesChart chart={chart} />}
    </View>
  );
}

function DonutChart({ chart }: { chart: AiChart }) {
  const c = useChartColors();
  const values = chart.series[0]?.values ?? [];
  const total = values.reduce((sum, v) => sum + num(v), 0);
  const segments = chart.labels.map((_, i) => ({ value: num(values[i]), color: c[DONUT_KEYS[i % DONUT_KEYS.length]] }));
  return (
    <View className="items-center gap-4">
      <Donut
        segments={segments}
        size={150}
        thickness={16}
        accessibilityLabel={chartSummary(chart)}
        center={
          <>
            <Text className="text-[11px] text-muted-foreground">Total</Text>
            <MoneyAmount amount={String(total)} currency={chart.currency} compact className="text-base font-semibold" />
          </>
        }
      />
      <View className="w-full gap-2" aria-hidden>
        {chart.labels.map((label, i) => (
          <View key={label} className="flex-row items-center gap-2.5">
            <View className="size-2.5 rounded-sm" style={{ backgroundColor: segments[i].color }} />
            <Text numberOfLines={1} className="flex-1 text-sm text-muted-foreground">
              {label} · {total > 0 ? Math.round((segments[i].value / total) * 100) : 0}%
            </Text>
            <MoneyAmount amount={values[i] ?? '0'} currency={chart.currency} className="text-sm font-medium" />
          </View>
        ))}
      </View>
    </View>
  );
}

function SeriesChart({ chart }: { chart: AiChart }) {
  const c = useChartColors();
  const [width, setWidth] = React.useState(0);
  const [picked, setPicked] = React.useState<number | null>(null);
  const all = chart.series.flatMap((s) => s.values.map(num));
  const scale = weekScale(all);
  const plotH = HEIGHT - TOP_ROOM;
  const y = (v: number) => TOP_ROOM + scaleY(v, scale) * plotH;
  const zeroY = y(0);
  const n = chart.labels.length;
  const slot = n > 0 ? width / n : 0;
  const crossesYear = chart.axis === 'month' && new Set(chart.labels.map((l) => l.slice(0, 4))).size > 1;

  const bars = () => {
    const groups = chart.series.length;
    const groupW = Math.max(Math.min(slot - (n > 14 ? 1 : 8), 40), 2);
    const barW = groupW / groups;
    return chart.labels.flatMap((label, i) =>
      chart.series.map((s, k) => {
        const v = num(s.values[i]);
        const top = Math.min(y(v), zeroY);
        const h = Math.max(Math.abs(y(v) - zeroY), v === 0 ? 0 : 2);
        return (
          <Rect
            key={`${label}-${s.name}`}
            x={i * slot + (slot - groupW) / 2 + k * barW}
            y={top}
            width={Math.max(barW - (groups > 1 ? 1 : 0), 1)}
            height={h}
            rx={n > 14 ? 1 : 3}
            fill={toneColor(c, s.tone)}
            opacity={picked === null || picked === i ? 1 : 0.45}
          />
        );
      }),
    );
  };

  const line = () => {
    const s = chart.series[0];
    const color = toneColor(c, s?.tone ?? 'balance');
    const pts = (s?.values ?? []).map((v, i) => [i * slot + slot / 2, y(num(v))] as const);
    if (!pts.length) return null;
    const base = y(Math.max(scale.min, 0));
    const area = `M${pts[0][0]},${base} ${pts.map(([px, py]) => `L${px},${py}`).join(' ')} L${pts[pts.length - 1][0]},${base} Z`;
    return (
      <>
        <Defs>
          <LinearGradient id="askLineFill" x1="0" y1="0" x2="0" y2="1">
            <Stop offset="0" stopColor={color} stopOpacity={0.28} />
            <Stop offset="1" stopColor={color} stopOpacity={0} />
          </LinearGradient>
        </Defs>
        <Path d={area} fill="url(#askLineFill)" />
        <Polyline points={pts.map(([px, py]) => `${px},${py}`).join(' ')} fill="none" stroke={color} strokeWidth={2.25} strokeLinejoin="round" strokeLinecap="round" />
        {picked !== null && pts[picked] ? (
          <Rect x={pts[picked][0] - 4} y={pts[picked][1] - 4} width={8} height={8} rx={4} fill={color} stroke={c.card} strokeWidth={2} />
        ) : null}
      </>
    );
  };

  const pickedTop = picked === null ? 0 : Math.max(...chart.series.map((s) => num(s.values[picked])), 0);

  return (
    <View>
      {chart.series.length > 1 ? (
        <View className="mb-2 flex-row flex-wrap gap-x-4 gap-y-1" aria-hidden>
          {chart.series.map((s) => (
            <View key={s.name} className="flex-row items-center gap-1.5">
              <View className="size-2.5 rounded-sm" style={{ backgroundColor: toneColor(c, s.tone) }} />
              <Text className="text-xs text-muted-foreground">{s.name}</Text>
            </View>
          ))}
        </View>
      ) : null}
      <View className="flex-row">
        <View
          className="flex-1"
          accessible
          accessibilityRole="image"
          accessibilityLabel={chartSummary(chart)}
          onLayout={(e) => setWidth(e.nativeEvent.layout.width)}
          style={{ height: HEIGHT }}>
          {width > 0 ? (
            <>
              <Svg width={width} height={HEIGHT} aria-hidden>
                {scale.ticks.map((t) => (
                  <Line key={t} x1={0} x2={width} y1={y(t)} y2={y(t)} stroke={c.border} strokeWidth={1} strokeDasharray={t === 0 ? undefined : '3 4'} />
                ))}
                {chart.kind === 'line' ? line() : bars()}
              </Svg>
              {/* Tap targets, one column per label. Screen readers get the whole chart above. */}
              <View className="absolute inset-0 flex-row" importantForAccessibility="no-hide-descendants">
                {chart.labels.map((label, i) => (
                  <Pressable
                    key={label}
                    accessible={false}
                    onPress={() => {
                      haptics.tap();
                      setPicked(picked === i ? null : i);
                    }}
                    style={{ width: slot }}
                  />
                ))}
              </View>
              {picked !== null ? (
                <View
                  pointerEvents="none"
                  className="absolute rounded-xl bg-popover px-2.5 py-1.5 shadow-sm shadow-black/20"
                  style={{
                    // Centred on the column, kept inside the chart at the edges.
                    left: Math.min(Math.max(picked * slot + slot / 2 - BUBBLE_WIDTH / 2, 0), Math.max(width - BUBBLE_WIDTH, 0)),
                    width: BUBBLE_WIDTH,
                    top: Math.max(y(pickedTop) - 22 - chart.series.length * 16, 0),
                  }}>
                  <Text className="text-[11px] font-medium text-muted-foreground">{axisLabel(chart.labels[picked], chart.axis, true)}</Text>
                  {chart.series.map((s) => (
                    <View key={s.name} className="flex-row items-center gap-1.5">
                      {chart.series.length > 1 ? <View className="size-2 rounded-sm" style={{ backgroundColor: toneColor(c, s.tone) }} /> : null}
                      <MoneyAmount amount={s.values[picked] ?? '0'} currency={chart.currency} numberOfLines={1} className="text-[11px] font-semibold text-foreground" />
                    </View>
                  ))}
                </View>
              ) : null}
            </>
          ) : null}
        </View>
        <View aria-hidden style={{ width: AXIS_WIDTH, height: HEIGHT }}>
          {scale.ticks.map((t) => (
            <View key={t} className="absolute right-0" style={{ top: y(t) - 8 }}>
              <MoneyAmount amount={String(t)} currency={chart.currency} compact className="text-[10px] text-muted-foreground" />
            </View>
          ))}
        </View>
      </View>
      <View className="mt-1.5 flex-row" aria-hidden style={{ paddingRight: AXIS_WIDTH }}>
        {chart.labels.map((label, i) => (
          <Text key={label} numberOfLines={1} style={{ width: slot || undefined, flex: slot ? undefined : 1 }} className="text-center text-[10px] text-muted-foreground">
            {showLabelAt(i, n) ? axisLabel(label, chart.axis, crossesYear) : ''}
          </Text>
        ))}
      </View>
    </View>
  );
}
