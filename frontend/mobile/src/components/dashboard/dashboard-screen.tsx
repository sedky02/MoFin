import { useQueryClient } from '@tanstack/react-query';
import { ThemedRefreshControl } from '@/components/ui/themed-native';
import { UpdateBanner } from '@/components/shell/update-banner';
import { KeyboardScrollView } from '@/components/common/keyboard-scroll-view';
import * as React from 'react';
import { View } from 'react-native';

import { DashboardBody } from '@/components/dashboard/dashboard-body';
import { currentUtcMonth } from '@/components/dashboard/dashboard-logic';
import { DashboardSkeleton } from '@/components/dashboard/dashboard-skeleton';
import { ErrorState } from '@/components/common/states';
import { useAccounts } from '@/hooks/useAccounts';
import { useActiveAccount } from '@/hooks/useActiveAccount';
import { useLedgerBalance } from '@/hooks/useLedger';
import { useUser } from '@/hooks/useUser';

/**
 * The Dashboard tab. Waits for the stored account pick (and the account list) before showing any
 * account-scoped card, so nothing flashes the wrong account first. Months are UTC, as the API counts.
 */
export function DashboardScreen() {
  const queryClient = useQueryClient();
  const { ready } = useActiveAccount();
  const accounts = useAccounts();
  const user = useUser();
  // The primary currency comes from the balances: wait for them so no card asks for the wrong one first.
  const balances = useLedgerBalance();
  const [now] = React.useState(() => new Date());
  const { year, month } = currentUtcMonth(now);
  const [refreshing, setRefreshing] = React.useState(false);

  const onRefresh = React.useCallback(async () => {
    setRefreshing(true);
    try {
      await queryClient.invalidateQueries();
    } finally {
      setRefreshing(false);
    }
  }, [queryClient]);

  const failed = (accounts.isError && !accounts.data) || (user.isError && !user.data);
  const waiting = !ready || accounts.isLoading || user.isLoading || balances.isLoading;

  return (
    <KeyboardScrollView
      className="flex-1 bg-background"
      contentContainerClassName="p-4"
      contentContainerStyle={{ paddingBottom: 24 }}
      refreshControl={<ThemedRefreshControl refreshing={refreshing} onRefresh={onRefresh} />}>
      <View className="mx-auto w-full max-w-xl">
        <UpdateBanner />
        {failed ? (
          <ErrorState
            description="Couldn't load your dashboard."
            onRetry={() => {
              void accounts.refetch();
              void user.refetch();
            }}
          />
        ) : waiting ? (
          <DashboardSkeleton />
        ) : (
          <DashboardBody year={year} month={month} />
        )}
      </View>
    </KeyboardScrollView>
  );
}
