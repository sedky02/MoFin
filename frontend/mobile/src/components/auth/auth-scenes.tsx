import { useColorScheme } from 'nativewind';
import Svg, { Circle, G, Path, Rect } from 'react-native-svg';

import { COLORS } from '@/theme/colors';

const LIME = '#d7f205';
const INK = '#11120d';

/** A letter on its way, so the result screen has more than a lone icon. Each piece is its own element. */
export function AuthMailScene({ width = 168 }: { width?: number }) {
  const { colorScheme } = useColorScheme();
  const c = COLORS[colorScheme === 'dark' ? 'dark' : 'light'];
  return (
    <Svg width={width} height={(width * 140) / 200} viewBox="0 0 200 140" role="img" aria-label="A message on its way">
      <Circle cx={100} cy={70} r={54} fill={c.primary} fillOpacity={0.15} />
      <Path
        d="M30 60h20M24 72h28M32 84h18"
        fill="none"
        stroke={c.foreground}
        strokeOpacity={0.22}
        strokeWidth={3}
        strokeLinecap="round"
      />
      <Rect x={68} y={52} width={66} height={46} rx={9} fill={c.card} stroke={c.foreground} strokeWidth={3} />
      <Path d="M71 58l30 23 30-23" fill="none" stroke={c.foreground} strokeWidth={3} strokeLinecap="round" strokeLinejoin="round" />
      <Circle cx={134} cy={52} r={14} fill={LIME} />
      <Path d="M127.5 52l4.5 4.5 8-9.5" fill="none" stroke={INK} strokeWidth={3.2} strokeLinecap="round" strokeLinejoin="round" />
      <G>
        <Circle cx={160} cy={98} r={3.4} fill={LIME} />
        <Circle cx={46} cy={38} r={2.8} fill={c['primary-text']} />
        <Rect x={150} y={30} width={8} height={4} rx={1} fill={c.foreground} rotation={35} originX={154} originY={32} />
        <Path d="M156 112q3-5 6 0t6 0" fill="none" stroke={c['primary-text']} strokeWidth={2.2} strokeLinecap="round" />
      </G>
    </Svg>
  );
}
