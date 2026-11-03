import { View } from 'react-native';

import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';

const CARD = 'rounded-xl bg-card p-5 shadow-sm shadow-black/5';

/** Hidden from screen readers; the screen announces loading itself. */
function Hidden({ className, children }: { className?: string; children: React.ReactNode }) {
  return (
    <View importantForAccessibility="no-hide-descendants" accessibilityElementsHidden className={className}>
      {children}
    </View>
  );
}

/** Same footprint as the loaded hero: header row, figure, caption, chart area. */
export function BalanceHeroSkeleton() {
  return (
    <Hidden className={cn(CARD, 'p-6')}>
      <View className="flex-row items-center justify-between">
        <Skeleton className="h-3 w-24" />
        <Skeleton className="h-11 w-52 rounded-lg" />
      </View>
      <Skeleton className="mt-6 h-12 w-56 rounded-xl" />
      <Skeleton className="mt-4 h-3 w-40" />
      <Skeleton className="mt-8 h-44 rounded-xl" />
    </Hidden>
  );
}

export function SummarySkeleton() {
  return (
    <Hidden>
      <Skeleton className="mt-4 h-[148px] w-full rounded-xl" />
      <Skeleton className="mt-4 h-44 w-full rounded-xl" />
    </Hidden>
  );
}

export function GoalTilesSkeleton() {
  return (
    <Hidden className="gap-3">
      {[0, 1].map((i) => (
        <Skeleton key={i} className="h-20 rounded-xl" />
      ))}
    </Hidden>
  );
}

export function RecentRowsSkeleton() {
  return (
    <Hidden>
      {[0, 1, 2, 3].map((i) => (
        <View key={i} className="flex-row items-center gap-4 px-4 py-3.5">
          <Skeleton className="size-11 rounded-xl" />
          <View className="flex-1 gap-2">
            <Skeleton className="h-3.5 w-40" />
            <Skeleton className="h-3 w-24" />
          </View>
          <Skeleton className="h-4 w-16" />
        </View>
      ))}
    </Hidden>
  );
}

/** The whole dashboard while the first data loads: hero, summary, goals, recent. */
export function DashboardSkeleton() {
  return (
    <View accessibilityLabel="Loading your dashboard" aria-busy className="gap-6">
      <BalanceHeroSkeleton />
      <View className={CARD}>
        <Skeleton className="h-4 w-32" />
        <SummarySkeleton />
      </View>
      <View className={CARD}>
        <Skeleton className="mb-4 h-4 w-20" />
        <GoalTilesSkeleton />
      </View>
      <View className={cn(CARD, 'px-0')}>
        <Skeleton className="mx-5 mb-2 h-4 w-40" />
        <RecentRowsSkeleton />
      </View>
    </View>
  );
}
