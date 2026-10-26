"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { ErrorState } from "@/components/common/states";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { PrefetchFailureKind } from "@/lib/server-api";

const COPY: Record<PrefetchFailureKind, { title: string; description: string }> = {
  unauthorized: {
    title: "Your session expired",
    description: "Your session expired. Sign in again to see your dashboard.",
  },
  server: {
    title: "Couldn't load your dashboard",
    description: "MoFin's server had a problem loading your dashboard.",
  },
  timeout: {
    title: "MoFin is slow right now",
    description: "MoFin is taking too long to respond.",
  },
  unreachable: {
    title: "You appear to be offline",
    description: "Can't reach MoFin right now. Check your connection and try again.",
  },
};

/** Copy for each failure kind; exported for tests. */
export function dashboardUnavailableCopy(kind: PrefetchFailureKind) {
  return COPY[kind];
}

const SIGN_IN_URL = "/login?next=%2Fdashboard&reason=expired";

/**
 * Inline replacement for the dashboard when its server prefetch failed, saying
 * which way it failed. error.tsx stays the fallback for anything unexpected.
 */
export function DashboardUnavailable({ kind }: { kind: PrefetchFailureKind }) {
  const router = useRouter();
  const [pending, startTransition] = React.useTransition();
  const { title, description } = COPY[kind];

  if (kind === "unauthorized") {
    return (
      <ErrorState
        title={title}
        description={description}
        className="mt-12"
        action={
          <a
            href={SIGN_IN_URL}
            className={cn(buttonVariants({ variant: "outline" }))}
            onClick={(e) => {
              // Clear the rejected session first: with a refresh cookie still set,
              // /login would bounce straight back here.
              e.preventDefault();
              void fetch("/api/auth/logout", { method: "POST" })
                .catch(() => undefined)
                .finally(() => window.location.assign(SIGN_IN_URL));
            }}
          >
            Sign in
          </a>
        }
      />
    );
  }

  return (
    <ErrorState
      title={title}
      description={description}
      retryLabel={pending ? "Retrying…" : "Retry"}
      onRetry={() => startTransition(() => router.refresh())}
      className="mt-12"
    />
  );
}
