import * as React from 'react';
import { View } from 'react-native';

import { BalanceHero } from '@/components/dashboard/balance-hero';
import { DashboardSkeleton } from '@/components/dashboard/dashboard-skeleton';
import { GoalsSummary } from '@/components/dashboard/goals-summary';
import { MonthlySummaryCard } from '@/components/dashboard/monthly-summary';
import { RecentTransactions } from '@/components/dashboard/recent-transactions';
import { AssistantNudge } from '@/components/onboarding/assistant-nudge';
import { FirstTransactionPanel } from '@/components/onboarding/first-transaction-panel';
import { Setup } from '@/components/onboarding/setup';
import { DASHBOARD_RECENT_LIMIT, orderCurrencies, resolveCurrency } from '@/core/dashboard-scope';
import { pickPrimaryCurrency } from '@/core/format';
import { useAccounts } from '@/hooks/useAccounts';
import { useActiveAccount } from '@/hooks/useActiveAccount';
import { useLedgerBalance } from '@/hooks/useLedger';
import { useRecentTransactions } from '@/hooks/useSearch';
import { useAssistantNudge, useSetup } from '@/hooks/useSetup';
import { useUser } from '@/hooks/useUser';

/**
 * The dashboard's cards. Holds which account is selected and fans it out to every card; each card
 * fetches its own data scoped to that account, so switching accounts never needs a reload.
 * Phone order: hero, monthly summary, goals, recent.
 */
export function DashboardBody({ year, month }: { year: number; month: number }) {
  const { data: accounts } = useAccounts();
  const { data: user } = useUser();
  const { data: balances } = useLedgerBalance();
  const { accountId, account: selectedAccount } = useActiveAccount();
  const setup = useSetup();
  const { data: anyRecent } = useRecentTransactions(accountId ? 1 : DASHBOARD_RECENT_LIMIT);
  // Setup is over (or skipped) and there is still nothing to show: the dashboard stays a single
  // balance card whose chart gives way to the next step, and grows as things are recorded.
  const nothingRecorded = setup.status === 'off' && !!accounts?.length && anyRecent?.length === 0;
  const nudge = useAssistantNudge(setup.status === 'off' && !nothingRecorded);
  const primaryCurrency = pickPrimaryCurrency(balances, user, '', accounts);

  // The hero and the summary each keep their own currency choice; amounts never mix currencies.
  const [balancePick, setBalancePick] = React.useState<string | undefined>();
  const [summaryPick, setSummaryPick] = React.useState<string | undefined>();
  const accountCurrencies = orderCurrencies(accounts ?? [], primaryCurrency);
  const resolve = (pick?: string) => resolveCurrency({ pick, account: selectedAccount, currencies: accountCurrencies, primaryCurrency });
  const balanceCurrency = resolve(balancePick);
  const summaryCurrency = selectedAccount?.currency ?? summaryPick ?? resolve();

  if (setup.status === 'loading') return <DashboardSkeleton />;
  if (setup.status === 'step') {
    return <Setup step={setup.step} accounts={setup.accounts} skip={setup.skip} name={user?.displayName ?? undefined} />;
  }

  if (nothingRecorded) {
    return (
      <BalanceHero
        accountId={accountId}
        accountName={selectedAccount?.name}
        currency={balanceCurrency}
        onCurrencyChange={setBalancePick}
        emptyPanel={<FirstTransactionPanel />}
      />
    );
  }

  return (
    <View className="gap-6">
      {nudge.show ? <AssistantNudge onClose={nudge.close} /> : null}
      <BalanceHero accountId={accountId} accountName={selectedAccount?.name} currency={balanceCurrency} onCurrencyChange={setBalancePick} />
      <MonthlySummaryCard
        year={year}
        month={month}
        currency={summaryCurrency}
        currencies={selectedAccount ? [] : accountCurrencies}
        onCurrencyChange={setSummaryPick}
        accountId={accountId}
      />
      <GoalsSummary accountId={accountId} />
      <RecentTransactions accountId={accountId} />
    </View>
  );
}
