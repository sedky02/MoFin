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
    <div className="mx-auto max-w-lg space-y-4">
      <Skeleton className="h-10 w-56" />
      <Skeleton className="h-96 w-full rounded-3xl" />
    </div>
  );
}
