import { Suspense } from "react";
import { dehydrate, HydrationBoundary } from "@tanstack/react-query";
import { getQueryClient } from "@/lib/query-client";
import { serverGet } from "@/lib/server-api";
import { transactionKeys } from "@/lib/query-keys";
import type { Transaction } from "@/lib/types";
import { TransactionDetail } from "@/components/transactions/transaction-detail";
import { Skeleton } from "@/components/ui/skeleton";

// Static shell: awaiting params and the server prefetch read request data, which under
// cacheComponents must sit inside Suspense.
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
    <div className="mx-auto max-w-2xl space-y-4">
      <Skeleton className="h-8 w-48" />
      <Skeleton className="h-60 w-full rounded-card" />
      <Skeleton className="h-36 w-full rounded-card" />
      <Skeleton className="h-32 w-full rounded-card" />
    </div>
  );
}
