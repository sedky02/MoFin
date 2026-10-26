"use client";

import * as React from "react";
import { ErrorState } from "@/components/common/states";
import { reportError } from "@/lib/error-reporting";

/**
 * Catches ServerPrefetchError (and any other render-time error) from the
 * dashboard's server prefetch. A genuine backend outage must surface as an
 * error, not as a confident, wrong "$0.00" dashboard — see serverGet.
 *
 * The dashboard page now catches ServerPrefetchError itself and renders
 * DashboardUnavailable per failure kind, so this is the generic fallback for
 * anything else. A Server Component error loses its message in production.
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
