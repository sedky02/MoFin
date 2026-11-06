import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";

// Every skeleton copies its card's frame and spacing and shows as many rows as the card, so nothing
// moves when data arrives.

const BAR_HEIGHTS = ["45%", "45%", "45%", "58%", "72%", "100%"];

export function BalanceHeroSkeleton() {
  return (
    <div className="relative flex h-full flex-1 flex-col overflow-hidden rounded-hero bg-card p-6 shadow-hero sm:p-8">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Skeleton className="h-8.5 w-27 rounded-full lg:h-8.75" />
        <Skeleton className="h-8 w-66 rounded-lg pointer-coarse:h-11" />
      </div>
      <Skeleton className="mt-6 h-12 w-56 rounded-xl sm:h-18 sm:w-96" />
      <Skeleton className="mt-4 h-5 w-40 lg:h-5.25" />
      <Skeleton className="mt-3 h-6 w-64 rounded-full lg:h-6.25" />
      <div className="mt-8 flex min-h-[170px] flex-1 gap-3">
        <div className="flex flex-1 items-end gap-2 sm:gap-3">
          {BAR_HEIGHTS.map((height, i) => (
            <div key={i} className="flex h-full flex-1 flex-col items-center justify-end gap-1.5">
              <div className="flex w-full flex-1 items-end">
                <Skeleton className="w-full rounded-b-none rounded-t-md" style={{ height }} />
              </div>
              <Skeleton className="h-3 w-7" />
            </div>
          ))}
        </div>
        <div className="flex w-14 flex-col justify-between">
          {Array.from({ length: 3 }).map((_, i) => (
            <Skeleton key={i} className="h-3 w-10" />
          ))}
        </div>
      </div>
    </div>
  );
}

export function GoalTilesSkeleton({ count = 3 }: { count?: number }) {
  return (
    <div className="grid grid-cols-1 gap-3">
      {Array.from({ length: count }).map((_, i) => (
        <div key={i} className="flex items-center gap-3 rounded-xl bg-muted/35 p-4 dark:bg-muted">
          <Skeleton className="size-12 shrink-0 rounded-full" />
          <div className="min-w-0 flex-1">
            <Skeleton className="h-4 w-32" />
            <Skeleton className="mt-2 h-3 w-24" />
          </div>
        </div>
      ))}
    </div>
  );
}

function GoalsCardSkeleton() {
  return (
    <Card className="h-full gap-0 p-0">
      <div className="flex items-center justify-between gap-3 px-5 pb-4 pt-5">
        <Skeleton className="h-5 w-14" />
        <div className="flex items-center gap-2">
          <Skeleton className="size-7 rounded-full" />
          <Skeleton className="h-7 w-22" />
        </div>
      </div>
      <div className="flex flex-1 flex-col px-5 pb-5">
        <GoalTilesSkeleton />
      </div>
    </Card>
  );
}

export function SummaryBreakdownSkeleton() {
  return (
    <div className="flex w-full flex-col items-center gap-6 sm:flex-row">
      <Skeleton className="size-44 shrink-0 rounded-full" />
      <div className="w-full min-w-0 flex-1 space-y-2">
        {Array.from({ length: 5 }).map((_, i) => (
          <div key={i} className="flex items-center gap-3">
            <Skeleton className="size-9 shrink-0 rounded-xl" />
            <Skeleton className="h-4 w-24" />
            <div className="ml-auto flex flex-col items-end gap-1.5 py-0.5">
              <Skeleton className="h-4 w-18" />
              <Skeleton className="h-3 w-8" />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function MonthlySummarySkeleton() {
  return (
    <Card className="@container flex flex-col p-5">
      <div>
        <div className="flex items-center justify-between gap-3">
          <Skeleton className="h-5 w-36" />
          <Skeleton className="h-8 w-40 rounded-lg pointer-coarse:h-11" />
        </div>
        <div className="mt-1 flex flex-wrap items-center justify-between gap-x-3 gap-y-1">
          <div className="flex h-8 w-54 items-center">
            <Skeleton className="h-5 w-44" />
          </div>
          <Skeleton className="h-4 w-36" />
        </div>
      </div>
      <Skeleton className="mt-4 h-37 w-full rounded-xl" />
      <div className="mt-1 flex min-h-54 items-center sm:h-54">
        <SummaryBreakdownSkeleton />
      </div>
    </Card>
  );
}

export function RecentRowsSkeleton() {
  return (
    <div className="max-h-112 min-h-0 flex-1 overflow-hidden lg:max-h-none">
      {Array.from({ length: 6 }).map((_, i) => (
        <div key={i}>
          <div className="px-5 pb-1 pt-3">
            <Skeleton className="h-4 w-24" />
          </div>
          <div className="flex items-center gap-4 px-4 py-3.5">
            <Skeleton className="size-11 shrink-0 rounded-xl" />
            <div className="min-w-0 flex-1">
              <Skeleton className="h-4 w-32" />
              <Skeleton className="mt-2 h-3 w-44 max-w-full" />
            </div>
            <Skeleton className="h-4 w-16" />
          </div>
        </div>
      ))}
    </div>
  );
}

function RecentTransactionsSkeleton() {
  return (
    <Card className="flex flex-col overflow-hidden p-0 lg:absolute lg:inset-0">
      <div className="flex shrink-0 items-center justify-between px-5 pb-2 pt-5">
        <Skeleton className="h-5 w-40" />
        <Skeleton className="h-7 w-22" />
      </div>
      <RecentRowsSkeleton />
    </Card>
  );
}

export function DashboardSkeleton() {
  return (
    <section className="space-y-8" aria-busy="true" aria-label="Loading your dashboard">
      {/* The same grid and order as the dashboard: below lg the summary comes before Goals. */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-12 lg:gap-y-8">
        <div className="order-1 lg:order-none lg:col-span-8">
          <div className="flex h-full flex-col">
            <BalanceHeroSkeleton />
          </div>
        </div>
        <div className="order-3 lg:order-none lg:col-span-4">
          <GoalsCardSkeleton />
        </div>
        <div className="order-2 lg:order-none lg:col-span-6">
          <MonthlySummarySkeleton />
        </div>
        <div className="relative order-4 lg:order-none lg:col-span-6">
          <RecentTransactionsSkeleton />
        </div>
      </div>
    </section>
  );
}
