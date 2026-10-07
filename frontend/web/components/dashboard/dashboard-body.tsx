"use client";

import * as React from "react";
import { useAccounts } from "@/hooks/useAccounts";
import { useLedgerBalance } from "@/hooks/useLedger";
import { useActiveAccount } from "@/hooks/useActiveAccount";
import { useUser } from "@/hooks/useUser";
import { pickPrimaryCurrency } from "@/lib/format";
import { BalanceCards } from "@/components/dashboard/balance-cards";
import { MonthlySummaryCard } from "@/components/dashboard/monthly-summary";
import { RecentTransactions } from "@/components/dashboard/recent-transactions";
import { GoalsSummary } from "@/components/dashboard/goals-summary";

/**
 * Client-driven body below the (server-rendered) greeting header. Holds which
 * account is selected and fans it out to every card — each card refetches its
 * own data scoped to that account via its existing hook, so switching accounts
 * never needs a full page reload.
 */
export function DashboardBody({
  year,
  month,
  initialPrimaryCurrency,
}: {
  year: number;
  month: number;
  initialPrimaryCurrency: string;
}) {
  const { data: accounts } = useAccounts();
  const { data: user } = useUser();
  const { data: balances } = useLedgerBalance();
  // Same selection as the header's active-account picker, so the dashboard
  // shows the account that new transactions will default to.
  const { accountId, account: selectedAccount } = useActiveAccount();
  // Re-derived from live query data (hydrated from the server prefetch when
  // that succeeded, fetched fresh through the BFF's refresh-on-401 path when
  // it didn't) so a guessed currency is never the final answer — it
  // self-corrects the moment real data arrives.
  const primaryCurrency = pickPrimaryCurrency(balances, user, initialPrimaryCurrency);

  // The balance hero and the monthly summary each keep their own currency choice. Amounts
  // never mix currencies, so an all-accounts view is shown one currency at a time.
  const [balanceCurrencyPick, setBalanceCurrencyPick] = React.useState<string | undefined>();
  const [summaryCurrencyPick, setSummaryCurrencyPick] = React.useState<string | undefined>();
  const accountCurrencies = [...new Set((accounts ?? []).map((a) => a.currency))].sort(
    (a, b) => Number(b === primaryCurrency) - Number(a === primaryCurrency),
  );
  const resolveCurrency = (pick?: string) =>
    selectedAccount?.currency ??
    (pick && accountCurrencies.includes(pick) ? pick : undefined) ??
    (accountCurrencies.includes(primaryCurrency) ? primaryCurrency : accountCurrencies[0]) ??
    primaryCurrency;
  const balanceCurrency = resolveCurrency(balanceCurrencyPick);
  const summaryCurrency = resolveCurrency(summaryCurrencyPick);

  return (
    <section className="space-y-8">
      {/* Bento grid, matching the Stitch "Refined Quanto Dark" layout: a large
          balance hero paired with Goals, then Monthly Summary paired with
          Recent Transactions. */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
        <div className="lg:col-span-8">
          <BalanceCards
            accountId={accountId}
            accountName={selectedAccount?.name}
            currency={balanceCurrency}
            onCurrencyChange={setBalanceCurrencyPick}
          />
        </div>
        <div className="lg:col-span-4">
          <GoalsSummary accountId={accountId} />
        </div>
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <MonthlySummaryCard
          year={year}
          month={month}
          currency={summaryCurrency}
          currencies={selectedAccount ? [] : accountCurrencies}
          onCurrencyChange={setSummaryCurrencyPick}
          accountId={accountId}
        />
        {/* The Monthly Summary alone sets this row's height; on large screens the list is pinned
            to it and scrolls inside. No minimum or maximum height of its own. */}
        <div className="relative">
          <RecentTransactions accountId={accountId} className="lg:absolute lg:inset-0" />
        </div>
      </div>
    </section>
  );
}
