"use client";

import { ErrorState } from "@/components/common/states";

/**
 * Catches ServerPrefetchError (and any other render-time error) from the
 * dashboard's server prefetch. A genuine backend outage must surface as an
 * error, not as a confident, wrong "$0.00" dashboard — see serverGet.
 */
export default function DashboardError({ reset }: { error: Error; reset: () => void }) {
  return (
    <ErrorState
      title="Couldn't load your dashboard"
      description="We couldn't reach the backend just now. Please try again."
      onRetry={reset}
      className="mt-12"
    />
  );
}
