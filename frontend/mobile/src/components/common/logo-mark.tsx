import Svg, { G, Rect } from 'react-native-svg';

// Brand colours, the same in light and dark (the mark is always a lime tile with ink bars).
const BRAND_LIME = '#d7f205';
const BRAND_INK = '#11120d';

/**
 * MoFin's mark: the "bar M" (three bars from the balance chart, tallest last for the current month)
 * on a lime tile. Same drawing as the web's `LogoMark` and `app/icon.svg`.
 */
export function LogoMark({ size = 32 }: { size?: number }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 48 48" aria-hidden>
      <Rect width={48} height={48} rx={12} fill={BRAND_LIME} />
      <G fill={BRAND_INK}>
        <Rect x={10.5} y={18} width={7.5} height={18} rx={2.2} />
        <Rect x={20.25} y={25} width={7.5} height={11} rx={2.2} />
        <Rect x={30} y={11} width={7.5} height={25} rx={2.2} />
      </G>
    </Svg>
  );
}
