import { dehydrate, HydrationBoundary } from "@tanstack/react-query";
import { getQueryClient } from "@/lib/query-client";
import { serverGet } from "@/lib/server-api";
import {
  ledgerKeys,
  analyticsKeys,
  searchKeys,
} from "@/lib/query-keys";
import { parseBalanceKey } from "@/lib/format";
import type { LedgerBalance, MonthlySummary, Transaction, User } from "@/lib/types";
import { BalanceCards } from "@/components/dashboard/balance-cards";
import { MonthlySummaryCard } from "@/components/dashboard/monthly-summary";
import { RecentTransactions } from "@/components/dashboard/recent-transactions";
import { PageHeader } from "@/components/common/page-header";

// All dashboard data is user-specific and dynamic — never "use cache".
//export const dynamic = "force-dynamic";

function pickPrimaryCurrency(
  balances: LedgerBalance[] | null,
  user: User | null,
): string {
  const settingCurrency = user?.settings?.defaultCurrency;
  if (typeof settingCurrency === "string" && settingCurrency) return settingCurrency;
  if (balances && balances.length) {
    // Most common currency among balances.
    const counts = new Map<string, number>();
    for (const b of balances) {
      const { currency } = parseBalanceKey(b.key);
      counts.set(currency, (counts.get(currency) ?? 0) + 1);
    }
    return [...counts.entries()].sort((a, b) => b[1] - a[1])[0][0];
  }
  return "USD";
}

export default async function DashboardPage() {
  const now = new Date();
  const year = now.getFullYear();
  const month = now.getMonth() + 1;

  const queryClient = getQueryClient();

  // Prefetch all three datasets in parallel on the server (cookies awaited inside serverGet).
  const [balances, summary, recent, user] = await Promise.all([
    serverGet<LedgerBalance[]>("/ledger/balance"),
    serverGet<MonthlySummary>("/analytics/monthly-summary", { year, month }),
    serverGet<Transaction[]>("/search/transactions", { limit: 10, offset: 0 }),
    serverGet<User>("/users/me"),
  ]);

  // Prime the cache only for successful fetches; the client refetches the rest.
  if (balances) queryClient.setQueryData(ledgerKeys.balance(undefined, undefined), balances);
  if (summary) queryClient.setQueryData(analyticsKeys.monthly(year, month), summary);
  if (recent) queryClient.setQueryData(searchKeys.list({ recent: 10 }), recent);

  const primaryCurrency = pickPrimaryCurrency(balances, user);

  return (
    <HydrationBoundary state={dehydrate(queryClient)}>
      <PageHeader
        title={greeting(user?.displayName)}
        description="Here's where your money stands today."
      />

      <section className="space-y-8">
        <BalanceCards />

        <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
          <MonthlySummaryCard year={year} month={month} currency={primaryCurrency} />
          <RecentTransactions />
        </div>
      </section>
    </HydrationBoundary>
  );
}

function greeting(name?: string | null): string {
  const first = name?.trim().split(/\s+/)[0];
  return first ? `Welcome back, ${first}` : "Welcome back";
}
