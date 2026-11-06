"use client";

import * as React from "react";
import { useAccounts } from "@/hooks/useAccounts";
import { useLedgerBalance } from "@/hooks/useLedger";
import { useRecentTransactions } from "@/hooks/useSearch";
import { useActiveAccount } from "@/hooks/useActiveAccount";
import { useUser } from "@/hooks/useUser";
import { pickPrimaryCurrency } from "@/lib/format";
import { DASHBOARD_RECENT_LIMIT, orderCurrencies, resolveCurrency } from "@/lib/dashboard-scope";
import { BalanceCards } from "@/components/dashboard/balance-cards";
import { MonthlySummaryCard } from "@/components/dashboard/monthly-summary";
import { RecentTransactions } from "@/components/dashboard/recent-transactions";
import { GoalsSummary } from "@/components/dashboard/goals-summary";
import { AssistantNudge } from "@/components/onboarding/assistant-nudge";
import { FirstTransactionPanel } from "@/components/onboarding/first-transaction-panel";
import { Setup } from "@/components/onboarding/setup";
import { useAssistantNudge, useSetup } from "@/hooks/useSetup";
import { DashboardSkeleton } from "@/components/dashboard/dashboard-skeleton";

/**
 * Holds the selected account and fans it out; each card refetches its own data for it, so switching
 * accounts never needs a page reload.
 */
export function DashboardBody({ year, month }: { year: number; month: number }) {
  const { data: accounts } = useAccounts();
  const { data: user } = useUser();
  const { data: balances } = useLedgerBalance();
  // Same selection as the header's active-account picker, so the dashboard
  // shows the account that new transactions will default to.
  const { accountId, account: selectedAccount } = useActiveAccount();
  const setup = useSetup();
  // Whether anything is recorded in any account: the All-accounts list the dashboard already
  // reads, or one row when a single account is picked.
  const { data: anyRecent } = useRecentTransactions(accountId ? 1 : DASHBOARD_RECENT_LIMIT);
  // Setup is over (or skipped) and there is still nothing to show: the dashboard stays a
  // single balance card whose chart gives way to the next step, and grows as things are recorded.
  const nothingRecorded = setup.status === "off" && !!accounts?.length && anyRecent?.length === 0;
  const nudge = useAssistantNudge(setup.status === "off" && !nothingRecorded);
  // Derived from live query data (hydrated from the server prefetch when that
  // succeeded, fetched fresh through the BFF's refresh-on-401 path when it didn't).
  const primaryCurrency = pickPrimaryCurrency(balances, user, "", accounts);

  // The balance hero and the monthly summary each keep their own currency choice. Amounts
  // never mix currencies, so an all-accounts view is shown one currency at a time.
  const [balanceCurrencyPick, setBalanceCurrencyPick] = React.useState<string | undefined>();
  const [summaryCurrencyPick, setSummaryCurrencyPick] = React.useState<string | undefined>();
  const accountCurrencies = orderCurrencies(accounts ?? [], primaryCurrency);
  const resolve = (pick?: string) =>
    resolveCurrency({ pick, account: selectedAccount, currencies: accountCurrencies, primaryCurrency });
  const balanceCurrency = resolve(balanceCurrencyPick);
  // The summary's switch also offers currencies that only have activity this month (an
  // archived account's, say), so its pick stands even when no active account holds it.
  const summaryCurrency = selectedAccount?.currency ?? summaryCurrencyPick ?? resolve();

  // A new user is walked through the first account and the first transaction in place of the
  // dashboard, which has nothing to show yet (and, with no account, nothing that can work).
  if (setup.status === "loading") return <DashboardSkeleton />;
  if (setup.status === "step") {
    return <Setup step={setup.step} accounts={setup.accounts} skip={setup.skip} name={user?.displayName ?? undefined} />;
  }

  if (nothingRecorded) {
    return (
      <section>
        <BalanceCards
          accountId={accountId}
          accountName={selectedAccount?.name}
          currency={balanceCurrency}
          onCurrencyChange={setBalanceCurrencyPick}
          emptyPanel={<FirstTransactionPanel />}
        />
      </section>
    );
  }

  return (
    <section className="space-y-8">
      {nudge.show && <AssistantNudge onClose={nudge.close} />}

      {/* Bento grid: balance hero beside Goals, Monthly Summary beside Recent Transactions; one grid so the stacked order below lg can differ from the desktop order. */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-12 lg:gap-y-8">
        <div className="order-1 lg:order-none lg:col-span-8">
          <BalanceCards
            accountId={accountId}
            accountName={selectedAccount?.name}
            currency={balanceCurrency}
            onCurrencyChange={setBalanceCurrencyPick}
          />
        </div>
        <div className="order-3 lg:order-none lg:col-span-4">
          <GoalsSummary accountId={accountId} />
        </div>
        <div className="order-2 lg:order-none lg:col-span-6">
          <MonthlySummaryCard
            year={year}
            month={month}
            currency={summaryCurrency}
            currencies={selectedAccount ? [] : accountCurrencies}
            onCurrencyChange={setSummaryCurrencyPick}
            accountId={accountId}
          />
        </div>
        {/* The Monthly Summary alone sets this row's height; on large screens the list is pinned
            to it and scrolls inside. No minimum or maximum height of its own. */}
        <div className="relative order-4 lg:order-none lg:col-span-6">
          <RecentTransactions accountId={accountId} className="lg:absolute lg:inset-0" />
        </div>
      </div>
    </section>
  );
}
