import { Stack, useLocalSearchParams } from 'expo-router';

import { TransactionForm } from '@/components/transactions/transaction-form';

// Pushed from a transaction's page. Saving goes back to it.
export default function EditTransactionScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  return (
    <>
      <Stack.Screen options={{ title: 'Edit Transaction' }} />
      <TransactionForm mode="edit" transactionId={id} />
    </>
  );
}
