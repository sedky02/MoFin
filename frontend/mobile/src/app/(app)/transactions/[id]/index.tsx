import { useLocalSearchParams } from 'expo-router';

import { TransactionDetail } from '@/components/transactions/transaction-detail';

export default function TransactionScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  return <TransactionDetail id={id} />;
}
