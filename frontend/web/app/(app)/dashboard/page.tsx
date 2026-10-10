import { Suspense } from "react";
import { cookies } from "next/headers";
import { connection } from "next/server";
import { dehydrate, HydrationBoundary } from "@tanstack/react-query";
import { getQueryClient } from "@/lib/query-client";
import { serverGet } from "@/lib/server-api";
import {
  accountKeys,
  ledgerKeys,
  analyticsKeys,
  searchKeys,
  userKeys,
} from "@/lib/query-keys";
import { parseBalanceKey, pickPrimaryCurrency } from "@/lib/format";
import {
  ACTIVE_ACCOUNT_COOKIE,
  DASHBOARD_RECENT_LIMIT,
  orderCurrencies,
  resolveActiveAccount,
  resolveCurrency,
  summaryApiCurrency,
} from "@/lib/dashboard-scope";
import type {
  Account,
  LedgerBalance,
  MonthlySeries,
  MonthlySummary,
  Paginated,
  Transaction,
  User,
} from "@/lib/types";
import { DashboardBody } from "@/components/dashboard/dashboard-body";
import { Skeleton } from "@/components/ui/skeleton";

// Static shell. The dynamic, user-specific dashboard streams in via <Suspense>
// (required under cacheComponents: runtime data access — cookies in serverGet,
// new Date() — must live inside a Suspense boundary, not at the route top level).
export default function DashboardPage() {
  return (
    <Suspense fallback={<DashboardSkeleton />}>
      <DashboardContent />
    </Suspense>
  );
}

// Async Server Component performing the (dynamic) server-side prefetch.
async function DashboardContent() {
  const queryClient = getQueryClient();

  // Reading the current time requires a request-data source first under
  // cacheComponents; connection() opts this render out of prerendering.
  await connection();
  const now = new Date();
  const year = now.getFullYear();
  const month = now.getMonth() + 1;

  // The account the user last picked in the header lives in a cookie (mirrored from
  // localStorage by useActiveAccount), so the server can prefetch for the account the
  // client will actually render instead of priming keys nobody reads.
  const cookieStore = await cookies();
  const rawStored = cookieStore.get(ACTIVE_ACCOUNT_COOKIE)?.value;
  const stored = rawStored ? decodeURIComponent(rawStored) : undefined;

  // First round: who the user is and which accounts they have decide the scope.
  const [user, accountsPage] = await Promise.all([
    serverGet<User>("/users/me"),
    serverGet<Paginated<Account>>("/accounts", { status: "active", limit: 100, offset: 0 }),
  ]);
  const accounts = accountsPage?.data ?? [];
  const activeAccount = resolveActiveAccount(stored, accounts, user?.settings?.mainAccountId);
  const accountId = activeAccount?.id;

  // Second round, in parallel. The all-accounts balances are always needed (they decide the
  // primary currency); the scoped ones are the same request when "All accounts" is active.
  const [allBalances, scopedBalances, recent] = await Promise.all([
    serverGet<LedgerBalance[]>("/ledger/balance"),
    accountId ? serverGet<LedgerBalance[]>("/ledger/balance", { accountId }) : undefined,
    serverGet<Paginated<Transaction>>("/search/transactions", {
      limit: DASHBOARD_RECENT_LIMIT,
      offset: 0,
      accountId,
    }),
  ]);
  const balances = accountId ? scopedBalances : allBalances;

  // Best-guess only for the very first paint (and only when prefetch actually
  // had data to guess from) — DashboardBody re-derives this from live
  // useUser()/useLedgerBalance() query data and self-corrects once that
  // resolves, rather than ever showing this guess as a final answer.
  const initialPrimaryCurrency = pickPrimaryCurrency(allBalances, user);

  // Mirror the client's currency resolution (DashboardBody / BalanceCards) so the summary
  // and the chart series are requested with the same parameters the client will use.
  const currencies = orderCurrencies(accounts, initialPrimaryCurrency);
  const currency = resolveCurrency({
    account: activeAccount,
    currencies,
    primaryCurrency: initialPrimaryCurrency,
  });
  const heroCurrencies = orderCurrencies(
    (balances ?? []).map((b) => ({ currency: parseBalanceKey(b.key).currency })),
    initialPrimaryCurrency,
  );
  const heroCurrency = heroCurrencies.includes(currency) ? currency : (heroCurrencies[0] ?? currency);

  const [summary, series] = await Promise.all([
    serverGet<MonthlySummary>("/analytics/monthly-summary", {
      year,
      month,
      accountId,
      currency: summaryApiCurrency(accountId, activeAccount ? [] : currencies, currency),
    }),
    heroCurrencies.length
      ? serverGet<MonthlySeries>("/analytics/monthly-series", { currency: heroCurrency, months: 6, accountId })
      : null,
  ]);

  // Prime the cache only for successful fetches; the client refetches the rest.
  // The hooks unwrap paginated envelopes to flat arrays before they reach components, so
  // the primed cache must have that same shape (mirroring it avoids `.map is not a
  // function` on hydrate).
  if (user) queryClient.setQueryData(userKeys.me, user);
  if (accountsPage) queryClient.setQueryData(accountKeys.list("active"), accountsPage.data);
  if (allBalances) queryClient.setQueryData(ledgerKeys.balance(undefined, undefined), allBalances);
  if (accountId && scopedBalances) queryClient.setQueryData(ledgerKeys.balance(accountId, undefined), scopedBalances);
  if (summary) {
    queryClient.setQueryData(
      analyticsKeys.monthly(year, month, accountId, summaryApiCurrency(accountId, activeAccount ? [] : currencies, currency)),
      summary,
    );
  }
  if (series) queryClient.setQueryData(analyticsKeys.series(heroCurrency, 6, accountId), series);
  if (recent) {
    queryClient.setQueryData(searchKeys.list({ recent: DASHBOARD_RECENT_LIMIT, accountId }), recent.data);
  }

  return (
    <HydrationBoundary state={dehydrate(queryClient)}>
      {/* <PageHeader
        title={greeting(user?.displayName)}
        description="Here's where your money stands today."
      /> */}

      <DashboardBody
        year={year}
        month={month}
        initialPrimaryCurrency={initialPrimaryCurrency}
        initialActiveAccount={stored}
      />
    </HydrationBoundary>
  );
}

// Mirrors the real layout (hero + goals, then summary + transactions) so nothing jumps
// when the streamed content arrives: same grid, same radii, comparable heights.
function DashboardSkeleton() {
  return (
    <>
      <div className="mb-8 space-y-2">
        <Skeleton className="h-8 w-64" />
        <Skeleton className="h-4 w-72" />
      </div>

      <section className="space-y-8">
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
          <Skeleton className="h-104 w-full rounded-hero lg:col-span-8" />
          <Skeleton className="h-104 w-full rounded-card lg:col-span-4" />
        </div>
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
          <Skeleton className="h-136 w-full rounded-card" />
          <Skeleton className="h-136 w-full rounded-card" />
        </div>
      </section>
    </>
  );
}

function greeting(name?: string | null): string {
  // Whole display name: "Mr Sedki" must not become "Welcome back, Mr".
  const full = name?.trim();
  return full ? `Welcome back, ${full}` : "Welcome back";
}
