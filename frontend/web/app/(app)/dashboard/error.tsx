"use client";

import * as React from "react";
import { ErrorState } from "@/components/common/states";
import { reportError } from "@/lib/error-reporting";

/**
 * A real backend outage must show as an error, not a confident wrong "$0.00" dashboard (see
 * serverGet).
 */
export default function DashboardError({ error, unstable_retry }: { error: Error; unstable_retry: () => void }) {
  React.useEffect(() => reportError(error, { boundary: "dashboard" }), [error]);
  return (
    <ErrorState
      title="Couldn't load your dashboard"
      description="The server is slow or couldn't be reached just now. Please try again."
      onRetry={unstable_retry}
      className="mt-12"
    />
  );
}
