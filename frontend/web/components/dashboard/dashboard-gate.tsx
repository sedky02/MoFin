"use client";

import * as React from "react";
import type { PrefetchFailureKind } from "@/lib/server-api";
import { useHydrating } from "@/hooks/use-hydrating";
import { DashboardBody } from "@/components/dashboard/dashboard-body";
import { DashboardSkeleton } from "@/components/dashboard/dashboard-skeleton";
import { DashboardUnavailable } from "@/components/dashboard/dashboard-unavailable";

/** What the server prefetch came back with: data (or nothing to add), or why it failed. */
export type PrefetchOutcome = "ready" | PrefetchFailureKind;

const SettleContext = React.createContext<(outcome: PrefetchOutcome) => void>(() => {});

/**
 * Decides when the dashboard shows. Arriving from another page, the browser's query
 * cache already holds the data, so the dashboard renders at once and the cards refetch
 * whatever is stale in the background. Only on a full page load is the cache empty: the
 * dashboard then waits for the server prefetch (streamed in through `prefetch`) instead
 * of every card fetching the same data a second time.
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
 * The cards for the current month, as the API counts months: in UTC. Taking the local month
 * would show next month's (empty) summary for the first hours of the 1st east of UTC, while
 * transactions recorded then still land in the previous month.
 */
function ThisMonthDashboard() {
  const [now] = React.useState(() => new Date());
  return <DashboardBody year={now.getUTCFullYear()} month={now.getUTCMonth() + 1} />;
}

/**
 * Rendered by the server prefetch once it is done (inside its HydrationBoundary, so the
 * cache is primed before this runs). Tells the gate to show the dashboard or the failure.
 */
export function PrefetchSettled({ outcome }: { outcome: PrefetchOutcome }) {
  const settle = React.use(SettleContext);
  React.useEffect(() => settle(outcome), [settle, outcome]);
  return null;
}
