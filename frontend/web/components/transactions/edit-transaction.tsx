"use client";

import { ApiClientError } from "@/lib/api";
import { useTransaction } from "@/hooks/useTransactions";
import { TransactionForm } from "@/components/transactions/transaction-form";
import { ErrorState } from "@/components/common/states";
import { Skeleton } from "@/components/ui/skeleton";

/** The edit page's client side: loads the transaction and hands it to the form. */
export function EditTransaction({ id }: { id: string }) {
  const { data: tx, isLoading, isError, error, refetch } = useTransaction(id);

  if (isLoading) {
    return (
      <div className="mx-auto max-w-lg space-y-4">
        <Skeleton className="h-10 w-56" />
        <Skeleton className="h-96 w-full rounded-3xl" />
      </div>
    );
  }

  if (isError || !tx) {
    const notFound = !isError || (error instanceof ApiClientError && error.status === 404);
    return notFound ? (
      <ErrorState title="Transaction not found" description="It may have been deleted." />
    ) : (
      <ErrorState description="Couldn't load this transaction." onRetry={() => refetch()} />
    );
  }

  // Keyed on the saved version, so a refetch after another tab's edit starts the form over.
  return <TransactionForm key={`${tx.id}:${tx.updatedAt}`} transaction={tx} />;
}
