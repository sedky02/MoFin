"use client";

import * as React from "react";
import { useAccounts } from "@/hooks/useAccounts";
import { useLedgerBalance } from "@/hooks/useLedger";
import { useActiveAccount } from "@/hooks/useActiveAccount";
import { useUser } from "@/hooks/useUser";
import { pickPrimaryCurrency } from "@/lib/format";
import { orderCurrencies, resolveCurrency } from "@/lib/dashboard-scope";
import { BalanceCards } from "@/components/dashboard/balance-cards";
import { MonthlySummaryCard } from "@/components/dashboard/monthly-summary";
import { RecentTransactions } from "@/components/dashboard/recent-transactions";
import { GoalsSummary } from "@/components/dashboard/goals-summary";
import { EmptyState } from "@/components/common/states";
import { Button } from "@/components/ui/button";
import { Wallet } from "lucide-react";
import Link from "next/link";

/**
 * The dashboard's cards, rendered from the query cache. Holds which
 * account is selected and fans it out to every card — each card refetches its
 * own data scoped to that account via its existing hook, so switching accounts
 * never needs a full page reload.
 */
export function DashboardBody({ year, month }: { year: number; month: number }) {
  const { data: accounts } = useAccounts();
  const { data: user } = useUser();
  const { data: balances } = useLedgerBalance();
  // Same selection as the header's active-account picker, so the dashboard
  // shows the account that new transactions will default to.
  const { accountId, account: selectedAccount } = useActiveAccount();
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

  // No account yet: nothing below can work (no balance, no summary, no transaction to
  // record), so the page offers the one step that does.
  if (accounts && accounts.length === 0) {
    return (
      <EmptyState
        icon={Wallet}
        title="Welcome to MoFin"
        description="Add an account to start tracking your balances, then record your first transaction."
        action={
          <Button asChild>
            <Link href="/accounts">Add your first account</Link>
          </Button>
        }
        className="py-20"
      />
    );
  }

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
