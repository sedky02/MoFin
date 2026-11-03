import { Check } from 'lucide-react-native';
import { View } from 'react-native';

import { Button } from '@/components/ui/button';
import { Icon } from '@/components/ui/icon';
import { Text } from '@/components/ui/text';
import type { Account } from '@/core/types';

export function accountsRecap(accounts: Account[]): string {
  const [only] = accounts;
  return accounts.length === 1 ? `${only.name} (${only.currency}) is ready.` : `${accounts.length} accounts are ready.`;
}

/**
 * Step 2 of the setup: record the first transaction, or skip it.
 *
 * SLOT: the transaction form (src/components/transactions/transaction-form.tsx) is built by
 * another phase; the orchestrator replaces the placeholder card below with it. Whatever is
 * rendered there should call `skip` or leave the setup by recording something: the setup ends
 * by itself once a transaction exists (see useSetup).
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
      {/* SLOT: transaction form goes here. */}
      <View testID="setup-transaction-slot" className="items-center rounded-xl border border-dashed border-border px-4 py-10">
        <Text className="text-sm text-muted-foreground">Transaction form lands here</Text>
      </View>
      <Button variant="ghost" size="lg" accessibilityLabel="Skip for now" onPress={skip}>
        <Text className="text-muted-foreground">Skip for now</Text>
      </Button>
    </View>
  );
}
