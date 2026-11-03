import { router, Stack } from 'expo-router';

import { TransactionForm } from '@/components/transactions/transaction-form';
import { Button } from '@/components/ui/button';
import { Text } from '@/components/ui/text';

// Presented as a modal over the tabs ((app)/_layout.tsx). Saving closes it; the toast offers Undo and View.
export default function NewTransactionScreen() {
  return (
    <>
      <Stack.Screen
        options={{
          headerLeft: () => (
            <Button
              variant="ghost"
              size="sm"
              className="min-h-11 px-2"
              accessibilityLabel="Cancel"
              onPress={() => (router.canGoBack() ? router.back() : router.replace('/dashboard'))}>
              <Text className="text-base">Cancel</Text>
            </Button>
          ),
        }}
      />
      <TransactionForm mode="create" />
    </>
  );
}
