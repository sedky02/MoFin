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
import { parseBalanceKey, pickPrimaryCurrency } from "@/lib/format";
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
  MonthlySeries,
  MonthlySummary,
  Paginated,
  Transaction,
  User,
} from "@/lib/types";
import { DashboardGate, PrefetchSettled } from "@/components/dashboard/dashboard-gate";

// Static shell: the gate (a client component) shows the dashboard from the browser's
// cache straight away when arriving from another page. The server prefetch streams in
// via <Suspense> (required under cacheComponents: runtime data access — cookies in
// serverGet, new Date() — must live inside a Suspense boundary) and is only waited for
// on a full page load, when that cache is empty.
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

// Async Server Component performing the (dynamic) server-side prefetch.
async function DashboardPrefetch() {
  try {
    return await prefetchDashboard();
  } catch (err) {
    // Say which way the prefetch failed; anything else still reaches error.tsx.
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
  const year = now.getFullYear();
  const month = now.getMonth() + 1;

  // The account the user last picked in the header lives in a cookie (mirrored from
  // localStorage by useActiveAccount), so the server can prefetch for the account the
  // client will actually render instead of priming keys nobody reads.
  const cookieStore = await cookies();
  const rawStored = cookieStore.get(ACTIVE_ACCOUNT_COOKIE)?.value;
  const stored = rawStored ? decodeURIComponent(rawStored) : undefined;

  const queryClient = getQueryClient();

  // First round: everything that doesn't depend on which account is active. The
  // all-accounts balances also decide the primary currency, and hold the active account's
  // balances, so those need no request of their own.
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
  const balances = accountId ? scopedBalances : allBalances;

  // The client derives the same from this data once it is hydrated; the server needs it
  // first to know which currency to ask the summary and the chart series in.
  const initialPrimaryCurrency = pickPrimaryCurrency(allBalances, user, "", accounts);

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
  const summaryCurrency = summaryApiCurrency(accountId, currency);

  // Second round: what needs the active account and currency. Nothing to summarise
  // without an account (and no currency to ask in).
  const [recent, summary, series] = await Promise.all([
    serverGet<Paginated<Transaction>>("/search/transactions", {
      limit: DASHBOARD_RECENT_LIMIT,
      offset: 0,
      accountId,
    }),
    !accounts.length ? null : serverGet<MonthlySummary>("/analytics/monthly-summary", { year, month, accountId, currency: summaryCurrency }),
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
  if (allAccountsPage) queryClient.setQueryData(accountKeys.list("all"), allAccountsPage.data);
  if (goalsPage) queryClient.setQueryData(goalKeys.list("active"), goalsPage.data);
  if (allBalances) queryClient.setQueryData(ledgerKeys.balance(undefined, undefined), allBalances);
  if (accountId && scopedBalances) queryClient.setQueryData(ledgerKeys.balance(accountId, undefined), scopedBalances);
  if (summary) queryClient.setQueryData(analyticsKeys.monthly(year, month, accountId, summaryCurrency), summary);
  if (series) queryClient.setQueryData(analyticsKeys.series(heroCurrency, 6, accountId), series);
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
