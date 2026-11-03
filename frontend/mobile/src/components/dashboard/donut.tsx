import * as React from 'react';
import { View } from 'react-native';
import Svg, { Circle } from 'react-native-svg';

import { donutArcs } from '@/components/dashboard/dashboard-logic';
import { useChartColors } from '@/components/dashboard/use-chart-colors';

export interface DonutSegment {
  value: number;
  color: string;
}

/** A ring split into arcs (stroke dashes), with `center` content over the hole. */
export function Donut({
  segments,
  size = 176,
  thickness = 20,
  center,
  accessibilityLabel,
}: {
  segments: DonutSegment[];
  size?: number;
  thickness?: number;
  center?: React.ReactNode;
  accessibilityLabel: string;
}) {
  const c = useChartColors();
  const r = (size - thickness) / 2;
  const circumference = 2 * Math.PI * r;
  const arcs = donutArcs(
    segments.map((s) => s.value),
    circumference,
  );
  return (
    <View accessible accessibilityRole="image" accessibilityLabel={accessibilityLabel} style={{ width: size, height: size }}>
      <Svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} style={{ transform: [{ rotate: '-90deg' }] }}>
        <Circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke={c.muted} strokeWidth={thickness} />
        {arcs.map((a, i) => (
          <Circle
            key={i}
            cx={size / 2}
            cy={size / 2}
            r={r}
            fill="none"
            stroke={segments[i].color}
            strokeWidth={thickness}
            strokeDasharray={`${a.dash} ${a.gap}`}
            strokeDashoffset={a.offset}
          />
        ))}
      </Svg>
      {center ? (
        <View pointerEvents="none" className="absolute inset-0 items-center justify-center px-8">
          {center}
        </View>
      ) : null}
    </View>
  );
}
