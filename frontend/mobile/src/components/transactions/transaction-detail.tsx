import { router, Stack } from 'expo-router';
import { ThemedRefreshControl } from '@/components/ui/themed-native';
import * as React from 'react';
import { Pressable, ScrollView, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { ApiClientError } from '@/api/client';
import { ConfirmDialog } from '@/components/common/confirm-dialog';
import { MoneyAmount } from '@/components/common/money-amount';
import { ErrorState, SkeletonCard } from '@/components/common/states';
import { RecurringPanel } from '@/components/transactions/recurring-controls';
import { CategoryGlyph } from '@/components/transactions/transaction-form-fields';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Icon } from '@/components/ui/icon';
import { Skeleton } from '@/components/ui/skeleton';
import { Text } from '@/components/ui/text';
import { formatDateTime, transactionAmount } from '@/core/format';
import { TYPE_OPTIONS } from '@/core/transaction-list-params';
import { ledgerAccountName, transactionAccountLegs } from '@/core/transaction-accounts';
import type { Account, LedgerItem, Transaction } from '@/core/types';
import { useAccounts } from '@/hooks/useAccounts';
import { useUser } from '@/hooks/useUser';
import { authorLine } from '@/core/account-sharing';
import { useDeleteTransaction, useTransaction } from '@/hooks/useTransactions';
import { ArrowDown, ArrowDownLeft, ArrowUpRight, ChevronRight, Pencil, Repeat, Trash2 } from '@/lib/icons';

export function leaveToList() {
  if (router.canGoBack()) router.back();
  else router.replace('/transactions');
}

/** A 404 (or a missing body) is "not found"; any other failure is worth a retry. */
export function isNotFound(isError: boolean, error: unknown, tx: Transaction | undefined): boolean {
  return !tx && (!isError || (error instanceof ApiClientError && error.status === 404));
}

export function deleteDescription(tx: Pick<Transaction, 'isRecurring' | 'parentTransactionId'>): string {
  return tx.isRecurring && !tx.parentTransactionId
    ? "It's removed from your balances, summaries and goals, and the recurring series stops. Transactions the series already created stay. You can undo this right after."
    : "It's removed from your balances, summaries and goals. You can undo this right after.";
}

export function TransactionDetail({ id }: { id: string }) {
  // After a delete the screen goes back; Undo in the toast brings the user back here.
  const deleteMut = useDeleteTransaction({ onUndone: (undoneId) => router.push(`/transactions/${undoneId}`) });
  const [confirmDelete, setConfirmDelete] = React.useState(false);
  const { data: tx, isLoading, isError, error, refetch, isRefetching } = useTransaction(id);
  const insets = useSafeAreaInsets();

  // Older responses carried legs without their account: the account list resolves those, with
  // archived accounts included. It also says which accounts are shared, for who entered this.
  const accountsQuery = useAccounts('all');
  const { data: user } = useUser();
  const accountsById = React.useMemo<ReadonlyMap<string, Account> | undefined>(() => {
    if (accountsQuery.data) return new Map(accountsQuery.data.map((a) => [a.id, a]));
    // A failed lookup resolves to "Deleted account" rather than a spinner forever.
    return accountsQuery.isError ? new Map() : undefined;
  }, [accountsQuery.data, accountsQuery.isError]);

  const title = <Stack.Screen options={{ title: 'Transaction' }} />;

  if (isLoading) {
    return (
      <View className="flex-1 bg-background p-4" accessibilityLabel="Loading transaction" aria-busy>
        {title}
        <Skeleton className="mb-4 h-6 w-40" />
        <SkeletonCard className="h-40" />
      </View>
    );
  }

  if (!tx) {
    const notFound = isNotFound(isError, error, tx);
    return (
      <View className="flex-1 bg-background p-4">
        {title}
        {notFound ? (
          <ErrorState
            title="Transaction not found"
            description="This transaction may have been removed or never existed."
            action={
              <Button size="lg" onPress={leaveToList} accessibilityLabel="Back to transactions">
                <Text>Back to transactions</Text>
              </Button>
            }
          />
        ) : (
          <ErrorState description="Couldn't load this transaction." onRetry={() => refetch()} />
        )}
      </View>
    );
  }

  const legs = transactionAccountLegs(tx);
  const nameOf = (item: LedgerItem | undefined) => (item ? (ledgerAccountName(item, accountsById) ?? 'Loading account…') : undefined);
  const singleAccountLeg = legs.from ?? legs.to;
  const typeLabel = TYPE_OPTIONS.find((o) => o.value === tx.type)?.label ?? tx.type;
  const base = transactionAmount(tx);

  return (
    <ScrollView
      className="flex-1 bg-background"
      contentContainerClassName="mx-auto w-full max-w-2xl gap-4 p-4"
      contentContainerStyle={{ paddingBottom: 16 + insets.bottom }}
      refreshControl={<ThemedRefreshControl refreshing={isRefetching} onRefresh={async () => void (await refetch())} />}>
      {title}

      <View className="rounded-2xl bg-card p-5 shadow-sm shadow-black/5">
        <View className="flex-row items-start justify-between gap-4">
          <View className="min-w-0 flex-1 items-start">
            <Badge variant="secondary">
              <Text>{typeLabel}</Text>
            </Badge>
            <Text role="heading" aria-level={1} className="mt-3 text-xl font-semibold">
              {tx.description}
            </Text>
            <Text className="mt-1 text-sm text-muted-foreground" style={{ fontVariant: ['tabular-nums'] }}>
              {formatDateTime(tx.occurredAt)}
            </Text>
          </View>
          <MoneyAmount
            amount={tx.type === 'EXPENSE' ? `-${base}` : base}
            currency={tx.currency}
            colorBySign={tx.type !== 'TRANSFER'}
            className="shrink-0 text-2xl font-semibold"
          />
        </View>

        {tx.type === 'TRANSFER' || singleAccountLeg || (tx.category && tx.items.length <= 1) ? (
          <View className="mt-4 gap-3 border-t border-border pt-4">
            {tx.type === 'TRANSFER' ? (
              <View className="gap-2">
                <AccountTile label="From" name={nameOf(legs.from)} />
                <Icon as={ArrowDown} size={16} aria-hidden className="self-center text-muted-foreground" />
                <AccountTile label="To" name={nameOf(legs.to)} />
              </View>
            ) : null}
            {tx.type !== 'TRANSFER' && singleAccountLeg ? (
              <View className="flex-row flex-wrap items-center gap-x-2">
                <Text className="text-sm text-muted-foreground">Account</Text>
                <Text className="text-sm font-medium">{nameOf(singleAccountLeg)}</Text>
              </View>
            ) : null}
            {tx.category && tx.items.length <= 1 ? (
              <View className="flex-row items-center gap-2">
                <Text className="text-sm text-muted-foreground">Category</Text>
                <CategoryGlyph category={tx.category} size={16} />
                <Text className="text-sm font-medium">{tx.category.name}</Text>
              </View>
            ) : null}
          </View>
        ) : null}

        {tx.items.some((item) => accountsById?.get(item.accountId)?.isShared) && authorLine(tx, user?.id) ? (
          <Text className="mt-3 text-xs text-muted-foreground">{authorLine(tx, user?.id)}</Text>
        ) : null}

        {/* Someone with the right role can change it or remove it. */}
        {tx.canEdit !== false ? (
        <View className="mt-4 flex-row flex-wrap gap-2 border-t border-border pt-4">
          <Button variant="outline" className="min-h-11 gap-1.5" accessibilityLabel="Edit" testID="transaction-edit" onPress={() => router.push(`/transactions/${tx.id}/edit`)}>
            <Icon as={Pencil} size={16} aria-hidden />
            <Text>Edit</Text>
          </Button>
          <Button
            variant="outline"
            className="min-h-11 gap-1.5"
            accessibilityLabel="Delete"
            testID="transaction-delete"
            disabled={deleteMut.isPending}
            onPress={() => setConfirmDelete(true)}>
            <Icon as={Trash2} size={16} aria-hidden className="text-destructive" />
            <Text className="text-destructive">Delete</Text>
          </Button>
        </View>
        ) : null}

        {/* Recurring series management: only on the root of a series. */}
        {tx.isRecurring && !tx.parentTransactionId ? <RecurringPanel tx={tx} /> : null}

        {/* Generated occurrences just link back to the series they belong to. */}
        {tx.parentTransactionId ? (
          <View className="mt-4 items-start border-t border-border pt-4">
            <Pressable
              role="link"
              accessibilityLabel="Generated from a recurring series"
              onPress={() => router.push(`/transactions/${tx.parentTransactionId}`)}
              className="min-h-11 flex-row items-center gap-1.5 rounded-full border border-border px-3 active:bg-secondary">
              <Icon as={Repeat} size={12} aria-hidden />
              <Text className="text-xs font-medium">Generated from a recurring series</Text>
              <Icon as={ChevronRight} size={12} aria-hidden />
            </Pressable>
          </View>
        ) : null}
      </View>

      <ConfirmDialog
        open={confirmDelete}
        onOpenChange={setConfirmDelete}
        title="Delete this transaction?"
        description={deleteDescription(tx)}
        confirmLabel="Delete transaction"
        onConfirm={() => {
          setConfirmDelete(false);
          deleteMut.mutate(tx.id, { onSuccess: leaveToList });
        }}
      />

      {/* Ledger legs: one per account the money moved out of or into. */}
      <View className="overflow-hidden rounded-2xl bg-card shadow-sm shadow-black/5" accessibilityLabel="Ledger entries">
        <View className="border-b border-border px-5 py-3.5">
          <Text role="heading" aria-level={2} className="text-sm font-semibold">
            Ledger entries
          </Text>
          <Text className="text-xs text-muted-foreground">
            {tx.type === 'TRANSFER' ? 'Money out of one account and into the other.' : 'How this transaction changed your account balance.'}
          </Text>
        </View>
        {tx.items.length === 0 ? (
          <Text className="px-5 py-6 text-center text-sm text-muted-foreground">No ledger entries recorded.</Text>
        ) : (
          tx.items.map((item, i) => (
            <LedgerRow key={item.id} item={item} name={nameOf(item)} split={tx.items.length > 1} description={tx.description} last={i === tx.items.length - 1} />
          ))
        )}
      </View>
    </ScrollView>
  );
}

function AccountTile({ label, name }: { label: string; name?: string }) {
  return (
    <View className="rounded-lg bg-muted/50 px-3 py-2.5">
      <Text className="text-xs font-medium text-muted-foreground">{label}</Text>
      <Text className="mt-0.5 font-medium">{name}</Text>
    </View>
  );
}

function LedgerRow({ item, name, split, description, last }: { item: LedgerItem; name?: string; split: boolean; description: string; last: boolean }) {
  const out = item.direction === 'DEBIT';
  return (
    <View
      accessibilityLabel={`${name}, ${out ? 'Out' : 'In'}${split && item.category ? `, ${item.category.name}` : ''}`}
      className={`flex-row items-start justify-between gap-3 px-5 py-3 ${last ? '' : 'border-b border-border/60'}`}>
      <View className="min-w-0 flex-1 gap-1">
        <Text className="text-sm font-medium">{name}</Text>
        {/* DEBIT = out of the account, CREDIT = into it. Neutral on purpose: a transfer's "out" leg is not a loss. */}
        <View className="flex-row items-center gap-1 self-start rounded-md bg-muted px-2 py-0.5">
          <Icon as={out ? ArrowUpRight : ArrowDownLeft} size={12} aria-hidden />
          <Text className="text-xs font-medium">{out ? 'Out' : 'In'}</Text>
        </View>
        {split ? (
          item.category ? (
            <View className="flex-row items-center gap-1.5">
              <CategoryGlyph category={item.category} size={14} />
              <Text className="text-sm">{item.category.name}</Text>
            </View>
          ) : (
            <Text className="text-sm text-muted-foreground">Uncategorized</Text>
          )
        ) : null}
        {split && item.memo && item.memo !== description ? <Text className="text-xs text-muted-foreground">{item.memo}</Text> : null}
      </View>
      <MoneyAmount amount={item.amount} currency={item.currency} className="text-sm font-medium" />
    </View>
  );
}
