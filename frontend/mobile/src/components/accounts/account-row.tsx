import { View } from 'react-native';

import { TYPE_ICON } from '@/components/common/account-type-picker';
import { LEVEL_ICON } from '@/components/accounts/visibility-sheet';
import { HideableAmount } from '@/components/common/hideable-amount';
import { MoneyAmount } from '@/components/common/money-amount';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Icon } from '@/components/ui/icon';
import { Skeleton } from '@/components/ui/skeleton';
import { Text } from '@/components/ui/text';
import { visibilityOf } from '@/core/account-privacy';
import { canManage, ROLE_LABEL } from '@/core/account-sharing';
import { tryParse } from '@/core/decimal';
import type { Account } from '@/core/types';
import { useLedgerBalance } from '@/hooks/useLedger';
import { AlertTriangle, Archive, ArchiveRestore, Pencil, Users } from '@/lib/icons';
import { cn } from '@/lib/utils';

export function AccountRow({
  account,
  onEdit,
  onOpenVisibility,
  onArchive,
  onRestore,
  onMembers,
  busy = false,
}: {
  account: Account;
  onEdit?: (account: Account) => void;
  onOpenVisibility?: (account: Account) => void;
  onArchive?: (account: Account) => void;
  onRestore?: (account: Account) => void;
  onMembers?: (account: Account) => void;
  busy?: boolean;
}) {
  // A failed request is shown as an error, never as a balance of 0. An empty result is an
  // account with no ledger entries yet, which really is 0.
  const { data, isLoading, isError, refetch } = useLedgerBalance({ accountId: account.id });
  const balance = data?.find((b) => b.key === account.currency)?.balance ?? data?.[0]?.balance ?? '0';
  const isZero = tryParse(balance)?.isZero() ?? false;
  const level = visibilityOf(account);
  // The API refuses these for anyone but the owner; don't offer them.
  const owner = canManage(account);

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
          <View className="flex-row items-center gap-1.5">
            <Text className="text-xs text-muted-foreground">{account.currency}</Text>
            {account.isShared ? (
              <>
                <Text aria-hidden className="text-xs text-muted-foreground">
                  ·
                </Text>
                <Icon as={Users} size={12} aria-hidden className="text-muted-foreground" />
                <Text numberOfLines={1} className="shrink text-xs text-muted-foreground">
                  Shared{account.role ? ` · ${ROLE_LABEL[account.role]}` : ''}
                </Text>
              </>
            ) : null}
          </View>
        </View>
        {onRestore && owner ? (
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
            {onOpenVisibility ? (
              <Button
                variant="ghost"
                size="icon"
                className="size-11"
                disabled={busy}
                onPress={() => onOpenVisibility(account)}
                accessibilityLabel={`Visibility of ${account.name}: ${level}`}
                accessibilityHint="Opens the visibility levels"
                accessibilityState={{ disabled: busy }}>
                <Icon as={LEVEL_ICON[level]} size={16} className="text-muted-foreground" />
              </Button>
            ) : null}
            {onMembers ? (
              <Button
                variant="ghost"
                size="icon"
                className="size-11"
                onPress={() => onMembers(account)}
                accessibilityLabel={`People on ${account.name}`}>
                <Icon as={Users} size={16} className="text-muted-foreground" />
              </Button>
            ) : null}
            {onEdit && owner ? (
              <Button
                variant="ghost"
                size="icon"
                className="size-11"
                onPress={() => onEdit(account)}
                accessibilityLabel={`Edit ${account.name}`}>
                <Icon as={Pencil} size={16} className="text-muted-foreground" />
              </Button>
            ) : null}
            {onArchive && owner ? (
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
        // The eye beside Edit saves the choice; no second, temporary one here.
        <HideableAmount account={account} currency={account.currency} toggle={false} className="text-2xl font-semibold leading-8">
          <MoneyAmount
            amount={balance}
            currency={account.currency}
            // Zero is neither good nor bad: plain text, not green.
            colorBySign={!isZero}
            className="text-2xl font-semibold leading-8"
          />
        </HideableAmount>
      )}
    </Card>
  );
}
