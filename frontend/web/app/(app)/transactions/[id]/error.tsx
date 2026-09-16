"use client";

import { ErrorState } from "@/components/common/states";

/** Catches ServerPrefetchError from the server prefetch — see serverGet. */
export default function TransactionError({ reset }: { error: Error; reset: () => void }) {
  return (
    <ErrorState
      title="Couldn't load this transaction"
      description="We couldn't reach the backend just now. Please try again."
      onRetry={reset}
      className="mx-auto mt-12 max-w-2xl"
    />
  );
}
