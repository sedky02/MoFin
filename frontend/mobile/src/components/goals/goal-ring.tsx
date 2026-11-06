import { useColorScheme } from 'nativewind';
import { View } from 'react-native';
import Svg, { Circle } from 'react-native-svg';

import { Text } from '@/components/ui/text';
import type { GoalTone } from '@/core/goal-standing';
import { COLORS } from '@/theme/colors';

export function toneColor(tone: GoalTone, scheme: 'light' | 'dark'): string {
  const c = COLORS[scheme];
  switch (tone) {
    case 'failed':
      return c.destructive;
    case 'behind':
      return c.warning;
    case 'achieved':
      return scheme === 'dark' ? c.primary : c['primary-text'];
    case 'cancelled':
      return c['muted-foreground'];
    default:
      return '#fb923c';
  }
}

export function GoalRing({
  ratio,
  percent,
  tone,
  overTarget = false,
  size = 60,
}: {
  ratio: number;
  percent: number;
  tone: GoalTone;
  overTarget?: boolean;
  size?: number;
}) {
  const { colorScheme } = useColorScheme();
  const color = toneColor(tone, colorScheme === 'dark' ? 'dark' : 'light');
  const stroke = Math.round(size / 12);
  const r = (size - stroke) / 2;
  const circumference = 2 * Math.PI * r;
  return (
    <View
      accessible
      role="progressbar"
      accessibilityLabel="Goal progress"
      accessibilityValue={{ min: 0, max: 100, now: Math.round(ratio), text: `${Math.round(ratio)}%${overTarget ? ', over target' : ''}` }}
      style={{ width: size, height: size }}
      className="shrink-0 items-center justify-center">
      <Svg width={size} height={size} style={{ position: 'absolute', transform: [{ rotate: '-90deg' }] }}>
        <Circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke={color} strokeOpacity={0.15} strokeWidth={stroke} />
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
      <Text style={{ fontVariant: ['tabular-nums'], color }} className="text-sm font-medium leading-none">
        {percent}%
      </Text>
    </View>
  );
}
