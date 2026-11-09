import { useColorScheme } from 'nativewind';

import { COLORS } from '@/theme/colors';

/**
 * The placeholder colour for the scheme in use, as a plain prop. A placeholderClassName is turned
 * into Android's hint colour once, at mount: after the app switches from the phone's mode to the
 * saved one at launch, it kept the old one (near-white on white). This re-renders on every switch.
 */
export function usePlaceholderColor(opacity = 0.7): string {
  const { colorScheme } = useColorScheme();
  const hex = COLORS[colorScheme === 'dark' ? 'dark' : 'light']['muted-foreground'];
  const alpha = Math.round(Math.min(1, Math.max(0, opacity)) * 255)
    .toString(16)
    .padStart(2, '0');
  return `${hex}${alpha}`;
}
