"use client";

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
  const currency = selectedAccount?.currency ?? primaryCurrency;
  const mixedCurrencies = new Set((accounts ?? []).map((a) => a.currency)).size > 1;

  return (
    <section className="space-y-8">
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
          mixedCurrencies={mixedCurrencies}
        />
        {/* The Monthly Summary sets this row's height; the list is pinned to it and scrolls
            inside. Stacked on small screens it simply gets a capped height. */}
        <div className="relative min-h-[26rem]">
          <RecentTransactions accountId={accountId} className="max-h-[32rem] lg:absolute lg:inset-0 lg:max-h-none" />
        </div>
      </div>
    </section>
  );
}
