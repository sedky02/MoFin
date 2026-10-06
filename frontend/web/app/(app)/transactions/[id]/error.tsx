"use client";

import * as React from "react";
import { ErrorState } from "@/components/common/states";
import { reportError } from "@/lib/error-reporting";

/** Catches ServerPrefetchError from the server prefetch — see serverGet. */
export default function TransactionError({ error, unstable_retry }: { error: Error; unstable_retry: () => void }) {
  React.useEffect(() => reportError(error, { boundary: "transaction-detail" }), [error]);
  const timedOut = error.message?.toLowerCase().includes("timed out");
  return (
    <ErrorState
      title="Couldn't load this transaction"
      description={
        timedOut
          ? "The server is taking too long to respond. Please try again."
          : "We couldn't reach the backend just now. Please try again."
      }
      onRetry={unstable_retry}
      className="mx-auto mt-12 max-w-2xl"
    />
  );
}
