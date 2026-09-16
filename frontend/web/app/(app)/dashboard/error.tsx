"use client";

import { ErrorState } from "@/components/common/states";

/**
 * Catches ServerPrefetchError (and any other render-time error) from the
 * dashboard's server prefetch. A genuine backend outage must surface as an
 * error, not as a confident, wrong "$0.00" dashboard — see serverGet.
 *
 * Next.js only forwards `message` (and `digest`) across the server/client
 * boundary here, not custom error subclass fields, so `timedOut` is encoded
 * in the message itself rather than read as a property.
 */
export default function DashboardError({ error, reset }: { error: Error; reset: () => void }) {
  const timedOut = error.message?.toLowerCase().includes("timed out");
  return (
    <ErrorState
      title="Couldn't load your dashboard"
      description={
        timedOut
          ? "The server is taking too long to respond. Please try again."
          : "We couldn't reach the backend just now. Please try again."
      }
      onRetry={reset}
      className="mt-12"
    />
  );
}
