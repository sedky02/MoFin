"use client";

import { ErrorState } from "@/components/common/states";

/** Catches ServerPrefetchError from the server prefetch — see serverGet. */
export default function TransactionError({ error, reset }: { error: Error; reset: () => void }) {
  const timedOut = error.message?.toLowerCase().includes("timed out");
  return (
    <ErrorState
      title="Couldn't load this transaction"
      description={
        timedOut
          ? "The server is taking too long to respond. Please try again."
          : "We couldn't reach the backend just now. Please try again."
      }
      onRetry={reset}
      className="mx-auto mt-12 max-w-2xl"
    />
  );
}
