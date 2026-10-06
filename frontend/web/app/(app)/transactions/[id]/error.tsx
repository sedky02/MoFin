"use client";

import * as React from "react";
import { ErrorState } from "@/components/common/states";
import { reportError } from "@/lib/error-reporting";

/** Catches ServerPrefetchError from the server prefetch — see serverGet. */
export default function TransactionError({ error, unstable_retry }: { error: Error; unstable_retry: () => void }) {
  React.useEffect(() => reportError(error, { boundary: "transaction-detail" }), [error]);
  return (
    <ErrorState
      title="Couldn't load this transaction"
      description="The server is slow or couldn't be reached just now. Please try again."
      onRetry={unstable_retry}
      className="mx-auto mt-12 max-w-2xl"
    />
  );
}
