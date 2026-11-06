import * as React from 'react';
import { Pressable, View } from 'react-native';

import { Icon } from '@/components/ui/icon';
import { Text } from '@/components/ui/text';
import { isAmountHidden, MASKED_AMOUNT } from '@/core/account-privacy';
import type { Account } from '@/core/types';
import { useRevealedAmount } from '@/hooks/use-revealed-amount';
import { Eye, EyeOff } from '@/lib/icons';
import { cn } from '@/lib/utils';

/**
 * An account's amount, or dots when the user hid that account's amounts, with an eye button to
 * show or hide it again (until the app restarts). Accounts that aren't hidden render `children`
 * unchanged, with no button. Same behaviour as the web's HideableAmount.
 */
export function HideableAmount({
  account,
  currency,
  className,
  toggle = true,
  children,
}: {
  account: Pick<Account, 'id' | 'name' | 'metadata'> | undefined;
  currency: string;
  /** The eye button that reveals the amount until restart. Off where the saved choice has its own button. */
  toggle?: boolean;
  /** For the dots: the same type size as the amount they stand for. */
  className?: string;
  children: React.ReactNode;
}) {
  const [revealed, setRevealed] = useRevealedAmount(account?.id);
  if (!account || !isAmountHidden(account)) return <>{children}</>;
  return (
    <View className="flex-row items-center gap-1">
      {revealed && toggle ? (
        children
      ) : (
        <Text className={cn('tabular-nums', className)} accessibilityLabel={`${account.name} balance hidden`}>
          {MASKED_AMOUNT} {currency}
        </Text>
      )}
      {toggle ? (
        <Pressable
          role="button"
          accessibilityLabel={revealed ? `Hide the balance of ${account.name}` : `Show the balance of ${account.name}`}
          accessibilityState={{ selected: revealed }}
          onPress={() => setRevealed(!revealed)}
          hitSlop={4}
          className="size-11 items-center justify-center rounded-full active:bg-accent">
          <Icon as={revealed ? EyeOff : Eye} size={18} className="text-muted-foreground" />
        </Pressable>
      ) : null}
    </View>
  );
}
