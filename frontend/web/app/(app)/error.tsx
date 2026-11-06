"use client";

import * as React from "react";
import { ErrorState } from "@/components/common/states";
import { reportError } from "@/lib/error-reporting";

/**
 * Catch-all for authenticated routes without their own error.tsx, so an unexpected error doesn't
 * blank the page with only a manual reload (audit OBS-01/PERF-XX).
 */
export default function AppError({ error, unstable_retry }: { error: Error & { digest?: string }; unstable_retry: () => void }) {
  React.useEffect(() => reportError(error, { boundary: "app" }), [error]);
  return (
    <ErrorState
      title="Something went wrong"
      description="This page hit an unexpected error. Please try again."
      onRetry={unstable_retry}
      className="mt-12"
    />
  );
}
