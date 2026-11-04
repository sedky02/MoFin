import { router, Stack } from 'expo-router';
import { Pressable } from 'react-native';

import { TransactionForm } from '@/components/transactions/transaction-form';
import { Icon } from '@/components/ui/icon';
import { Text } from '@/components/ui/text';
import { Sparkles } from '@/lib/icons';

// A sheet over the tabs ((app)/_layout.tsx), closed with the header's ✕. Saving closes it; the
// toast offers Undo and View. "Describe it" hands over to AI drafts for people who'd rather type a sentence.
export default function NewTransactionScreen() {
  return (
    <>
      <Stack.Screen
        options={{
          headerRight: () => (
            <Pressable
              role="link"
              accessibilityLabel="Describe it instead: MoFin drafts it for you"
              onPress={() => router.replace({ pathname: '/drafts', params: { compose: '1' } })}
              className="min-h-10 flex-row items-center gap-1.5 rounded-full bg-primary/15 px-3.5 active:opacity-70">
              <Icon as={Sparkles} size={16} aria-hidden className="text-primary-text" />
              <Text className="text-sm font-semibold text-primary-text">Describe it</Text>
            </Pressable>
          ),
        }}
      />
      <TransactionForm mode="create" />
    </>
  );
}
