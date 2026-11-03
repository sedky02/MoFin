import { router } from 'expo-router';
import { ArrowRight, Receipt, Repeat } from 'lucide-react-native';
import { Pressable, View } from 'react-native';

import { MoneyAmount } from '@/components/common/money-amount';
import { EmptyState, ErrorState } from '@/components/common/states';
import { CategoryIcon } from '@/components/dashboard/category-icon';
import { RecentRowsSkeleton } from '@/components/dashboard/dashboard-skeleton';
import { Button } from '@/components/ui/button';
import { Icon } from '@/components/ui/icon';
import { Text } from '@/components/ui/text';
import { DASHBOARD_RECENT_LIMIT } from '@/core/dashboard-scope';
import { multiply } from '@/core/decimal';
import { transactionAmount } from '@/core/format';
import { transactionAccountLabel } from '@/core/transaction-accounts';
import { transactionCategorySummary } from '@/core/transaction-category';
import { groupByDay } from '@/core/transaction-days';
import type { Transaction } from '@/core/types';
import { cn } from '@/lib/utils';
import { useAccounts } from '@/hooks/useAccounts';
import { useRecentTransactions } from '@/hooks/useSearch';

const TILE: Record<Transaction['type'], string> = {
  INCOME: 'bg-success/15',
  EXPENSE: 'bg-destructive/10',
  TRANSFER: 'bg-muted',
};

function Row({ tx, accountLabel }: { tx: Transaction; accountLabel?: string }) {
  const base = transactionAmount(tx);
  const shown = tx.type === 'EXPENSE' ? multiply(base, '-1') : base;
  const filed = transactionCategorySummary(tx);
  const showCategory = !!tx.category || tx.type !== 'TRANSFER';
  const recurring = tx.isRecurring || !!tx.parentTransactionId;
  const meta = [showCategory ? `${filed.split ? 'Split · ' : ''}${filed.label}` : null, accountLabel].filter(Boolean).join(' · ');
  return (
    <Pressable
      role="link"
      accessibilityLabel={`${tx.description}, ${meta}`}
      onPress={() => router.push(`/transactions/${tx.id}`)}
      className="min-h-[68px] flex-row items-center gap-4 px-4 py-3 active:bg-secondary">
      <View className={cn('size-11 items-center justify-center rounded-xl', TILE[tx.type])}>
        <CategoryIcon name={filed.category?.name ?? tx.description} size={20} />
      </View>
      <View className="min-w-0 flex-1">
        <Text numberOfLines={1} className="text-sm font-medium">
          {tx.description}
        </Text>
        <View className="mt-0.5 flex-row items-center gap-1.5">
          <Text numberOfLines={1} className="min-w-0 shrink text-xs text-muted-foreground">
            {meta}
          </Text>
          {recurring ? <Icon as={Repeat} size={12} aria-label="Recurring" className="text-muted-foreground" /> : null}
        </View>
      </View>
      <MoneyAmount amount={tx.type === 'TRANSFER' ? base : shown} currency={tx.currency} signed={tx.type === 'INCOME'} className="text-sm font-semibold" />
    </Pressable>
  );
}

export function RecentTransactions({ accountId }: { accountId?: string }) {
  const { data, isLoading, isError, refetch } = useRecentTransactions(DASHBOARD_RECENT_LIMIT, accountId);
  const { data: accounts } = useAccounts('all');
  const byId = new Map((accounts ?? []).map((a) => [a.id, a]));
  const groups = groupByDay(data ?? [], new Date());

  return (
    <View className="overflow-hidden rounded-2xl bg-card pb-2 shadow-sm shadow-black/5">
      <View className="flex-row items-center justify-between px-5 pb-1 pt-4">
        <Text role="heading" aria-level={2} className="text-xs font-semibold uppercase tracking-wider text-foreground">
          Recent transactions
        </Text>
        <Button variant="ghost" size="sm" className="-mr-2 min-h-11 gap-1" accessibilityLabel="View all transactions" onPress={() => router.push('/transactions')}>
          <Text className="text-xs">View all</Text>
          <Icon as={ArrowRight} size={14} aria-hidden />
        </Button>
      </View>
      {isLoading ? (
        <RecentRowsSkeleton />
      ) : isError ? (
        <View className="p-4">
          <ErrorState description="Couldn't load recent transactions." onRetry={() => refetch()} />
        </View>
      ) : !data || data.length === 0 ? (
        <View className="p-4">
          <EmptyState
            icon={Receipt}
            className="border-0 bg-transparent px-2 py-5"
            title="No transactions yet"
            description="Record your first transaction or describe one in Drafts."
            action={
              accounts && accounts.length === 0 ? (
                <Button size="lg" onPress={() => router.push('/accounts')}>
                  <Text>Create an account first</Text>
                </Button>
              ) : (
                <Button size="lg" onPress={() => router.push('/drafts')}>
                  <Text>Try a draft</Text>
                </Button>
              )
            }
          />
        </View>
      ) : (
        groups.map((g) => (
          <View key={g.key} accessibilityLabel={g.label}>
            <Text role="heading" aria-level={3} className="px-5 pb-1 pt-3 text-xs font-medium text-muted-foreground">
              {g.label}
            </Text>
            {g.rows.map((tx) => (
              <Row key={tx.id} tx={tx} accountLabel={accountId ? undefined : transactionAccountLabel(tx, byId)} />
            ))}
          </View>
        ))
      )}
    </View>
  );
}
