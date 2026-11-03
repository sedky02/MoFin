import { router } from 'expo-router';
import { ChevronRight, Repeat } from 'lucide-react-native';
import * as React from 'react';
import { Pressable, View } from 'react-native';

import { MoneyAmount } from '@/components/common/money-amount';
import { CategoryIcon } from '@/components/dashboard/category-icon';
import { Icon } from '@/components/ui/icon';
import { Text } from '@/components/ui/text';
import { multiply } from '@/core/decimal';
import { formatDate, transactionAmount } from '@/core/format';
import { transactionCategorySummary } from '@/core/transaction-category';
import type { Transaction } from '@/core/types';
import { cn } from '@/lib/utils';

const TILE: Record<Transaction['type'], string> = {
  INCOME: 'bg-success/15',
  EXPENSE: 'bg-destructive/10',
  TRANSFER: 'bg-muted',
};

/** The row's one-line description for screen readers and its muted line. */
export function rowMeta(tx: Transaction, accountLabel: string | undefined, withDate: boolean): string {
  const filed = transactionCategorySummary(tx);
  const showCategory = !!tx.category || tx.type !== 'TRANSFER';
  return [
    showCategory ? `${filed.split ? 'Split · ' : ''}${filed.label}` : null,
    withDate ? formatDate(tx.occurredAt) : null,
    accountLabel,
  ]
    .filter(Boolean)
    .join(' · ');
}

/**
 * A transaction in a list. Expenses show negative, income with a "+", a transfer unsigned.
 * `glance` is for lists already grouped under a day heading, so the row carries no date.
 */
function TransactionRowView({
  tx,
  accountLabel,
  variant = 'default',
  last,
}: {
  tx: Transaction;
  accountLabel?: string;
  variant?: 'default' | 'glance';
  /** The last row of a panel has no divider. */
  last?: boolean;
}) {
  const base = transactionAmount(tx);
  const shown = tx.type === 'EXPENSE' ? multiply(base, '-1') : base;
  const filed = transactionCategorySummary(tx);
  const recurring = tx.isRecurring || !!tx.parentTransactionId;
  const meta = rowMeta(tx, accountLabel, variant === 'default');
  return (
    <Pressable
      role="link"
      accessibilityLabel={`${tx.description}, ${meta}${recurring ? ', recurring' : ''}`}
      onPress={() => router.push(`/transactions/${tx.id}`)}
      className={cn('min-h-[68px] flex-row items-center gap-3 bg-card px-4 py-3 active:bg-secondary', !last && 'border-b border-border/60')}>
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
      <Icon as={ChevronRight} size={16} aria-hidden className="text-muted-foreground/50" />
    </Pressable>
  );
}

/** Memoised: a list re-renders on every filter keystroke, and rows only change when their transaction does. */
export const TransactionRow = React.memo(TransactionRowView);
