import type { BottomTabHeaderProps } from 'expo-router/js-tabs';
import { View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { AccountSwitcher } from '@/components/shell/account-switcher';
import { Text } from '@/components/ui/text';
import { useActiveAccount } from '@/hooks/useActiveAccount';

/**
 * The tab screens' header: the screen title, then (on the dashboard) the account switcher (All accounts or one account)
 * that scopes it. Large, left-aligned title on every platform so the
 * switcher always has room beside it.
 */
export function AppHeader({ options, route }: BottomTabHeaderProps) {
  const insets = useSafeAreaInsets();
  const { account, accounts, setAccountId, ready } = useActiveAccount();
  const title = typeof options.title === 'string' ? options.title : route.name;
  // Only the dashboard is scoped by the active account. Transactions has its own account filter and
  // Goals lists every goal, so a switcher there changed nothing on screen and read as a broken filter.
  const scoped = route.name === 'dashboard';
  return (
    <View
      className="flex-row items-center gap-3 border-b border-border bg-background px-4 pb-3"
      style={{ paddingTop: insets.top + 8 }}>
      <Text role="heading" aria-level={1} className="shrink text-xl font-semibold tracking-tight" numberOfLines={1}>
        {title}
      </Text>
      {scoped && ready ? (
        <View className="min-w-0 max-w-xs flex-1">
          <AccountSwitcher accounts={accounts} value={account?.id} onChange={setAccountId} />
        </View>
      ) : null}
    </View>
  );
}
