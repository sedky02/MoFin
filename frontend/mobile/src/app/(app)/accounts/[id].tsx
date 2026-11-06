import { useLocalSearchParams } from 'expo-router';

import { AccountPeopleScreen } from '@/components/accounts/account-people-screen';

export default function AccountPeopleRoute() {
  const { id } = useLocalSearchParams<{ id: string }>();
  return <AccountPeopleScreen accountId={id} />;
}
