"use client";

import * as React from "react";
import { useAccounts } from "@/hooks/useAccounts";
import { useLedgerBalance } from "@/hooks/useLedger";
import { useUser } from "@/hooks/useUser";
import { pickPrimaryCurrency } from "@/lib/format";
import { AccountSwitcher } from "@/components/dashboard/account-switcher";
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
  const [accountId, setAccountId] = React.useState<string | undefined>(
    undefined,
  );
  const selectedAccount = accounts?.find((a) => a.id === accountId);
  // Re-derived from live query data (hydrated from the server prefetch when
  // that succeeded, fetched fresh through the BFF's refresh-on-401 path when
  // it didn't) so a guessed currency is never the final answer — it
  // self-corrects the moment real data arrives.
  const primaryCurrency = pickPrimaryCurrency(balances, user, initialPrimaryCurrency);
  const currency = selectedAccount?.currency ?? primaryCurrency;

  return (
    <section className="space-y-8">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-sm text-muted-foreground">
          {accountId
            ? `Showing data for ${selectedAccount?.name ?? "this account"}.`
            : "Showing data across all accounts."}
        </p>
        <AccountSwitcher
          accounts={accounts ?? []}
          value={accountId}
          onChange={setAccountId}
        />
      </div>

      {/* Bento grid, matching the Stitch "Refined Quanto Dark" layout: a large
          balance hero paired with Goals, then Monthly Summary paired with
          Recent Transactions. */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
        <div className="lg:col-span-8">
          <BalanceCards accountId={accountId} accountName={selectedAccount?.name} />
        </div>
        <div className="lg:col-span-4">
          <GoalsSummary accountId={accountId} />
        </div>
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <MonthlySummaryCard
          year={year}
          month={month}
          currency={currency}
          accountId={accountId}
        />
        <RecentTransactions accountId={accountId} />
      </div>
    </section>
  );
}
