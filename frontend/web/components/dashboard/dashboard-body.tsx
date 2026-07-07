"use client";

import * as React from "react";
import { useAccounts } from "@/hooks/useAccounts";
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
  primaryCurrency,
}: {
  year: number;
  month: number;
  primaryCurrency: string;
}) {
  const { data: accounts } = useAccounts();
  const [accountId, setAccountId] = React.useState<string | undefined>(
    undefined,
  );
  const selectedAccount = accounts?.find((a) => a.id === accountId);
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

      <BalanceCards accountId={accountId} accountName={selectedAccount?.name} />

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <MonthlySummaryCard
          year={year}
          month={month}
          currency={currency}
          accountId={accountId}
        />
        <GoalsSummary accountId={accountId} />
      </div>

      <RecentTransactions accountId={accountId} />
    </section>
  );
}
