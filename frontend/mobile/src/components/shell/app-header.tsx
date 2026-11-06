import type { BottomTabHeaderProps } from 'expo-router/js-tabs';
import { router } from 'expo-router';
import { useColorScheme } from 'nativewind';
import { Pressable, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { HeaderIconButton } from '@/components/shell/header-bar';
import { Text } from '@/components/ui/text';
import { setThemePreference } from '@/hooks/use-theme-preference';
import { haptics } from '@/lib/haptics';
import { Moon, Settings, Sun } from '@/lib/icons';

/**
 * The tab bar already names the screen, so this carries the wordmark (the heading for screen
 * readers) plus light/dark and Settings. The dashboard's account choice lives in `AccountChips`.
 */
export function AppHeader({ options, route }: BottomTabHeaderProps) {
  const insets = useSafeAreaInsets();
  const { colorScheme } = useColorScheme();
  const title = typeof options.title === 'string' ? options.title : route.name;
  const dark = colorScheme === 'dark';
  return (
    <View
      className="min-h-14 flex-row items-center gap-2 border-b border-border bg-background px-4 pb-2.5"
      style={{ paddingTop: insets.top + 10 }}>
      {/* The wordmark goes home, as on most apps. */}
      <Pressable
        role="link"
        accessibilityHint="Go to the dashboard"
        hitSlop={8}
        onPress={() => router.navigate('/dashboard')}
        className="min-h-11 justify-center active:opacity-70">
        <Text role="heading" aria-level={1} accessibilityLabel={title} className="text-lg font-bold tracking-tight">
          Mo<Text className="text-lg font-bold tracking-tight text-primary-text">Fin</Text>
        </Text>
      </Pressable>
      <View className="min-w-0 flex-1 flex-row items-center justify-end gap-2">
        <HeaderIconButton
          icon={dark ? Sun : Moon}
          accessibilityLabel={dark ? 'Switch to light mode' : 'Switch to dark mode'}
          onPress={() => {
            haptics.tap();
            setThemePreference(dark ? 'light' : 'dark');
          }}
        />
        <HeaderIconButton icon={Settings} accessibilityLabel="Settings" onPress={() => router.push('/settings')} />
      </View>
    </View>
  );
}
