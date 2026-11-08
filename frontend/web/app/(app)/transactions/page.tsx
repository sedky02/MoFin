import type { Metadata } from "next";
import { TransactionDaysSkeleton, TransactionFiltersSkeleton } from "@/components/common/page-skeletons";
import { Suspense } from "react";
import { PageHeader } from "@/components/common/page-header";
import type { SearchInitial } from "@/components/search/search-view";
import { TransactionsViews } from "@/components/transactions/transactions-views";
import { Skeleton } from "@/components/ui/skeleton";
import {
  TRANSACTIONS_DESCRIPTION,
  TRANSACTIONS_TITLE,
  parseRecurrence,
  parseSort,
  parseType,
  parseView,
} from "@/lib/transaction-list-params";

export const metadata: Metadata = { title: "Transactions" };

function first(v: string | string[] | undefined): string | undefined {
  return Array.isArray(v) ? v[0] : v;
}

export default function TransactionsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  return (
    <div className="mx-auto w-full max-w-3xl">
      {/* The view toggle lives in the header, which needs the page's client state, so the header is
          drawn there; this static copy holds its place until that has loaded. */}
      <Suspense fallback={<TransactionsSkeleton />}>
        <SearchContent searchParams={searchParams} />
      </Suspense>
    </div>
  );
}

// searchParams is request data — awaiting it must happen inside <Suspense> under
// cacheComponents so the static shell (header) can prerender immediately.
async function SearchContent({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const sp = await searchParams;
  const initial: SearchInitial = {
    q: first(sp.q),
    categoryId: first(sp.categoryId),
    accountId: first(sp.accountId),
    from: first(sp.from),
    to: first(sp.to),
    minAmount: first(sp.minAmount),
    maxAmount: first(sp.maxAmount),
    type: parseType(first(sp.type)),
    recurrence: parseRecurrence(first(sp.recurrence)),
    sort: parseSort(first(sp.sort)),
    limit: first(sp.limit) ? Number(first(sp.limit)) : 25,
    page: first(sp.page) ? Number(first(sp.page)) : 1,
  };

  return <TransactionsViews initialView={parseView(first(sp.view))} initial={initial} />;
}

function TransactionsSkeleton() {
  return (
    <div className="flex flex-col gap-5">
      <PageHeader
        title={TRANSACTIONS_TITLE}
        description={TRANSACTIONS_DESCRIPTION}
        className="mb-3"
        action={
          <div className="flex flex-wrap items-center gap-2">
            <Skeleton className="h-10 w-48 rounded-lg" />
            <Skeleton className="h-10 w-40 rounded-lg" />
          </div>
        }
      />
      <div className="space-y-5">
        <TransactionFiltersSkeleton />
        <TransactionDaysSkeleton />
      </div>
    </div>
  );
}
