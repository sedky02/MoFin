import * as React from 'react';
import { View } from 'react-native';
import { router } from 'expo-router';

import { MoneyAmount } from '@/components/common/money-amount';
import { EmptyState, ErrorState } from '@/components/common/states';
import { BalanceHeroSkeleton } from '@/components/dashboard/dashboard-skeleton';
import { CurrencySwitch } from '@/components/dashboard/currency-switch';
import { WEEK_CHART_HEIGHT, WeekChart } from '@/components/dashboard/week-chart';
import { HeaderIconButton } from '@/components/shell/header-bar';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Text } from '@/components/ui/text';
import { allAccountsCaption, countArchivedHolding, totalsByCurrency, zeroTotals } from '@/core/balances';
import { tryParse } from '@/core/decimal';
import { pickPrimaryCurrency } from '@/core/format';
import type { HeroMetric } from '@/core/hero-headline';
import { addDaysIso, deviceTimeZone, localIso, mondayOf, weekHeadline, weekRange, weekTitle } from '@/core/week';
import { ChevronLeft, ChevronRight, Wallet } from '@/lib/icons';
import { cn } from '@/lib/utils';
import { useAccounts } from '@/hooks/useAccounts';
import { useDailySeries } from '@/hooks/useAnalytics';
import { useLedgerBalance } from '@/hooks/useLedger';
import { useUser } from '@/hooks/useUser';

const TABS: { value: HeroMetric; label: string }[] = [
  { value: 'expenses', label: 'Expenses' },
  { value: 'income', label: 'Income' },
  { value: 'balance', label: 'Balance' },
];

const isOverdrawn = (amount: string) => tryParse(amount)?.isNegative() ?? false;

/**
 * The balance hero: the balance for the dashboard's account (or all accounts, one currency at a
 * time), a metric switch, a week pager, the change chip and the week's chart (a bar per day). With
 * nothing recorded the chart gives way to `emptyPanel`.
 */
export function BalanceHero({
  accountId,
  accountName,
  currency,
  onCurrencyChange,
  emptyPanel,
}: {
  accountId?: string;
  accountName?: string;
  currency: string;
  onCurrencyChange: (currency: string) => void;
  emptyPanel?: React.ReactNode;
}) {
  const { data, isLoading, isError, refetch } = useLedgerBalance({ accountId });
  const { data: user } = useUser();
  const { data: activeAccounts, isLoading: accountsLoading } = useAccounts();

  if (isLoading || (accountsLoading && !data?.length)) return <BalanceHeroSkeleton />;
  if (isError) return <ErrorState description="Couldn't load your balances." onRetry={() => refetch()} />;

  const primary = pickPrimaryCurrency(data, user, '', activeAccounts);
  const scopedAccounts = (activeAccounts ?? []).filter((a) => !accountId || a.id === accountId);
  // The ledger scoped to one account is keyed by currency alone; totalsByCurrency reads both forms.
  const ledgerTotals = totalsByCurrency((data ?? []).map((b) => ({ key: b.key, balance: b.balance })));
  const noActivity = ledgerTotals.length === 0 && scopedAccounts.length > 0;
  const totals = (noActivity ? zeroTotals(scopedAccounts) : ledgerTotals).sort(
    (a, b) => Number(b.currency === primary) - Number(a.currency === primary),
  );

  if (totals.length === 0) {
    return (
      <EmptyState
        icon={Wallet}
        title="No accounts yet"
        description="Add an account to start tracking your balances."
        action={
          <Button size="lg" onPress={() => router.push('/accounts')}>
            <Text>Add your first account</Text>
          </Button>
        }
      />
    );
  }

  const hero = totals.find((t) => t.currency === currency) ?? totals[0];
  const archivedCount =
    !accountId && activeAccounts
      ? countArchivedHolding(data ?? [], activeAccounts.map((a) => a.id), hero.currency)
      : 0;

  return (
    <HeroCard
      amount={hero.amount}
      currency={hero.currency}
      caption={accountId ? (accountName ?? 'This account') : allAccountsCaption(hero.currency, archivedCount)}
      overdrawn={isOverdrawn(hero.amount)}
      accountId={accountId}
      currencies={totals.map((t) => ({ code: t.currency, overdrawn: isOverdrawn(t.amount) }))}
      onCurrencyChange={onCurrencyChange}
      emptyAction={
        noActivity ? (
          <Button size="lg" onPress={() => router.push('/transactions/new')}>
            <Text>Record your first transaction</Text>
          </Button>
        ) : undefined
      }
      emptyPanel={emptyPanel}
    />
  );
}

function HeroCard({
  amount,
  currency,
  caption,
  overdrawn,
  accountId,
  currencies,
  onCurrencyChange,
  emptyAction,
  emptyPanel,
}: {
  amount: string;
  currency: string;
  caption: string;
  overdrawn: boolean;
  accountId?: string;
  currencies: { code: string; overdrawn: boolean }[];
  onCurrencyChange: (c: string) => void;
  emptyAction?: React.ReactNode;
  emptyPanel?: React.ReactNode;
}) {
  const [metric, setMetric] = React.useState<HeroMetric>('balance');
  const [today] = React.useState(() => localIso(new Date()));
  const [timeZone] = React.useState(deviceTimeZone);
  const thisMonday = mondayOf(today);
  const [monday, setMonday] = React.useState(thisMonday);
  // Two weeks: the one shown and the one before it, for the "vs the week before" chip.
  const { data, isLoading, isError, refetch } = useDailySeries(currency, addDaysIso(monday, -7), 14, timeZone, accountId);
  const all = data?.points ?? [];
  // While the next week loads the previous one stays on screen (dimmed); its figures aren't this week's.
  const ready = all[7]?.date === monday;
  const weekPoints = ready ? all.slice(7) : [];
  const headline = weekHeadline(metric, ready ? all : [], monday, today, { amount, caption });
  const atCurrent = monday === thisMonday;

  return (
    <View className="overflow-hidden rounded-2xl bg-card p-5 shadow-sm shadow-black/5">
      <View className="gap-3">
        {currencies.length > 1 ? (
          <CurrencySwitch currencies={currencies} value={currency} onChange={onCurrencyChange} />
        ) : (
          <Text className="text-xs font-semibold uppercase tracking-wider text-primary-text">{currency} balance</Text>
        )}
        {!emptyPanel ? (
          <Tabs value={metric} onValueChange={(v) => setMetric(v as HeroMetric)}>
            <TabsList accessibilityLabel="Chart metric" className="h-12 w-full">
              {TABS.map((t) => (
                <TabsTrigger key={t.value} value={t.value} className="min-h-11 flex-1" accessibilityLabel={t.label}>
                  <Text>{t.label}</Text>
                </TabsTrigger>
              ))}
            </TabsList>
          </Tabs>
        ) : null}
      </View>

      {!emptyPanel ? (
        <View className="mt-4 flex-row items-center justify-between gap-2">
          <HeaderIconButton icon={ChevronLeft} accessibilityLabel="Previous week" onPress={() => setMonday((m) => addDaysIso(m, -7))} />
          <View accessibilityLiveRegion="polite" className="min-w-0 flex-1 items-center">
            <Text className="text-sm font-semibold">{weekTitle(monday, today)}</Text>
            <Text className="text-xs text-muted-foreground">{weekRange(monday)}</Text>
          </View>
          <HeaderIconButton
            icon={ChevronRight}
            accessibilityLabel="Next week"
            onPress={() => setMonday((m) => addDaysIso(m, 7))}
            // No weeks after this one.
            disabled={atCurrent}
          />
        </View>
      ) : null}

      {!ready && (metric !== 'balance' || !atCurrent) ? (
        <Skeleton className="mt-6 h-12 w-56 rounded-xl" />
      ) : (
        <MoneyAmount
          amount={headline.amount}
          currency={currency}
          className="mt-6 text-5xl font-light leading-tight tracking-tight text-foreground"
        />
      )}
      <Text className="mt-2 text-sm text-muted-foreground">
        {headline.caption}
        {metric === 'balance' && overdrawn ? <Text className="text-sm font-medium text-destructive"> · Overdrawn</Text> : null}
      </Text>
      {emptyAction && !emptyPanel ? <View className="mt-5 items-start">{emptyAction}</View> : null}
      {headline.chip ? (
        <View
          accessibilityLabel={`${headline.chip.prefix ? `${headline.chip.prefix} ` : ''}${headline.chip.delta} ${headline.chip.suffix}`}
          className={cn(
            'mt-3 flex-row items-center gap-1 self-start rounded-full px-3 py-1',
            headline.chip.tone === 'bad' ? 'bg-destructive/15' : 'bg-success/15',
          )}>
          {headline.chip.prefix ? (
            <Text className={cn('text-xs font-medium', headline.chip.tone === 'bad' ? 'text-destructive' : 'text-success')}>
              {headline.chip.prefix}
            </Text>
          ) : null}
          <MoneyAmount
            amount={headline.chip.delta}
            currency={currency}
            signed
            className={cn('text-xs font-medium', headline.chip.tone === 'bad' ? 'text-destructive' : 'text-success')}
          />
          <Text className={cn('text-xs font-medium', headline.chip.tone === 'bad' ? 'text-destructive' : 'text-success')}>
            {headline.chip.suffix}
          </Text>
        </View>
      ) : null}

      {emptyPanel ? (
        <View className="mt-6 border-t border-border pt-5">{emptyPanel}</View>
      ) : isError ? (
        <View className="mt-6">
          <ErrorState description="Couldn't load this week." onRetry={() => refetch()} />
        </View>
      ) : isLoading && !data ? (
        <Skeleton className="mt-6 rounded-xl" style={{ height: WEEK_CHART_HEIGHT + 24 }} />
      ) : (
        <View className="mt-6" style={{ opacity: ready ? 1 : 0.5 }}>
          <WeekChart key={monday} points={ready ? weekPoints : all.slice(7)} metric={metric} currency={currency} today={today} />
        </View>
      )}
    </View>
  );
}
