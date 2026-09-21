import { Suspense } from "react";
import { connection } from "next/server";
import { dehydrate, HydrationBoundary } from "@tanstack/react-query";
import { getQueryClient } from "@/lib/query-client";
import { serverGet } from "@/lib/server-api";
import {
  ledgerKeys,
  analyticsKeys,
  searchKeys,
  userKeys,
} from "@/lib/query-keys";
import { pickPrimaryCurrency } from "@/lib/format";
import type { LedgerBalance, MonthlySummary, Paginated, Transaction, User } from "@/lib/types";
import { DashboardBody } from "@/components/dashboard/dashboard-body";
import { PageHeader } from "@/components/common/page-header";
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

  // Prefetch all datasets in parallel on the server (cookies awaited inside serverGet).
  const [balances, summary, recent, user] = await Promise.all([
    serverGet<LedgerBalance[]>("/ledger/balance"),
    serverGet<MonthlySummary>("/analytics/monthly-summary", { year, month }),
    serverGet<Paginated<Transaction>>("/search/transactions", { limit: 10, offset: 0 }),
    serverGet<User>("/users/me"),
  ]);

  // Prime the cache only for successful fetches; the client refetches the rest.
  // useRecentTransactions unwraps the paginated envelope to a flat array
  // before it ever reaches components, so the primed cache must match that
  // same shape (mirroring it here avoids `.map is not a function` on hydrate).
  if (balances) queryClient.setQueryData(ledgerKeys.balance(undefined, undefined), balances);
  if (summary) queryClient.setQueryData(analyticsKeys.monthly(year, month), summary);
  if (recent) queryClient.setQueryData(searchKeys.list({ recent: 10 }), recent.data);
  if (user) queryClient.setQueryData(userKeys.me, user);

  // Best-guess only for the very first paint (and only when prefetch actually
  // had data to guess from) — DashboardBody re-derives this from live
  // useUser()/useLedgerBalance() query data and self-corrects once that
  // resolves, rather than ever showing this guess as a final answer.
  const initialPrimaryCurrency = pickPrimaryCurrency(balances, user);

  return (
    <HydrationBoundary state={dehydrate(queryClient)}>
      <PageHeader
        title={greeting(user?.displayName)}
        description="Here's where your money stands today."
      />

      <DashboardBody year={year} month={month} initialPrimaryCurrency={initialPrimaryCurrency} />
    </HydrationBoundary>
  );
}

function DashboardSkeleton() {
  return (
    <>
      <div className="mb-6 space-y-2">
        <Skeleton className="h-9 w-64" />
        <Skeleton className="h-4 w-80" />
      </div>

      <section className="space-y-8">
        <Skeleton className="h-48 w-full rounded-3xl" />

        <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
          <Skeleton className="h-72 w-full rounded-2xl" />
          <Skeleton className="h-72 w-full rounded-2xl" />
        </div>
      </section>
    </>
  );
}

function greeting(name?: string | null): string {
  const first = name?.trim().split(/\s+/)[0];
  return first ? `Welcome back, ${first}` : "Welcome back";
}
