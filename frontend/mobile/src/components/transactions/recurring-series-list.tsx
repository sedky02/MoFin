// The Recurring view of the transactions screen: every series once (by its root), with its
// schedule and actions. Same request and wording as the web's recurring-series-list.
import { ThemedRefreshControl } from '@/components/ui/themed-native';
import { router } from 'expo-router';
import * as React from 'react';
import { FlatList, Pressable, View } from 'react-native';

import { MoneyAmount } from '@/components/common/money-amount';
import { EmptyState, ErrorState, SkeletonRows } from '@/components/common/states';
import { RecurringSeriesActions, SeriesPausedNote } from '@/components/transactions/recurring-controls';
import { Button } from '@/components/ui/button';
import { Icon } from '@/components/ui/icon';
import { Text } from '@/components/ui/text';
import { multiply } from '@/core/decimal';
import { formatDate } from '@/core/format';
import {
  seriesAccountLabel,
  seriesAmount,
  seriesIntervalLabel,
  seriesIsActive,
  seriesIsOpen,
  seriesNextOccurrence,
  seriesPausedLabel,
} from '@/core/recurring-series';
import type { Account, Transaction } from '@/core/types';
import { useAccounts } from '@/hooks/useAccounts';
import { useSearchPage, type SearchParams } from '@/hooks/useSearch';
import { usePullToRefresh } from '@/hooks/use-pull-to-refresh';
import { Repeat } from '@/lib/icons';
import { cn } from '@/lib/utils';

// Each series once, by its root (deleted roots never come back): active ones first by their next
// date, then paused, then cancelled.
export const SERIES_QUERY: SearchParams = { recurrence: 'series', sort: 'next-occurrence' };
export const SERIES_PAGE_SIZE = 25;

export function useRecurringSeriesCount(): number | undefined {
  return useSearchPage(SERIES_QUERY, 1, SERIES_PAGE_SIZE).data?.total;
}

export function RecurringSeriesList({ header }: { header: React.ReactElement }) {
  const [page, setPage] = React.useState(1);
  // Archived accounts too, so a series on one still names it.
  const { data: accounts } = useAccounts('all');
  const { data, isLoading, isFetching, isError, refetch } = useSearchPage(SERIES_QUERY, page, SERIES_PAGE_SIZE);
  const pull = usePullToRefresh(refetch);
  const rows = data?.rows ?? [];
  const accountsById = React.useMemo(() => (accounts ? new Map(accounts.map((a) => [a.id, a])) : undefined), [accounts]);

  const empty = isLoading ? (
    <SkeletonRows rows={4} />
  ) : isError ? (
    <ErrorState description="Couldn't load recurring transactions." onRetry={() => refetch()} />
  ) : (
    <EmptyState
      icon={Repeat}
      title="No recurring transactions"
      description="Turn on “Repeat this transaction” when you record one, and its series shows up here."
      action={
        <Button variant="outline" size="lg" onPress={() => router.push('/transactions/new')}>
          <Text>New transaction</Text>
        </Button>
      }
    />
  );

  const footer =
    rows.length > 0 ? (
      <View className="mt-4 flex-row items-center justify-between gap-3">
        <Text role="status" className="shrink text-xs text-muted-foreground" style={{ fontVariant: ['tabular-nums'] }}>
          {data ? `${(page - 1) * SERIES_PAGE_SIZE + 1}–${(page - 1) * SERIES_PAGE_SIZE + rows.length} of ${data.total} series` : `Page ${page}`}
          {isFetching ? ', updating…' : ''}
        </Text>
        {page > 1 || data?.hasNext ? (
          <View className="flex-row gap-2">
            <Button variant="outline" className="min-h-11" accessibilityLabel="Previous page" disabled={page <= 1} onPress={() => setPage((p) => Math.max(1, p - 1))}>
              <Text>Previous</Text>
            </Button>
            <Button variant="outline" className="min-h-11" accessibilityLabel="Next page" disabled={!data?.hasNext} onPress={() => setPage((p) => p + 1)}>
              <Text>Next</Text>
            </Button>
          </View>
        ) : null}
      </View>
    ) : undefined;

  return (
    <FlatList
      data={rows}
      keyExtractor={(tx) => tx.id}
      ListHeaderComponent={header}
      ListEmptyComponent={empty}
      ListFooterComponent={footer}
      renderItem={({ item, index }) => (
        <View className={cn('overflow-hidden', index === 0 && 'rounded-t-2xl', index === rows.length - 1 && 'rounded-b-2xl')}>
          <SeriesRow tx={item} accountsById={accountsById} last={index === rows.length - 1} />
        </View>
      )}
      refreshControl={<ThemedRefreshControl refreshing={pull.refreshing} onRefresh={pull.onRefresh} />}
      keyboardShouldPersistTaps="handled"
      className="flex-1 bg-background"
      contentContainerClassName="mx-auto w-full max-w-3xl p-4"
      accessibilityLabel="Recurring series"
    />
  );
}

function SeriesRow({ tx, accountsById, last }: { tx: Transaction; accountsById?: ReadonlyMap<string, Account>; last: boolean }) {
  const active = seriesIsActive(tx);
  const open = seriesIsOpen(tx);
  const next = seriesNextOccurrence(tx);
  const pausedLabel = seriesPausedLabel(tx);
  const accountLabel = seriesAccountLabel(tx, accountsById);
  const amount = seriesAmount(tx);

  return (
    <View className={cn('gap-3 bg-card px-4 py-3.5', !last && 'border-b border-border/60')}>
      <View className="flex-row items-start gap-3">
        <View className="size-11 items-center justify-center rounded-xl bg-muted">
          <Icon as={Repeat} size={20} aria-hidden className="text-foreground/70" />
        </View>
        <View className="min-w-0 flex-1">
          <Pressable role="link" accessibilityLabel={`${tx.description}, open`} onPress={() => router.push(`/transactions/${tx.id}`)} className="min-h-11 justify-center">
            <Text numberOfLines={1} className="text-sm font-medium">
              {tx.description}
            </Text>
          </Pressable>
          {/* How often it repeats, the account, and when it posts next. */}
          <Text className="text-xs text-muted-foreground">
            <Text className={cn('text-xs', active && 'font-medium text-foreground/80')}>
              {seriesIntervalLabel(tx)}
              {open ? '' : ' · Cancelled'}
            </Text>
            {' · '}
            {accountLabel ?? 'Loading account…'}
            {next ? ` · Next on ${formatDate(next)}` : ''}
            {open && tx.recurringEndDate ? ` · Ends ${formatDate(tx.recurringEndDate)}` : ''}
          </Text>
          {pausedLabel ? <SeriesPausedNote label={pausedLabel} className="mt-1" /> : null}
        </View>
        {/* What each coming occurrence posts (the template, which an edit can change). */}
        <MoneyAmount
          amount={tx.type === 'EXPENSE' ? multiply(amount, '-1') : amount}
          currency={tx.currency}
          signed={tx.type === 'INCOME'}
          className="text-right text-sm font-semibold"
        />
      </View>
      {open ? <RecurringSeriesActions tx={tx} /> : null}
    </View>
  );
}
