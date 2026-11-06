import { router } from 'expo-router';
import { View } from 'react-native';

import { Button } from '@/components/ui/button';
import { Icon } from '@/components/ui/icon';
import { Text } from '@/components/ui/text';
import { memberName } from '@/core/account-sharing';
import { useOwnedSharedAccounts } from '@/hooks/useAccountSharing';
import { AlertTriangle } from '@/lib/icons';

/**
 * Deleting what you own takes shared accounts away from the people on them. Says who, and offers
 * the way out: pass each account to one of them first, from its People screen.
 */
export function SharedAccountsWarning({ enabled, onLeave }: { enabled: boolean; onLeave: () => void }) {
  const { data: accounts = [] } = useOwnedSharedAccounts(enabled);
  if (accounts.length === 0) return null;
  return (
    <View role="alert" className="gap-2 rounded-lg border border-destructive/30 bg-destructive/10 px-3.5 py-3">
      <View className="flex-row items-center gap-2">
        <Icon as={AlertTriangle} size={16} aria-hidden className="text-destructive" />
        <Text className="text-sm font-medium text-destructive">Other people use accounts you own</Text>
      </View>
      {accounts.map((account) => (
        <Text key={account.id} className="text-sm">
          <Text className="text-sm font-medium">{account.name}</Text>: {account.members.map(memberName).join(', ')}
        </Text>
      ))}
      <Text className="text-sm">These accounts will be deleted for them too. To keep them going, pass ownership to someone on each account first.</Text>
      <Button
        variant="outline"
        className="min-h-11"
        onPress={() => {
          onLeave();
          router.push('/accounts');
        }}>
        <Text>Go to accounts</Text>
      </Button>
    </View>
  );
}
