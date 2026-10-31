"use client";

import * as React from "react";
import type { PrefetchFailureKind } from "@/lib/server-api";
import { DashboardBody } from "@/components/dashboard/dashboard-body";
import { DashboardSkeleton } from "@/components/dashboard/dashboard-skeleton";
import { DashboardUnavailable } from "@/components/dashboard/dashboard-unavailable";

/** What the server prefetch came back with: data (or nothing to add), or why it failed. */
export type PrefetchOutcome = "ready" | PrefetchFailureKind;

const SettleContext = React.createContext<(outcome: PrefetchOutcome) => void>(() => {});

const subscribeNever = () => () => {};

/**
 * Decides when the dashboard shows. Arriving from another page, the browser's query
 * cache already holds the data, so the dashboard renders at once and the cards refetch
 * whatever is stale in the background. Only on a full page load is the cache empty: the
 * dashboard then waits for the server prefetch (streamed in through `prefetch`) instead
 * of every card fetching the same data a second time.
 */
export function DashboardGate({ prefetch }: { prefetch: React.ReactNode }) {
  // True only while hydrating the server's HTML, i.e. on a full page load. A component
  // mounted by a client-side navigation reads the client snapshot straight away.
  const hydrating = React.useSyncExternalStore(subscribeNever, () => false, () => true);
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

/** The cards for the current month. Only ever rendered in the browser, so the clock is the user's. */
function ThisMonthDashboard() {
  const [now] = React.useState(() => new Date());
  return <DashboardBody year={now.getFullYear()} month={now.getMonth() + 1} />;
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
