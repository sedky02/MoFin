"use client";

import * as React from "react";
import type { PrefetchFailureKind } from "@/lib/server-api";
import { useHydrating } from "@/hooks/use-hydrating";
import { DashboardBody } from "@/components/dashboard/dashboard-body";
import { DashboardSkeleton } from "@/components/dashboard/dashboard-skeleton";
import { DashboardUnavailable } from "@/components/dashboard/dashboard-unavailable";

export type PrefetchOutcome = "ready" | PrefetchFailureKind;

const SettleContext = React.createContext<(outcome: PrefetchOutcome) => void>(() => {});

/**
 * Arriving from another page, the browser cache already holds the data, so the dashboard shows at
 * once and refetches stale cards in the background; only a full page load starts empty.
 */
export function DashboardGate({ prefetch }: { prefetch: React.ReactNode }) {
  // A component mounted by a client-side navigation isn't hydrating, so it shows at once.
  const hydrating = useHydrating();
  const [status, setStatus] = React.useState<"pending" | PrefetchOutcome>(() =>
    hydrating ? "pending" : "ready",
  );

  return (
    <SettleContext value={setStatus}>
      {prefetch}
      {status === "pending" ? (
        <DashboardSkeleton />
      ) : status === "ready" ? (
        <ThisMonthDashboard />
      ) : (
        <DashboardUnavailable kind={status} />
      )}
    </SettleContext>
  );
}

/**
 * The month as the API counts it, in UTC: the local month would show next month's empty summary
 * during the first hours of the 1st east of UTC.
 */
function ThisMonthDashboard() {
  const [now] = React.useState(() => new Date());
  return <DashboardBody year={now.getUTCFullYear()} month={now.getUTCMonth() + 1} />;
}

/**
 * Rendered by the server prefetch inside its HydrationBoundary, so the cache is primed first; tells
 * the gate to show the dashboard or the failure.
 */
export function PrefetchSettled({ outcome }: { outcome: PrefetchOutcome }) {
  const settle = React.use(SettleContext);
  React.useEffect(() => settle(outcome), [settle, outcome]);
  return null;
}
