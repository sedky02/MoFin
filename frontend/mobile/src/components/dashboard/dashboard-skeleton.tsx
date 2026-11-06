import { View } from 'react-native';

import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';

// Same surface as the loaded cards, so nothing jumps when the data arrives.
const CARD = 'rounded-2xl bg-card p-5 shadow-sm shadow-black/5';

function Hidden({ className, children }: { className?: string; children: React.ReactNode }) {
  return (
    <View importantForAccessibility="no-hide-descendants" accessibilityElementsHidden className={className}>
      {children}
    </View>
  );
}

function PagerRow({ className, extra = false }: { className?: string; extra?: boolean }) {
  return (
    <View className={cn('flex-row items-center justify-between gap-2', className)}>
      <Skeleton className="size-11 rounded-full" />
      <View className="flex-1 items-center gap-1.5">
        <Skeleton className="h-4 w-28" />
        {!extra ? <Skeleton className="h-3 w-20" /> : null}
      </View>
      <Skeleton className="size-11 rounded-full" />
      {extra ? <Skeleton className="size-11 rounded-full" /> : null}
    </View>
  );
}

export function BalanceHeroSkeleton() {
  return (
    <Hidden className={CARD}>
      <Skeleton className="h-3 w-24" />
      <Skeleton className="mt-3 h-12 w-full rounded-lg" />
      <PagerRow className="mt-4" />
      <Skeleton className="mt-6 h-12 w-56 rounded-xl" />
      <Skeleton className="mt-3 h-3 w-32" />
      <Skeleton className="mt-6 h-[194px] w-full rounded-xl" />
    </Hidden>
  );
}

export function SummarySkeleton() {
  return (
    <Hidden>
      <Skeleton className="mt-4 h-[148px] w-full rounded-xl" />
      <View className="mt-5 items-center gap-5">
        <Skeleton className="size-44 rounded-full" />
        <View className="w-full gap-2.5">
          {[0, 1, 2].map((i) => (
            <View key={i} className="flex-row items-center gap-3">
              <Skeleton className="size-9 rounded-xl" />
              <Skeleton className="h-3.5 flex-1" />
              <Skeleton className="h-3.5 w-16" />
            </View>
          ))}
        </View>
      </View>
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

export function DashboardSkeleton() {
  return (
    <View accessibilityLabel="Loading your dashboard" aria-busy className="gap-6">
      <View className="gap-4">
        <Hidden className="flex-row gap-2">
          <Skeleton className="h-11 w-32 rounded-full" />
          <Skeleton className="h-11 w-28 rounded-full" />
          <Skeleton className="size-11 rounded-full" />
        </Hidden>
        <BalanceHeroSkeleton />
      </View>
      <View className={CARD}>
        <Skeleton className="h-3 w-32" />
        <Skeleton className="mt-3 h-12 w-full rounded-lg" />
        <PagerRow className="mt-2" extra />
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
