"use client";

import * as React from "react";
import { ErrorState } from "@/components/common/states";
import { reportError } from "@/lib/error-reporting";

/**
 * Catch-all boundary for every authenticated route that doesn't define its
 * own error.tsx. Without this, an unexpected error anywhere under (app) (a
 * bad row, an unexpected API shape) blanked the whole page with no recovery
 * path but a manual reload (audit OBS-01/PERF-XX). More specific boundaries
 * (e.g. dashboard/error.tsx) still take precedence for their own routes.
 */
export default function AppError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  React.useEffect(() => reportError(error, { boundary: "app" }), [error]);
  return (
    <ErrorState
      title="Something went wrong"
      description="This page hit an unexpected error. Please try again."
      onRetry={reset}
      className="mt-12"
    />
  );
}
