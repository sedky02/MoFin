import { ReceiptText } from 'lucide-react-native';

import { PlaceholderScreen } from '@/components/shell/placeholder-screen';

// Placeholder: the transaction list is built in a later phase.
export default function TransactionsScreen() {
  return <PlaceholderScreen tabs icon={ReceiptText} title="Transactions" description="Your transactions will appear here." />;
}
