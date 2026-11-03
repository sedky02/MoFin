import { Stack, useLocalSearchParams } from 'expo-router';

import { ErrorState } from '@/components/common/states';
import { TransactionForm } from '@/components/transactions/transaction-form';
import { isTransactionId } from '@/lib/deep-links';

// Pushed from a transaction's page. Saving goes back to it.
export default function EditTransactionScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  if (!isTransactionId(id)) return <ErrorState title="Transaction not found" />;
  return (
    <>
      <Stack.Screen options={{ title: 'Edit Transaction' }} />
      <TransactionForm mode="edit" transactionId={id} />
    </>
  );
}
