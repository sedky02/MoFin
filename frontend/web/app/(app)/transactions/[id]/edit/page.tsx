import { Suspense } from "react";
import { dehydrate, HydrationBoundary } from "@tanstack/react-query";
import { getQueryClient } from "@/lib/query-client";
import { serverGet } from "@/lib/server-api";
import { transactionKeys } from "@/lib/query-keys";
import type { Transaction } from "@/lib/types";
import { EditTransaction } from "@/components/transactions/edit-transaction";
import { Skeleton } from "@/components/ui/skeleton";

// Same shape as the detail page: the params and the server prefetch read request
// data, which under cacheComponents has to sit inside a <Suspense> boundary.
export default function EditTransactionPage({ params }: { params: Promise<{ id: string }> }) {
  return (
    <Suspense fallback={<EditTransactionSkeleton />}>
      <EditTransactionContent params={params} />
    </Suspense>
  );
}

async function EditTransactionContent({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const queryClient = getQueryClient();
  const tx = await serverGet<Transaction>(`/transactions/${id}`);
  if (tx) queryClient.setQueryData(transactionKeys.detail(id), tx);

  return (
    <HydrationBoundary state={dehydrate(queryClient)}>
      <EditTransaction id={id} />
    </HydrationBoundary>
  );
}

function EditTransactionSkeleton() {
  return (
    <div className="mx-auto max-w-lg space-y-6">
      <div className="space-y-2">
        <Skeleton className="h-8 w-56" />
        <Skeleton className="h-4 w-72 max-w-full" />
      </div>
      <div className="space-y-6 rounded-3xl bg-card p-5 shadow-sm ring-1 ring-border/60 sm:p-8">
        <Skeleton className="h-11 w-full rounded-xl" />
        <Skeleton className="h-36 w-full rounded-2xl" />
        <Skeleton className="h-28 w-full rounded-2xl" />
        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-2">
            <Skeleton className="h-3 w-16" />
            <Skeleton className="h-12 w-full rounded-xl" />
          </div>
          <div className="space-y-2">
            <Skeleton className="h-3 w-12" />
            <Skeleton className="h-12 w-full rounded-xl" />
          </div>
        </div>
        <Skeleton className="h-12 w-full rounded-2xl" />
        <div className="grid grid-cols-2 gap-3">
          <Skeleton className="h-12 rounded-xl" />
          <Skeleton className="h-12 rounded-xl" />
        </div>
      </div>
    </div>
  );
}
