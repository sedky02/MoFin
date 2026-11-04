import type { NativeStackNavigationOptions } from 'expo-router';
import { useColorScheme } from 'nativewind';

import { COLORS } from '@/theme/colors';

/** Header look for the stack screens: the palette's colors and the app font, a back button without a label. */
export function useStackScreenOptions(): NativeStackNavigationOptions {
  const { colorScheme } = useColorScheme();
  const c = COLORS[colorScheme === 'dark' ? 'dark' : 'light'];
  return {
    headerStyle: { backgroundColor: c.background },
    headerTintColor: c.foreground,
    headerTitleStyle: { fontFamily: 'Inter_600SemiBold', color: c.foreground },
    headerShadowVisible: false,
    headerBackButtonDisplayMode: 'minimal',
    contentStyle: { backgroundColor: c.background },
    // Screens under the top one don't re-render while covered (see the tabs layout).
    freezeOnBlur: true,
  };
}
