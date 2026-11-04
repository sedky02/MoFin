// The Transactions tab: every transaction (search, filters, day groups, more loaded as you scroll)
// and the recurring series, like the web's /transactions page (which pages by number instead). Filter state lives here; the rules for
// turning it into a query, chips and counts are in transactions-list-model.
import * as React from 'react';
import { ActivityIndicator, FlatList, Platform, Pressable, RefreshControl, View } from 'react-native';

import { EmptyState, ErrorState, SkeletonRows } from '@/components/common/states';
import { FilterSheet } from '@/components/transactions/filter-sheet';
import { RecurringSeriesList, useRecurringSeriesCount } from '@/components/transactions/recurring-series-list';
import { categoryOptions, PickerField } from '@/components/transactions/transaction-form-fields';
import { TransactionRow } from '@/components/transactions/transaction-row';
import {
  buildChips,
  clearChip,
  EMPTY_FILTERS,
  groupsByDay,
  hasActiveFilters,
  loadedSummary,
  PAGE_SIZE,
  panelFilterCount,
  toSearchParams,
  type FilterChip,
  type ListFilters,
} from '@/components/transactions/transactions-list-model';
import { Button } from '@/components/ui/button';
import { Icon } from '@/components/ui/icon';
import { Input } from '@/components/ui/input';
import { Text } from '@/components/ui/text';
import { transactionAccountLabel } from '@/core/transaction-accounts';
import { accountOptionLabel, type TransactionsView } from '@/core/transaction-list-params';
import { groupByDay } from '@/core/transaction-days';
import type { Account, Transaction } from '@/core/types';
import { useAccounts } from '@/hooks/useAccounts';
import { useCategories } from '@/hooks/useCategories';
import { useDebouncedValue } from '@/hooks/use-debounced-value';
import { useSearchTransactions } from '@/hooks/useSearch';
import { usePullToRefresh } from '@/hooks/use-pull-to-refresh';
import { Receipt, Search, SlidersHorizontal, X } from '@/lib/icons';
import { cn } from '@/lib/utils';

type ListItem =
  | { kind: 'header'; key: string; label: string }
  | { kind: 'row'; key: string; tx: Transaction; first: boolean; last: boolean; glance: boolean };

/** Drops repeated transactions (same id), keeping the first. */
export function uniqueById(rows: Transaction[]): Transaction[] {
  const seen = new Set<string>();
  return rows.filter((tx) => (seen.has(tx.id) ? false : (seen.add(tx.id), true)));
}

/** Flattens the page into day headings and rows (or just rows when the sort order is not by date). */
export function buildListItems(rows: Transaction[], byDay: boolean, now: Date): ListItem[] {
  if (!byDay) return rows.map((tx, i) => ({ kind: 'row', key: tx.id, tx, first: i === 0, last: i === rows.length - 1, glance: false }));
  const items: ListItem[] = [];
  for (const g of groupByDay(rows, now)) {
    items.push({ kind: 'header', key: `day:${g.key}`, label: g.label });
    g.rows.forEach((tx, i) => items.push({ kind: 'row', key: tx.id, tx, first: i === 0, last: i === g.rows.length - 1, glance: true }));
  }
  return items;
}

function ViewToggle({ view, onChange, seriesCount }: { view: TransactionsView; onChange: (v: TransactionsView) => void; seriesCount?: number }) {
  const options: { value: TransactionsView; label: string }[] = [
    { value: 'all', label: 'All' },
    { value: 'recurring', label: seriesCount ? `Recurring ${seriesCount}` : 'Recurring' },
  ];
  return (
    <View role="radiogroup" accessibilityLabel="Transactions view" className="mb-4 flex-row gap-1 self-start rounded-xl bg-secondary/70 p-1">
      {options.map((o) => {
        const selected = view === o.value;
        return (
          <Pressable
            key={o.value}
            role="radio"
            aria-checked={selected}
            accessibilityLabel={o.value === 'recurring' ? 'Recurring' : o.label}
            accessibilityState={{ checked: selected }}
            onPress={() => onChange(o.value)}
            className={cn('min-h-11 min-w-[88px] items-center justify-center rounded-lg px-5', selected && 'bg-card shadow-sm shadow-black/5')}>
            <Text className={cn('text-sm font-medium', !selected && 'text-muted-foreground')}>{o.label}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

function Chips({ chips, onClear, onClearAll }: { chips: FilterChip[]; onClear: (c: FilterChip) => void; onClearAll: () => void }) {
  if (chips.length === 0) return null;
  return (
    <View accessibilityLabel="Active filters" role="group" className="mb-4 flex-row flex-wrap items-center gap-2">
      {chips.map((chip) => (
        <Pressable
          key={chip.key}
          role="button"
          accessibilityLabel={`Remove filter: ${chip.label}`}
          onPress={() => onClear(chip)}
          className="min-h-11 flex-row items-center gap-1.5 rounded-full bg-secondary px-3 active:bg-secondary/70">
          <Text className="text-xs font-medium">{chip.label}</Text>
          <Icon as={X} size={12} aria-hidden className="text-muted-foreground" />
        </Pressable>
      ))}
      <Pressable role="button" accessibilityLabel="Clear all" onPress={onClearAll} className="min-h-11 justify-center px-2">
        <Text className="text-xs font-medium text-muted-foreground underline">Clear all</Text>
      </Pressable>
    </View>
  );
}

export function TransactionsScreen() {
  const [view, setView] = React.useState<TransactionsView>('all');
  const seriesCount = useRecurringSeriesCount();

  const [filters, setFilters] = React.useState<ListFilters>(EMPTY_FILTERS);
  const [sheetOpen, setSheetOpen] = React.useState(false);
  const patch = React.useCallback((p: Partial<ListFilters>) => setFilters((f) => ({ ...f, ...p })), []);

  // Archived accounts too: their history is still filterable, and rows name them.
  const { data: accounts } = useAccounts('all');
  const { data: categories } = useCategories();

  // What is typed is debounced before it reaches the query; chips and the toolbar show it as typed.
  const debouncedQ = useDebouncedValue(filters.q, 350);
  const debouncedMin = useDebouncedValue(filters.minAmount, 350);
  const debouncedMax = useDebouncedValue(filters.maxAmount, 350);
  const effective = React.useMemo<ListFilters>(
    () => ({ ...filters, q: debouncedQ, minAmount: debouncedMin, maxAmount: debouncedMax }),
    [filters, debouncedQ, debouncedMin, debouncedMax],
  );
  const params = React.useMemo(() => toSearchParams(effective, PAGE_SIZE), [effective]);

  // A filter change is a new query key, so the list starts again from the first batch.
  const { data, isLoading, isError, refetch, hasNextPage, isFetchingNextPage, fetchNextPage } = useSearchTransactions(params);
  const pull = usePullToRefresh(refetch);
  const loadMore = React.useCallback(() => {
    if (hasNextPage && !isFetchingNextPage) void fetchNextPage();
  }, [hasNextPage, isFetchingNextPage, fetchNextPage]);

  const hasActive = hasActiveFilters(effective);
  const chips = buildChips(filters, accounts, categories);
  // Offset paging can hand back a row twice when something is added while scrolling; keep the first.
  const rows = React.useMemo(() => uniqueById(data?.pages.flatMap((p) => p.data) ?? []), [data]);
  const total = data?.pages[0]?.total;
  const accountsById = React.useMemo(() => (accounts ? new Map<string, Account>(accounts.map((a) => [a.id, a])) : undefined), [accounts]);
  const items = React.useMemo(() => buildListItems(rows, groupsByDay(filters.sort), new Date()), [rows, filters.sort]);

  function clearAll() {
    setFilters(EMPTY_FILTERS);
  }

  const panelCount = panelFilterCount(filters);
  const header = (
    <View>
      <ViewToggle view={view} onChange={setView} seriesCount={seriesCount} />
      {view === 'all' ? (
        <>
          <View className="mb-3 flex-row flex-wrap gap-2">
            <View className="min-w-[200px] basis-full justify-center">
              <Input
                value={filters.q}
                onChangeText={(v) => patch({ q: v })}
                placeholder="Search descriptions…"
                accessibilityLabel="Search transactions"
                returnKeyType="search"
                autoCapitalize="none"
                autoCorrect={false}
                className="min-h-12 rounded-xl border-0 bg-card pl-10 pr-11"
              />
              <View pointerEvents="none" className="absolute left-3.5">
                <Icon as={Search} size={16} aria-hidden className="text-muted-foreground" />
              </View>
              {filters.q ? (
                <Pressable role="button" accessibilityLabel="Clear search text" onPress={() => patch({ q: '' })} className="absolute right-0 size-12 items-center justify-center">
                  <Icon as={X} size={16} aria-hidden className="text-muted-foreground" />
                </Pressable>
              ) : null}
            </View>
            <View className="min-w-[150px] flex-1">
              <PickerField
                title="Account"
                accessibilityLabel="Account"
                options={(accounts ?? []).map((a) => ({ value: a.id, label: accountOptionLabel(a) }))}
                value={filters.accountId || undefined}
                onChange={(v) => patch({ accountId: v ?? '' })}
                placeholder="All accounts"
                emptyOption="All accounts"
                className="bg-card"
              />
            </View>
            <View className="min-w-[150px] flex-1">
              <PickerField
                title="Category"
                accessibilityLabel="Category"
                options={categoryOptions(categories ?? [])}
                value={filters.categoryId || undefined}
                onChange={(v) => patch({ categoryId: v ?? '' })}
                placeholder="All categories"
                emptyOption="All categories"
                className="bg-card"
              />
            </View>
            <Button
              variant="outline"
              className="min-h-12 basis-full gap-2 bg-card"
              accessibilityLabel={panelCount > 0 ? `More filters, ${panelCount} active` : 'More filters'}
              onPress={() => setSheetOpen(true)}>
              <Icon as={SlidersHorizontal} size={16} aria-hidden />
              <Text>More filters</Text>
              {panelCount > 0 ? (
                <View className="min-w-5 items-center rounded-full bg-primary px-1.5">
                  <Text className="text-xs font-semibold text-primary-foreground" style={{ fontVariant: ['tabular-nums'] }}>
                    {panelCount}
                  </Text>
                </View>
              ) : null}
            </Button>
          </View>
          <Chips chips={chips} onClear={(c) => setFilters((f) => clearChip(f, c))} onClearAll={clearAll} />
        </>
      ) : null}
    </View>
  );

  if (view === 'recurring') return <RecurringSeriesList header={header} />;

  const empty = isLoading ? (
    <SkeletonRows rows={6} />
  ) : isError ? (
    <ErrorState description="Couldn't load transactions." onRetry={() => refetch()} />
  ) : (
    <EmptyState
      icon={hasActive ? Search : Receipt}
      title={hasActive ? 'No transactions match' : 'No transactions yet'}
      description={hasActive ? 'Try widening your filters or clearing them.' : 'Record a transaction to see it here.'}
      action={
        hasActive ? (
          <Button variant="outline" size="lg" onPress={clearAll}>
            <Text>Clear filters</Text>
          </Button>
        ) : undefined
      }
    />
  );

  const footer =
    rows.length > 0 ? (
      <View className="mt-4 items-center gap-3">
        {isFetchingNextPage ? <ActivityIndicator accessibilityLabel="Loading more transactions" /> : null}
        {/* Scrolling loads more by itself; the button is for screen readers, keyboards and short lists. */}
        {hasNextPage && !isFetchingNextPage ? (
          <Button variant="outline" className="min-h-11 bg-card" accessibilityLabel="Load more transactions" onPress={loadMore}>
            <Text>Load more</Text>
          </Button>
        ) : null}
        <Text role="status" className="text-xs text-muted-foreground" style={{ fontVariant: ['tabular-nums'] }}>
          {loadedSummary(rows.length, total)}
        </Text>
      </View>
    ) : undefined;

  return (
    <>
      <FlatList
        data={items}
        keyExtractor={(item) => item.key}
        ListHeaderComponent={header}
        ListEmptyComponent={empty}
        ListFooterComponent={footer}
        renderItem={({ item }) =>
          item.kind === 'header' ? (
            <Text role="heading" aria-level={2} className="mb-2 mt-4 px-1 text-sm font-semibold text-muted-foreground">
              {item.label}
            </Text>
          ) : (
            <View className={cn('overflow-hidden', item.first && 'rounded-t-2xl', item.last && 'rounded-b-2xl')}>
              <TransactionRow tx={item.tx} variant={item.glance ? 'glance' : 'default'} accountLabel={transactionAccountLabel(item.tx, accountsById)} last={item.last} />
            </View>
          )
        }
        refreshControl={<RefreshControl refreshing={pull.refreshing} onRefresh={pull.onRefresh} />}
        onEndReached={loadMore}
        onEndReachedThreshold={0.5}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="on-drag"
        // Batches of 25 accumulate as you scroll: render a screenful first and keep the window small.
        initialNumToRender={12}
        windowSize={7}
        removeClippedSubviews={Platform.OS === 'android'}
        className="flex-1 bg-background"
        contentContainerClassName="mx-auto w-full max-w-3xl p-4"
        accessibilityLabel="Transactions"
      />
      <FilterSheet open={sheetOpen} onOpenChange={setSheetOpen} filters={filters} onChange={patch} onClear={clearAll} hasActive={hasActive} />
    </>
  );
}
