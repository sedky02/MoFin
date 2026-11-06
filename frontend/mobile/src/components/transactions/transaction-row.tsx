import { router } from 'expo-router';
import * as React from 'react';
import { Pressable, View } from 'react-native';

import { MoneyAmount } from '@/components/common/money-amount';
import { CategoryGlyphIcon, categoryTint } from '@/components/categories/category-glyph';
import { Icon } from '@/components/ui/icon';
import { Text } from '@/components/ui/text';
import { multiply } from '@/core/decimal';
import { formatDate, transactionAmount } from '@/core/format';
import { transactionCategorySummary } from '@/core/transaction-category';
import type { Transaction } from '@/core/types';
import { ChevronRight, Repeat } from '@/lib/icons';
import { cn } from '@/lib/utils';

const TILE: Record<Transaction['type'], string> = {
  INCOME: 'bg-success/15',
  EXPENSE: 'bg-destructive/10',
  TRANSFER: 'bg-muted',
};

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
      {/* The category's own colour and icon, as on Categories; the amount carries in/out. */}
      <View
        className={cn('size-11 items-center justify-center rounded-xl', !categoryTint(filed.category?.color) && TILE[tx.type])}
        style={{ backgroundColor: categoryTint(filed.category?.color) }}>
        <CategoryGlyphIcon category={filed.category} fallbackName={tx.description} size={20} color={filed.category?.color ?? undefined} />
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
