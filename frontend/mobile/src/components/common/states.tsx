import type { LucideIcon } from 'lucide-react-native';
import * as React from 'react';
import { View } from 'react-native';

import { Button } from '@/components/ui/button';
import { Icon } from '@/components/ui/icon';
import { Skeleton } from '@/components/ui/skeleton';
import { Text } from '@/components/ui/text';
import { AlertTriangle, Inbox } from '@/lib/icons';
import { cn } from '@/lib/utils';

export function EmptyState({
  icon = Inbox,
  title,
  description,
  action,
  className,
}: {
  icon?: LucideIcon;
  title: string;
  description?: string;
  action?: React.ReactNode;
  className?: string;
}) {
  return (
    <View
      className={cn(
        'items-center justify-center rounded-lg border border-dashed border-border bg-card/40 px-6 py-12',
        className,
      )}>
      <View className="mb-4 size-12 items-center justify-center rounded-full bg-accent/60">
        <Icon as={icon} size={24} aria-hidden className="text-accent-foreground" />
      </View>
      <Text role="heading" aria-level={3} className="text-center text-base font-semibold">
        {title}
      </Text>
      {description ? <Text className="mt-1 max-w-sm text-center text-sm text-muted-foreground">{description}</Text> : null}
      {action ? <View className="mt-5">{action}</View> : null}
    </View>
  );
}

export function ErrorState({
  title = 'Something went wrong',
  description,
  onRetry,
  retryLabel = 'Try again',
  action,
  className,
}: {
  title?: string;
  description?: string;
  onRetry?: () => void;
  retryLabel?: string;
  /** A custom action (e.g. a link) shown instead of the retry button. */
  action?: React.ReactNode;
  className?: string;
}) {
  return (
    <View
      role="alert"
      className={cn(
        'items-center justify-center rounded-lg border border-destructive/30 bg-destructive/5 px-6 py-10',
        className,
      )}>
      <View className="mb-4 size-12 items-center justify-center rounded-full bg-destructive/10">
        <Icon as={AlertTriangle} size={24} aria-hidden className="text-destructive" />
      </View>
      <Text role="heading" aria-level={3} className="text-center text-base font-semibold">
        {title}
      </Text>
      {description ? <Text className="mt-1 max-w-sm text-center text-sm text-muted-foreground">{description}</Text> : null}
      {action ? (
        <View className="mt-5">{action}</View>
      ) : onRetry ? (
        <Button variant="outline" size="lg" className="mt-5" onPress={onRetry}>
          <Text>{retryLabel}</Text>
        </Button>
      ) : null}
    </View>
  );
}

export function SkeletonCard({ className }: { className?: string }) {
  return (
    <View
      importantForAccessibility="no-hide-descendants"
      accessibilityElementsHidden
      className={cn('rounded-xl bg-card p-5 shadow-sm shadow-black/5', className)}>
      <Skeleton className="h-3 w-20" />
      <Skeleton className="mt-4 h-8 w-32" />
      <Skeleton className="mt-3 h-3 w-16" />
    </View>
  );
}

export function SkeletonRows({ rows = 5 }: { rows?: number }) {
  return (
    <View
      accessibilityLabel="Loading"
      aria-busy
      className="overflow-hidden rounded-lg"
      style={{ gap: 1 }}>
      {Array.from({ length: rows }).map((_, i) => (
        <View
          key={i}
          importantForAccessibility="no-hide-descendants"
          className="flex-row items-center justify-between bg-card px-4 py-3.5">
          <View className="gap-2">
            <Skeleton className="h-3.5 w-40" />
            <Skeleton className="h-3 w-24" />
          </View>
          <Skeleton className="h-4 w-20" />
        </View>
      ))}
    </View>
  );
}
