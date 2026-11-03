import { router } from 'expo-router';
import { ChevronLeft, ChevronRight, PieChart, RotateCcw } from 'lucide-react-native';
import * as React from 'react';
import { Pressable, View } from 'react-native';

import { MoneyAmount } from '@/components/common/money-amount';
import { EmptyState, ErrorState } from '@/components/common/states';
import { CategoryIcon } from '@/components/dashboard/category-icon';
import { buildSegments, donutDescription, monthTitle, shiftMonth } from '@/components/dashboard/dashboard-logic';
import { SummarySkeleton } from '@/components/dashboard/dashboard-skeleton';
import { CurrencySwitch } from '@/components/dashboard/currency-switch';
import { Donut } from '@/components/dashboard/donut';
import { CHART_RAMP, useChartColors } from '@/components/dashboard/use-chart-colors';
import { Button } from '@/components/ui/button';
import { Icon } from '@/components/ui/icon';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Text } from '@/components/ui/text';
import { summaryApiCurrency, summaryCurrencyOptions } from '@/core/dashboard-scope';
import { subtract, tryParse } from '@/core/decimal';
import { cn } from '@/lib/utils';
import { useAccounts } from '@/hooks/useAccounts';
import { useMonthlySummary } from '@/hooks/useAnalytics';
import { useMainAccount } from '@/hooks/useMainAccount';

type Kind = 'expense' | 'income';

function ArrowButton({ icon, label, onPress, disabled, hidden }: { icon: typeof ChevronLeft; label: string; onPress: () => void; disabled?: boolean; hidden?: boolean }) {
  return (
    <Pressable
      role="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled }}
      disabled={disabled || hidden}
      onPress={onPress}
      importantForAccessibility={hidden ? 'no-hide-descendants' : 'auto'}
      accessibilityElementsHidden={hidden}
      className={cn('size-11 items-center justify-center rounded-full active:bg-secondary', disabled && 'opacity-35', hidden && 'opacity-0')}>
      <Icon as={icon} size={18} aria-hidden />
    </Pressable>
  );
}

export function MonthlySummaryCard({
  year,
  month,
  currency,
  currencies = [],
  onCurrencyChange,
  accountId,
}: {
  year: number;
  month: number;
  /** Currency shown for an all-accounts view (shared with the balance hero). */
  currency: string;
  currencies?: string[];
  onCurrencyChange?: (currency: string) => void;
  accountId?: string;
}) {
  const colors = useChartColors();
  const { data: accounts = [] } = useAccounts();
  const { accountId: mainAccountId } = useMainAccount();
  const [kind, setKind] = React.useState<Kind>('expense');
  const [offset, setOffset] = React.useState(0);
  const viewed = shiftMonth(year, month, offset);

  const apiCurrency = summaryApiCurrency(accountId, currency);
  const { data, isLoading, isError, refetch } = useMonthlySummary(viewed.year, viewed.month, accountId, apiCurrency);

  const scopedAccount = accounts.find((a) => a.id === accountId);
  const scopedCurrency = scopedAccount?.currency ?? currency;
  const title = monthTitle(viewed.year, viewed.month);
  const scopeLabel = scopedAccount ? `${scopedAccount.name}${scopedAccount.id === mainAccountId ? ' · Main account' : ''}` : 'All accounts';

  const isExpense = kind === 'expense';
  const noun = isExpense ? 'spending' : 'income';
  const raw = (data && (isExpense ? data.categoryBreakdown : data.incomeBreakdown)) ?? [];
  const total = (data && (isExpense ? data.expenses : data.income)) ?? '0';
  const segments = buildSegments(raw);
  const colorOf = (i: number) => (i < 0 ? colors['muted-foreground'] : colors[CHART_RAMP[i % CHART_RAMP.length]]);

  const net = data ? subtract(data.income, data.expenses) : '0';
  const incomeValue = tryParse(data?.income ?? '0')?.toNumber() ?? 0;
  const expensesValue = tryParse(data?.expenses ?? '0')?.toNumber() ?? 0;
  const netValue = tryParse(net)?.toNumber() ?? 0;
  const savedPct = Math.round((tryParse(data?.savingsRate ?? '0')?.toNumber() ?? 0) * 100);
  const tone = (v: number, nonZero: string) => (v === 0 ? 'text-foreground' : nonZero);
  const otherActive = !accountId && onCurrencyChange ? (data?.activeCurrencies ?? []).filter((c) => c !== currency) : [];
  const isPastMonth = offset > 0;

  const switchOptions =
    !accountId && onCurrencyChange
      ? summaryCurrencyOptions(currencies, data?.activeCurrencies ?? [], currency).map((code) => ({
          code,
          activity: code !== currency && (data?.activeCurrencies ?? []).includes(code),
        }))
      : [];

  let body: React.ReactNode;
  if (isLoading) {
    body = <SummarySkeleton />;
  } else if (isError || !data) {
    body = (
      <View className="mt-4">
        <ErrorState description="Couldn't load this month's summary." onRetry={() => refetch()} />
      </View>
    );
  } else {
    body = (
      <>
        <View className="mt-4 h-[148px] justify-between rounded-xl bg-muted/35 px-4 py-3 dark:bg-muted">
          <View>
            <Text className="text-xs text-muted-foreground">
              Net{incomeValue > 0 ? ' · ' : ''}
              {incomeValue > 0 ? (
                savedPct >= 0 ? (
                  <Text className="text-xs text-muted-foreground">{savedPct}% saved</Text>
                ) : (
                  <Text className="text-xs text-destructive">Overspent</Text>
                )
              ) : null}
            </Text>
            <MoneyAmount
              amount={net}
              currency={scopedCurrency}
              className={cn('text-3xl font-semibold tracking-tight', tone(netValue, netValue < 0 ? 'text-destructive' : 'text-success'))}
            />
            <Text className="text-xs text-muted-foreground">income − expenses, excl. transfers</Text>
          </View>
          <View className="flex-row gap-3 border-t border-border pt-3">
            <View className="flex-1">
              <Text className="text-xs text-muted-foreground">Income</Text>
              <MoneyAmount amount={data.income} currency={scopedCurrency} className={cn('text-sm font-semibold', tone(incomeValue, 'text-success'))} />
            </View>
            <View className="flex-1">
              <Text className="text-xs text-muted-foreground">Expenses</Text>
              <MoneyAmount amount={data.expenses} currency={scopedCurrency} className={cn('text-sm font-semibold', tone(expensesValue, 'text-destructive'))} />
            </View>
          </View>
        </View>

        <View className="mt-4 min-h-[220px] justify-center">
          {segments.length === 0 ? (
            <EmptyState
              icon={PieChart}
              title={`No ${noun} recorded`}
              className="border-0 bg-transparent px-2 py-4"
              description={
                otherActive.length > 0
                  ? `Nothing in ${currency} for ${title}, but ${otherActive.join(' and ')} ${otherActive.length > 1 ? 'have' : 'has'} activity.`
                  : isPastMonth
                    ? `Nothing was recorded in ${title}.`
                    : isExpense
                      ? 'Record an expense to populate this month.'
                      : 'Record income to see where it comes from this month.'
              }
              action={
                otherActive.length > 0 ? (
                  <Button size="lg" variant="secondary" onPress={() => onCurrencyChange?.(otherActive[0])}>
                    <Text>Show {otherActive[0]}</Text>
                  </Button>
                ) : isPastMonth ? (
                  <Button size="lg" variant="secondary" onPress={() => setOffset(0)}>
                    <Text>Back to this month</Text>
                  </Button>
                ) : accounts.length === 0 ? undefined : (
                  <Button size="lg" onPress={() => router.push('/transactions/new')}>
                    <Text>{isExpense ? 'Record an expense' : 'Record income'}</Text>
                  </Button>
                )
              }
            />
          ) : (
            <View className="items-center gap-5">
              <Donut
                segments={segments.map((s) => ({ value: s.value, color: colorOf(s.colorIndex) }))}
                accessibilityLabel={donutDescription(isExpense ? 'Spending' : 'Income', segments)}
                center={
                  <>
                    <Text className="text-xs text-muted-foreground">Total {noun}</Text>
                    <MoneyAmount amount={total} currency={scopedCurrency} compact={total.length > 9} className="mt-0.5 text-base font-semibold text-foreground" />
                  </>
                }
              />
              <View className="w-full gap-2.5">
                {segments.map((s) => (
                  <View key={s.label} accessible accessibilityLabel={`${s.label}, ${s.share} percent`} className="flex-row items-center gap-3">
                    <View className="size-9 items-center justify-center rounded-xl" style={{ backgroundColor: `${colorOf(s.colorIndex)}29` }}>
                      <CategoryIcon name={s.label} size={16} color={colorOf(s.colorIndex)} />
                    </View>
                    <Text numberOfLines={1} className="min-w-0 flex-1 text-sm font-medium">
                      {s.label}
                    </Text>
                    <View className="items-end">
                      <MoneyAmount amount={s.amount} currency={scopedCurrency} className="text-sm font-semibold text-foreground" />
                      <Text style={{ fontVariant: ['tabular-nums'] }} className="text-xs text-muted-foreground">
                        {s.share}%
                      </Text>
                    </View>
                  </View>
                ))}
              </View>
            </View>
          )}
        </View>
      </>
    );
  }

  return (
    <View className="rounded-2xl bg-card p-5 shadow-sm shadow-black/5">
      <Text role="heading" aria-level={2} className="text-xs font-semibold uppercase tracking-wider text-foreground">
        Monthly summary
      </Text>
      <Tabs value={kind} onValueChange={(v) => setKind(v as Kind)} className="mt-3">
        <TabsList accessibilityLabel="Breakdown type" className="h-12 w-full">
          <TabsTrigger value="expense" className="min-h-11 flex-1" accessibilityLabel="Expenses">
            <Text>Expenses</Text>
          </TabsTrigger>
          <TabsTrigger value="income" className="min-h-11 flex-1" accessibilityLabel="Income">
            <Text>Income</Text>
          </TabsTrigger>
        </TabsList>
      </Tabs>
      <View className="mt-2 flex-row items-center justify-between">
        <ArrowButton icon={ChevronLeft} label="Previous month" onPress={() => setOffset((o) => o + 1)} />
        <Text accessibilityLiveRegion="polite" className="flex-1 text-center text-base font-semibold">
          {title}
        </Text>
        <ArrowButton icon={ChevronRight} label="Next month" disabled={offset === 0} onPress={() => setOffset((o) => Math.max(0, o - 1))} />
        <ArrowButton icon={RotateCcw} label="Back to this month" hidden={offset === 0} onPress={() => setOffset(0)} />
      </View>
      <Text numberOfLines={1} className="text-center text-xs text-muted-foreground">
        {scopeLabel}
      </Text>
      {switchOptions.length > 1 ? (
        <View className="mt-2 items-center">
          <CurrencySwitch currencies={switchOptions} value={currency} onChange={(c) => onCurrencyChange?.(c)} />
        </View>
      ) : null}
      {body}
    </View>
  );
}
