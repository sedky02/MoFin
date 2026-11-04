import type { BottomTabHeaderProps } from 'expo-router/js-tabs';
import { router } from 'expo-router';
import { useColorScheme } from 'nativewind';
import { View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { AccountSwitcher } from '@/components/shell/account-switcher';
import { HeaderIconButton } from '@/components/shell/header-bar';
import { Text } from '@/components/ui/text';
import { useActiveAccount } from '@/hooks/useActiveAccount';
import { setThemePreference } from '@/hooks/use-theme-preference';
import { haptics } from '@/lib/haptics';
import { Moon, Settings, Sun } from '@/lib/icons';

/**
 * The tab screens' top bar. The tab bar already names the screen, so instead of a title it carries
 * the wordmark (which is the screen's heading for screen readers), the account switcher on the
 * dashboard (the one screen it scopes), and the two things people reach for from anywhere: the
 * light/dark switch and Settings.
 */
export function AppHeader({ options, route }: BottomTabHeaderProps) {
  const insets = useSafeAreaInsets();
  const { colorScheme } = useColorScheme();
  const { account, accounts, setAccountId, ready } = useActiveAccount();
  const title = typeof options.title === 'string' ? options.title : route.name;
  const dark = colorScheme === 'dark';
  // Only the dashboard is scoped by the active account. Transactions has its own account filter and
  // Goals lists every goal, so a switcher there changed nothing on screen and read as a broken filter.
  const scoped = route.name === 'dashboard';
  return (
    <View
      className="min-h-14 flex-row items-center gap-2 border-b border-border bg-background px-4 pb-2.5"
      style={{ paddingTop: insets.top + 10 }}>
      <Text role="heading" aria-level={1} accessibilityLabel={title} className="text-lg font-bold tracking-tight">
        Mo<Text className="text-lg font-bold tracking-tight text-primary-text">Fin</Text>
      </Text>
      <View className="min-w-0 flex-1 flex-row items-center justify-end gap-2">
        {scoped && ready ? (
          <View className="min-w-0 max-w-[200px] flex-1">
            <AccountSwitcher accounts={accounts} value={account?.id} onChange={setAccountId} />
          </View>
        ) : null}
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
