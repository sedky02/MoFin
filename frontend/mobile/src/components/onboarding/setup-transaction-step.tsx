import { Check } from 'lucide-react-native';
import { View } from 'react-native';

import { TransactionForm } from '@/components/transactions/transaction-form';
import { Button } from '@/components/ui/button';
import { Icon } from '@/components/ui/icon';
import { Text } from '@/components/ui/text';
import type { Account } from '@/core/types';

const noop = () => {};

export function accountsRecap(accounts: Account[]): string {
  const [only] = accounts;
  return accounts.length === 1 ? `${only.name} (${only.currency}) is ready.` : `${accounts.length} accounts are ready.`;
}

/**
 * Step 2 of the setup: record the first transaction, or skip it. The setup ends by itself once a
 * transaction exists (useSetup), so saving needs no navigation here: `onSaved` is a no-op that
 * only stops the form from going back.
 */
export function SetupTransactionStep({ accounts, skip }: { accounts: Account[]; skip: () => void }) {
  return (
    <View className="gap-4">
      <View className="flex-row items-center gap-2">
        <View className="size-5 items-center justify-center rounded-full bg-primary">
          <Icon as={Check} size={12} strokeWidth={3} aria-hidden className="text-primary-foreground" />
        </View>
        <Text className="flex-1 text-sm text-muted-foreground">{accountsRecap(accounts)}</Text>
      </View>
      <TransactionForm compact onSaved={noop} />
      <Button variant="ghost" size="lg" accessibilityLabel="Skip for now" onPress={skip}>
        <Text className="text-muted-foreground">Skip for now</Text>
      </Button>
    </View>
  );
}
