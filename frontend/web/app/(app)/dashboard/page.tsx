import { Suspense } from "react";
import { cookies } from "next/headers";
import { connection } from "next/server";
import { dehydrate, HydrationBoundary } from "@tanstack/react-query";
import { getQueryClient } from "@/lib/query-client";
import { isDocumentRequest, serverGet, ServerPrefetchError } from "@/lib/server-api";
import {
  accountKeys,
  goalKeys,
  ledgerKeys,
  analyticsKeys,
  searchKeys,
  userKeys,
} from "@/lib/query-keys";
import { pickPrimaryCurrency } from "@/lib/format";
import {
  ACTIVE_ACCOUNT_COOKIE,
  DASHBOARD_RECENT_LIMIT,
  orderCurrencies,
  resolveActiveAccount,
  resolveCurrency,
  scopeBalances,
  summaryApiCurrency,
} from "@/lib/dashboard-scope";
import type {
  Account,
  Goal,
  LedgerBalance,
  MonthlySummary,
  Paginated,
  Transaction,
  User,
} from "@/lib/types";
import { DashboardGate, PrefetchSettled } from "@/components/dashboard/dashboard-gate";

// Static shell: the gate shows the dashboard from the browser cache straight away; the server
// prefetch streams in via Suspense (cacheComponents requires runtime data reads inside one).
export default function DashboardPage() {
  return (
    <DashboardGate
      prefetch={
        <Suspense fallback={null}>
          <DashboardPrefetch />
        </Suspense>
      }
    />
  );
}

async function DashboardPrefetch() {
  try {
    return await prefetchDashboard();
  } catch (err) {
    if (err instanceof ServerPrefetchError) return <PrefetchSettled outcome={err.kind} />;
    throw err;
  }
}

async function prefetchDashboard() {
  // A client-side navigation: the browser already has the data and nothing waits on
  // this. Skip the backend entirely.
  if (!(await isDocumentRequest())) return <PrefetchSettled outcome="ready" />;

  // Reading the current time requires a request-data source first under
  // cacheComponents; connection() opts this render out of prerendering.
  await connection();
  const now = new Date();
  // UTC, like the API's months and the client's (DashboardGate), whatever the server's zone.
  const year = now.getUTCFullYear();
  const month = now.getUTCMonth() + 1;

  // The active account comes from a cookie (mirrored from localStorage) so the server primes the
  // account the client will render.
  const cookieStore = await cookies();
  const rawStored = cookieStore.get(ACTIVE_ACCOUNT_COOKIE)?.value;
  const stored = rawStored ? decodeURIComponent(rawStored) : undefined;

  const queryClient = getQueryClient();

  // First round: everything independent of the active account. All-accounts balances also decide
  // the primary currency and hold the active account's balances.
  const [user, accountsPage, allBalances, goalsPage, allAccountsPage] = await Promise.all([
    serverGet<User>("/users/me", undefined, { throwOnUnauthorized: true }),
    serverGet<Paginated<Account>>("/accounts", { status: "active", limit: 100, offset: 0 }, { throwOnUnauthorized: true }),
    serverGet<LedgerBalance[]>("/ledger/balance"),
    serverGet<Paginated<Goal>>("/goals", { status: "active", limit: 100, offset: 0 }),
    serverGet<Paginated<Account>>("/accounts", { status: "all", limit: 100, offset: 0 }),
  ]);
  const accounts = accountsPage?.data ?? [];
  const activeAccount = resolveActiveAccount(stored, accounts, user?.settings?.mainAccountId);
  const accountId = activeAccount?.id;
  const scopedBalances = accountId && allBalances ? scopeBalances(allBalances, accountId) : undefined;

  // The client derives the same once hydrated; the server needs it first to pick the currency for
  // the summary and series.
  const initialPrimaryCurrency = pickPrimaryCurrency(allBalances, user, "", accounts);

  // Mirrors the client's currency resolution (DashboardBody / BalanceCards) so the same query keys
  // are primed.
  const currencies = orderCurrencies(accounts, initialPrimaryCurrency);
  const currency = resolveCurrency({
    account: activeAccount,
    currencies,
    primaryCurrency: initialPrimaryCurrency,
  });
  const summaryCurrency = summaryApiCurrency(accountId, currency);

  // Second round: what needs the active account and currency. The weekly chart is fetched on the
  // client (it needs the viewer's time zone).
  const [recent, summary] = await Promise.all([
    serverGet<Paginated<Transaction>>("/search/transactions", {
      limit: DASHBOARD_RECENT_LIMIT,
      offset: 0,
      accountId,
    }),
    !accounts.length ? null : serverGet<MonthlySummary>("/analytics/monthly-summary", { year, month, accountId, currency: summaryCurrency }),
  ]);

  // Prime only successful fetches (the client refetches the rest) in the flat shape the hooks
  // produce, or hydration hits `.map is not a function`.
  if (user) queryClient.setQueryData(userKeys.me, user);
  if (accountsPage) queryClient.setQueryData(accountKeys.list("active"), accountsPage.data);
  if (allAccountsPage) queryClient.setQueryData(accountKeys.list("all"), allAccountsPage.data);
  if (goalsPage) queryClient.setQueryData(goalKeys.list("active"), goalsPage.data);
  if (allBalances) queryClient.setQueryData(ledgerKeys.balance(undefined, undefined), allBalances);
  if (accountId && scopedBalances) queryClient.setQueryData(ledgerKeys.balance(accountId, undefined), scopedBalances);
  if (summary) queryClient.setQueryData(analyticsKeys.monthly(year, month, accountId, summaryCurrency), summary);
  if (recent) {
    queryClient.setQueryData(searchKeys.list({ recent: DASHBOARD_RECENT_LIMIT, accountId }), recent.data);
  }

  return (
    <HydrationBoundary state={dehydrate(queryClient)}>
      <PrefetchSettled outcome="ready" />
    </HydrationBoundary>
  );
}

function greeting(name?: string | null): string {
  // Whole display name: "Mr Sedki" must not become "Welcome back, Mr".
  const full = name?.trim();
  return full ? `Welcome back, ${full}` : "Welcome back";
}
