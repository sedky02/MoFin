import { View } from 'react-native';

import { TYPE_ICON } from '@/components/common/account-type-picker';
import { MoneyAmount } from '@/components/common/money-amount';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Icon } from '@/components/ui/icon';
import { Skeleton } from '@/components/ui/skeleton';
import { Text } from '@/components/ui/text';
import { tryParse } from '@/core/decimal';
import type { Account } from '@/core/types';
import { useLedgerBalance } from '@/hooks/useLedger';
import { AlertTriangle, Archive, ArchiveRestore, Pencil } from '@/lib/icons';
import { cn } from '@/lib/utils';

/** One account as its own card: type tile, name and currency, balance, and its actions. */
export function AccountRow({
  account,
  onEdit,
  onArchive,
  onRestore,
  busy = false,
}: {
  account: Account;
  onEdit?: (account: Account) => void;
  onArchive?: (account: Account) => void;
  onRestore?: (account: Account) => void;
  busy?: boolean;
}) {
  // A failed request is shown as an error, never as a balance of 0. An empty result is an
  // account with no ledger entries yet, which really is 0.
  const { data, isLoading, isError, refetch } = useLedgerBalance({ accountId: account.id });
  const balance = data?.find((b) => b.key === account.currency)?.balance ?? data?.[0]?.balance ?? '0';
  const isZero = tryParse(balance)?.isZero() ?? false;

  return (
    <Card aria-busy={busy || undefined} className={cn('gap-3 border-0 p-4', busy && 'opacity-60')}>
      <View className="flex-row items-center gap-3">
        <View aria-hidden className="size-10 items-center justify-center rounded-xl bg-secondary">
          <Icon as={TYPE_ICON[account.type]} size={20} className="text-muted-foreground" />
        </View>
        <View className="min-w-0 flex-1">
          <Text numberOfLines={1} className="text-sm font-medium">
            {account.name}
          </Text>
          <Text className="text-xs text-muted-foreground">{account.currency}</Text>
        </View>
        {onRestore ? (
          <Button
            variant="ghost"
            disabled={busy}
            onPress={() => onRestore(account)}
            accessibilityLabel={`Restore ${account.name}`}
            className="min-h-11 gap-1.5">
            <Icon as={ArchiveRestore} size={16} className="text-muted-foreground" />
            <Text className="text-muted-foreground">Restore</Text>
          </Button>
        ) : (
          <View className="-mr-2 flex-row items-center">
            {onEdit ? (
              <Button
                variant="ghost"
                size="icon"
                className="size-11"
                onPress={() => onEdit(account)}
                accessibilityLabel={`Edit ${account.name}`}>
                <Icon as={Pencil} size={16} className="text-muted-foreground" />
              </Button>
            ) : null}
            {onArchive ? (
              <Button
                variant="ghost"
                size="icon"
                className="size-11"
                onPress={() => onArchive(account)}
                accessibilityLabel={`Archive ${account.name}`}>
                <Icon as={Archive} size={16} className="text-muted-foreground" />
              </Button>
            ) : null}
          </View>
        )}
      </View>

      {isLoading ? (
        <Skeleton className="h-8 w-36" />
      ) : isError ? (
        <View role="alert" className="min-h-8 flex-row flex-wrap items-center gap-x-2">
          <Icon as={AlertTriangle} size={16} aria-hidden className="text-destructive" />
          <Text className="text-sm text-destructive">Couldn&apos;t load balance</Text>
          <Button
            variant="ghost"
            className="min-h-11"
            onPress={() => refetch()}
            accessibilityLabel={`Retry loading the balance of ${account.name}`}>
            <Text>Retry</Text>
          </Button>
        </View>
      ) : (
        <MoneyAmount
          amount={balance}
          currency={account.currency}
          // Zero is neither good nor bad: plain text, not green.
          colorBySign={!isZero}
          className="text-2xl font-semibold leading-8"
        />
      )}
    </Card>
  );
}
