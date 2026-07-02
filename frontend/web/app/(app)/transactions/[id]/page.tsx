import { Suspense } from "react";
import { dehydrate, HydrationBoundary } from "@tanstack/react-query";
import { getQueryClient } from "@/lib/query-client";
import { serverGet } from "@/lib/server-api";
import { transactionKeys } from "@/lib/query-keys";
import type { Transaction } from "@/lib/types";
import { TransactionDetail } from "@/components/transactions/transaction-detail";
import { Skeleton } from "@/components/ui/skeleton";

// Static shell. Awaiting params + the server prefetch touch request data
// (route params, cookies in serverGet), which under cacheComponents must live
// inside a <Suspense> boundary rather than at the route top level.
export default function TransactionPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  return (
    <Suspense fallback={<TransactionDetailSkeleton />}>
      <TransactionContent params={params} />
    </Suspense>
  );
}

async function TransactionContent({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const queryClient = getQueryClient();

  // Prefetch on the server so the client renders from a primed cache.
  const tx = await serverGet<Transaction>(`/transactions/${id}`);
  if (tx) queryClient.setQueryData(transactionKeys.detail(id), tx);

  return (
    <HydrationBoundary state={dehydrate(queryClient)}>
      <TransactionDetail id={id} />
    </HydrationBoundary>
  );
}

function TransactionDetailSkeleton() {
  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <Skeleton className="h-8 w-48" />
      <Skeleton className="h-40 w-full rounded-xl" />
      <Skeleton className="h-48 w-full rounded-xl" />
    </div>
  );
}
