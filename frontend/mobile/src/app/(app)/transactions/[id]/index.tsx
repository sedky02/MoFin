import { useLocalSearchParams } from 'expo-router';

import { ErrorState } from '@/components/common/states';
import { TransactionDetail } from '@/components/transactions/transaction-detail';
import { isTransactionId } from '@/lib/deep-links';

export default function TransactionScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  // The id goes straight into an API path, so anything that is not a plain id never reaches it.
  if (!isTransactionId(id)) return <ErrorState title="Transaction not found" />;
  return <TransactionDetail id={id} />;
}
