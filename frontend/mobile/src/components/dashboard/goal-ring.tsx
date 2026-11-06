import { View } from 'react-native';
import Svg, { Circle } from 'react-native-svg';

import { useChartColors } from '@/components/dashboard/use-chart-colors';
import { Text } from '@/components/ui/text';
import type { GoalTone } from '@/core/goal-standing';

export function GoalRing({
  ratio,
  percent,
  tone,
  overTarget = false,
  size = 48,
}: {
  ratio: number;
  percent: number;
  tone: GoalTone;
  overTarget?: boolean;
  size?: number;
}) {
  const c = useChartColors();
  const stroke = Math.round(size / 12);
  const r = (size - stroke) / 2;
  const circumference = 2 * Math.PI * r;
  const color =
    tone === 'failed' ? c.destructive : tone === 'behind' ? c.warning : tone === 'achieved' ? c.primary : tone === 'cancelled' ? c['muted-foreground'] : '#fb923c';
  return (
    <View
      accessible
      role="progressbar"
      accessibilityLabel="Goal progress"
      accessibilityValue={{ min: 0, max: 100, now: Math.round(ratio), text: `${Math.round(ratio)}%${overTarget ? ', over target' : ''}` }}
      style={{ width: size, height: size }}
      className="items-center justify-center">
      <Svg width={size} height={size} style={{ position: 'absolute', transform: [{ rotate: '-90deg' }] }}>
        <Circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke={color} strokeOpacity={0.18} strokeWidth={stroke} />
        <Circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke={color}
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={circumference * (1 - Math.min(100, Math.max(0, ratio)) / 100)}
        />
      </Svg>
      <Text style={{ fontVariant: ['tabular-nums'], fontSize: 11 }} className="font-medium leading-none">
        {percent}%
      </Text>
    </View>
  );
}
