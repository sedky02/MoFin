import { Stack, useLocalSearchParams } from 'expo-router';

import { ErrorState } from '@/components/common/states';
import { TransactionForm } from '@/components/transactions/transaction-form';
import { isTransactionId } from '@/lib/deep-links';

export default function EditTransactionScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  if (!isTransactionId(id)) return <ErrorState title="Transaction not found" />;
  return (
    <>
      <Stack.Screen options={{ title: 'Edit transaction' }} />
      <TransactionForm mode="edit" transactionId={id} />
    </>
  );
}
